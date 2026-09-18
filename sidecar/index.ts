#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { loadConfig, appDataDir } from "./config.js";
import { createLogger } from "./logger.js";
import { acquireLock, clearLockfile, writeLockfile } from "./lockfile.js";
import { McpLifecycle } from "./mcp/lifecycle.js";
import { stdioFactory } from "./mcp/connection.js";
import { Throttle } from "./mcp/throttle.js";
import { makeMcpCaller, type SidecarDeps } from "./api/deps.js";
import { createApp } from "./api/app.js";
import { JobStore, runJob } from "./jobs/store.js";
import { AnalysisCache } from "./analysis/cache.js";
import { Scanner } from "./analysis/scanner.js";
import { makeRestClient } from "./direct/raindropRest.js";
import { makeOriginStore } from "./trash/origins.js";
import { makeLecture } from "./backup/lecture.js";
import { makeSauvegarde } from "./backup/sauvegarde.js";
import { makeArchivage } from "./backup/archivage.js";
import { lireManifeste } from "./backup/manifeste.js";
import { join } from "node:path";

function fail(msg: string): never {
  console.error(JSON.stringify({ level: "error", msg }));
  process.exit(1);
}

// Prérequis Node ≥ 20 (spec §3.2)
const major = Number(process.versions.node.split(".")[0]);
if (major < 20) fail(`Node >= 20 requis (trouvé: ${process.versions.node})`);

const cfg = loadConfig();
const dataDir = appDataDir(cfg);
const logger = createLogger(join(dataDir, "logs"), { level: cfg.LOG_LEVEL });
logger.info("démarrage sidecar", { node: process.versions.node, pid: process.pid });

// Lockfile : réutilisation si un sidecar vivant existe déjà (reload webview/HMR)
const preLock = await acquireLock(dataDir, { port: 0 });
if (preLock === "reused") {
  logger.warn("sidecar déjà actif (lockfile + pid vivant) — sortie");
  await logger.close();
  process.exit(0);
}

const lifecycle = new McpLifecycle({
  factory: stdioFactory(cfg.RAINDROP_MCP_ENTRY, cfg.MCP_RAINDROPIO_TOKEN),
  maxRestarts: 3,
});
lifecycle.on("state", (s) => logger.info("état MCP", { state: s }));

// Adaptation brief : le Step 5 n'appelait pas start(), or son propre test de
// fumée attend un état « crashed »/«restarting » — la connexion MCP démarre
// ici, sans jamais bloquer le bind HTTP (mode dégradé si le subprocess meurt).
void lifecycle.start().catch((e: unknown) => {
  logger.error("démarrage MCP échoué", { err: e instanceof Error ? e.message : String(e) });
});

const throttle = new Throttle(cfg.MIN_CALL_INTERVAL_MS);
const jobs = new JobStore();
// acquireLock a déjà mkdir -p dataDir : le parent d'analysis.json existe.
const cache = await AnalysisCache.load(join(dataDir, "analysis.json"));
const rest = makeRestClient({ token: cfg.MCP_RAINDROPIO_TOKEN });
// Task 14 : PAS de check injecté en prod — le checkUrl par défaut s'applique.
const scanner = new Scanner({
  mcp: (tool, args) => throttle.run(() => lifecycle.call(tool, args)),
  jobs,
  cache,
  concurrency: cfg.LINK_CONCURRENCY,
  timeoutMs: cfg.LINK_TIMEOUT_MS,
  ttlDays: cfg.ANALYSIS_TTL_DAYS,
});

// Task 0b : mémoire des origines de corbeille (restauration hybride, §4.2).
// Jamais une source de vérité : fichier absent = origines inconnues.
const origins = makeOriginStore({
  file: join(dataDir, "trash-origins.json"),
  warn: (msg, fields) => logger.warn(msg, fields),
});

// Sauvegarde locale (§4.1) : sans BACKUP_DIR elle reste INACTIVE, et la route
// le dit — le sélecteur de dossier relève du shell Tauri (§4.3). Le sous-dossier
// `Raindrop-GUI` est celui de l'arborescence §4.2 : le dossier choisi par
// l'utilisateur n'est jamais pollué à sa racine.
const dossierSauvegarde = cfg.BACKUP_DIR ? join(cfg.BACKUP_DIR, "Raindrop-GUI") : undefined;
const sauvegarde = dossierSauvegarde
  ? makeSauvegarde({
      // Lecture REST directe, sous la MÊME file que le MCP, au rang « fond ».
      lecture: makeLecture({ token: cfg.MCP_RAINDROPIO_TOKEN, file: throttle }),
      dossier: dossierSauvegarde,
      // Dette Task 6 soldée : un manifeste CORROMPU (≠ absent) laisse une
      // trace — sans quoi la Task 6 aurait construit un détecteur que rien
      // n'écoute.
      avertir: (msg, champs) => logger.warn(msg, champs),
    })
  : undefined;

// Archivage à la demande (§2) : même dossier, même condition d'activation que
// la sauvegarde. LA MÊME instance de `throttle` que le MCP et la lecture REST
// — sinon les deux files s'ignorent et le plafond partagé de 120 req/min se
// voit dépassé sans que rien ne le voie.
const archivage = dossierSauvegarde
  ? makeArchivage({
      token: cfg.MCP_RAINDROPIO_TOKEN,
      dossier: dossierSauvegarde,
      file: throttle,
    })
  : undefined;

const deps: SidecarDeps = {
  mcp: makeMcpCaller(lifecycle, throttle, { timeoutMs: cfg.MCP_TIMEOUT_MS }),
  state: () => lifecycle.state,
  restart: () => lifecycle.restart(),
  jobs,
  cache,
  scanner,
  origins,
  ...(sauvegarde ? { sauvegarde } : {}),
  ...(archivage ? { archivage } : {}),
  // REST direct sous la MÊME file que le MCP (550 ms partagées) : les appels
  // unrestore par destination sont espacés par le throttle, pas par un sleep.
  direct: {
    updateRaindropUrl: (id, url) => throttle.run(() => rest.updateRaindropUrl(id, url)),
    unrestore: (ids, toCollectionId) => throttle.run(() => rest.unrestore(ids, toCollectionId)),
  },
};

const app = createApp(deps, { localToken: cfg.LOCAL_API_TOKEN });

// Adaptation brief : serve() binde asynchronement — server.address() est null
// juste après l'appel (le test de fumée du brief donnait « bind impossible »).
// Le port réel est donc consommé dans le listeningListener de serve().
const server = serve(
  { fetch: app.fetch, hostname: "127.0.0.1", port: 0 },
  async (info) => {
    logger.info("api prête", { port: info.port });
    // réécrit le lockfile avec le port réel — acquireLock lirait son propre pid
    // vivant et renverrait "reused" sans rien écrire
    await writeLockfile(dataDir, { port: info.port });
    logger.info("sidecar prêt", { port: info.port, mcp: lifecycle.state });
  },
);

// Déclenchement au démarrage (§4.4, amendé — spec sélection §0.2) : si la
// dernière TENTATIVE date de plus de 24 h. Manifeste vide → rien : la
// première sauvegarde est explicite. Jamais bloquant — le bind HTTP ne l'attend pas, et un échec se
// journalise au lieu de tuer le sidecar.
if (sauvegarde && dossierSauvegarde) {
  void (async () => {
    const m = await lireManifeste(dossierSauvegarde, (msg) => logger.warn(msg));
    if (!sauvegarde.doitSauvegarderAuDemarrage(m, new Date())) return;
    const mode = sauvegarde.doitBalayerComplet(m, new Date()) ? "balayage" : "incremental";
    const job = runJob(jobs, "backup", 0, (j) => sauvegarde.executer(mode, j));
    logger.info("sauvegarde au démarrage", { mode, jobId: job.id });
  })().catch((e: unknown) => {
    logger.error("sauvegarde au démarrage impossible", { err: e instanceof Error ? e.message : String(e) });
  });
}

let stopping = false;
const shutdown = async (signal: string) => {
  if (stopping) return;
  stopping = true;
  logger.info("arrêt", { signal });
  server.close();
  await origins.flush(); // ne rien perdre d'une mémorisation en vol (§4.2)
  await lifecycle.stop();
  await clearLockfile(dataDir);
  await logger.close();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
