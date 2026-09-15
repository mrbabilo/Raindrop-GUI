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
import { JobStore } from "./jobs/store.js";
import { AnalysisCache } from "./analysis/cache.js";
import { Scanner } from "./analysis/scanner.js";
import { makeRestClient } from "./direct/raindropRest.js";
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
const preLock = await acquireLock(dataDir, { port: 0, token: cfg.LOCAL_API_TOKEN });
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
  ttlDays: cfg.ANALYSIS_TTL_DAYS,
});

const deps: SidecarDeps = {
  mcp: makeMcpCaller(lifecycle, throttle),
  state: () => lifecycle.state,
  restart: () => lifecycle.restart(),
  jobs,
  cache,
  scanner,
  direct: rest,
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
    await writeLockfile(dataDir, { port: info.port, token: cfg.LOCAL_API_TOKEN });
    logger.info("sidecar prêt", { port: info.port, mcp: lifecycle.state });
  },
);

let stopping = false;
const shutdown = async (signal: string) => {
  if (stopping) return;
  stopping = true;
  logger.info("arrêt", { signal });
  server.close();
  await lifecycle.stop();
  await clearLockfile(dataDir);
  await logger.close();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
