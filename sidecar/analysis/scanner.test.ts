import { repertoireTemporaire } from "../testing/tmp.js";
import { describe, it, expect, beforeEach } from "vitest";
import { join } from "node:path";
import { connectFake } from "../testing/fakeServer.js";
import { McpConnection } from "../mcp/connection.js";
import { JobStore } from "../jobs/store.js";
import { AnalysisCache } from "./cache.js";
import { Scanner } from "./scanner.js";
import type { CheckOutcome } from "./linkchecker.js";

function makeCheck(fakeStatuses: Map<string, CheckOutcome["status"]>) {
  return async (url: string): Promise<CheckOutcome> => ({
    url,
    status: fakeStatuses.get(url) ?? "ok",
    httpStatus: fakeStatuses.get(url) === "dead" ? 404 : 200,
    redirectChain: null,
    finalUrl: null,
    redirectKind: null,
    reason: fakeStatuses.get(url) === "dead" ? "http_404" : null,
  });
}

describe("Scanner", () => {
  let conn: McpConnection;
  let store: JobStore;
  let cache: AnalysisCache;
  let file: string;

  beforeEach(async () => {
    const fake = await connectFake({ raindropCount: 25 });
    conn = McpConnection.fromClient(fake.client);
    store = new JobStore();
    file = join(repertoireTemporaire("scan-"), "analysis.json");
    cache = await AnalysisCache.load(file);
  });

  const mcpCaller = (tool: string, args: Record<string, unknown>) => conn.call(tool, args);

  it("scan-links complet : progression, cache, dernière URL du job", async () => {
    const scanner = new Scanner({
      mcp: mcpCaller,
      jobs: store,
      cache,
      check: makeCheck(new Map()),
      concurrency: 5,
      ttlDays: 30,
    });
    const jobId = scanner.startScan("links");
    const snap = await waitForStatus(store, jobId, ["done"]);
    expect(snap.status).toBe("done");
    // 26 URL DISTINCTES pour 27 signets : la fixture porte un doublon d'URL,
    // qu'on ne vérifie plus deux fois. Ce test affirmait 27 — il verrouillait
    // le gaspillage qu'on vient de retirer (son propre commentaire le disait :
    // « 25 + 2 doublons fixture »). Sur la bibliothèque réelle, ce sont 242
    // requêtes de 10 s d'économisées pour un verdict identique.
    expect(snap.progress.done).toBe(26);
    const results = cache.allResults();
    expect(results.length).toBe(26);
    // ET AUCUN SIGNET N'EST PERDU : le résultat d'une URL partagée se
    // redistribue à tous ses porteurs. C'est la moitié qui compte — sans
    // elle, « moins de requêtes » voudrait dire « moins de couverture ».
    expect(cache.resultatsParSignet().length).toBe(27);
    expect(cache.lastScan("links")).toBeTruthy();
  });

  it("scan incrémental : ne re-checke que le stale", async () => {
    let checked = 0;
    const countingCheck = async (url: string) => {
      checked++;
      return makeCheck(new Map())(url);
    };
    const scanner = new Scanner({ mcp: mcpCaller, jobs: store, cache, check: countingCheck, concurrency: 5, ttlDays: 30 });
    scanner.startScan("links");
    await waitForStatus(store, store.list()[0]!.id, ["done"]);
    const first = checked;
    expect(first).toBeGreaterThan(0);

    // 2e scan immédiat : tout est frais → aucun re-check
    const jobId2 = scanner.startScan("links");
    await waitForStatus(store, jobId2, ["done"]);
    expect(checked).toBe(first);
  });

  it("scan-duplicates trouve les doublons fixture", async () => {
    const scanner = new Scanner({ mcp: mcpCaller, jobs: store, cache, check: makeCheck(new Map()), concurrency: 5, ttlDays: 30 });
    const jobId = scanner.startScan("duplicates");
    await waitForStatus(store, jobId, ["done"]);
    const groups = cache.getGroups();
    // fixtures : 1 doublon exact (copie) + 1 copie normalisée
    expect(groups.exact.length + groups.normalized.length).toBeGreaterThanOrEqual(1);
    expect(cache.lastScan("duplicates")).toBeTruthy();
  });

  it("annulation : statut cancelled, cache partiel sauvé", async () => {
    let seen = 0;
    const slowCheck = async (url: string) => {
      seen++;
      await new Promise((r) => setTimeout(r, 30));
      return makeCheck(new Map())(url);
    };
    const scanner = new Scanner({ mcp: mcpCaller, jobs: store, cache, check: slowCheck, concurrency: 1, ttlDays: 30 });
    const jobId = scanner.startScan("links");
    // annule dès les premiers résultats
    const snap = await new Promise<ReturnType<typeof store.get>>((resolve) => {
      const id = setInterval(() => {
        const s = store.get(jobId)!;
        if (s.progress.done >= 2) {
          clearInterval(id);
          store.getHandle(jobId)!.cancel();
          const check = () => {
            const s2 = store.get(jobId)!;
            if (s2.status !== "running") resolve(s2);
            else setTimeout(check, 10);
          };
          check();
        }
      }, 10);
    });
    expect(snap!.status).toBe("cancelled");
    expect(seen).toBeLessThan(27);
    expect(cache.allResults().length).toBeGreaterThan(0); // partiel mais persisté
  });

  it("isRunning empêche un double scan du même type", async () => {
    const scanner = new Scanner({
      mcp: mcpCaller, jobs: store, cache,
      check: async (url) => { await new Promise((r) => setTimeout(r, 50)); return makeCheck(new Map())(url); },
      concurrency: 1, ttlDays: 30,
    });
    scanner.startScan("links");
    expect(() => scanner.startScan("links")).toThrow(/déjà en cours/);
    await waitForStatus(store, store.list()[0]!.id, ["done"]);
  });
});

async function waitForStatus(store: JobStore, id: string, statuses: string[]) {
  return new Promise<NonNullable<ReturnType<typeof store.get>>>((resolve, reject) => {
    const check = () => {
      const s = store.get(id);
      if (!s) return reject(new Error("job absent"));
      if (statuses.includes(s.status)) return resolve(s);
      if (s.status === "error") return reject(new Error(s.error ?? "job error"));
      setTimeout(check, 10);
    };
    check();
  });
}

// La REPRISE après coupure. Elle fonctionnait déjà par construction — les
// résultats sont persistés en cours de route et `staleUrls` exclut ce qui est
// frais — mais rien ne l'attestait, et rien ne la disait à l'écran :
// `lastScan` reste `null` tant que le scan n'est pas allé au bout, si bien que
// l'interface affichait « Dernier scan : jamais » au-dessus de milliers de
// liens déjà vérifiés.
describe("Scanner — reprise après une analyse interrompue", () => {
  let conn: McpConnection;
  let store: JobStore;
  let cache: AnalysisCache;

  beforeEach(async () => {
    const fake = await connectFake({ raindropCount: 25 });
    conn = McpConnection.fromClient(fake.client);
    store = new JobStore();
    cache = await AnalysisCache.load(join(repertoireTemporaire("reprise-"), "analysis.json"));
  });

  const mcpCaller = (tool: string, args: Record<string, unknown>) => conn.call(tool, args);

  /** Un scan qu'on coupe dès que `combien` liens sont vérifiés. */
  const scanInterrompu = async (combien: number, compteur: { n: number }) => {
    const lent = async (url: string) => {
      compteur.n++;
      await new Promise((r) => setTimeout(r, 20));
      return makeCheck(new Map())(url);
    };
    const scanner = new Scanner({ mcp: mcpCaller, jobs: store, cache, check: lent, concurrency: 1, ttlDays: 30 });
    const jobId = scanner.startScan("links");
    await new Promise<void>((resolve) => {
      const id = setInterval(() => {
        if ((store.get(jobId)?.progress.done ?? 0) >= combien) {
          clearInterval(id);
          store.getHandle(jobId)!.cancel();
          resolve();
        }
      }, 5);
    });
    await waitForStatus(store, jobId, ["cancelled", "done"]);
  };

  it("relancer ne revérifie QUE ce qui manque", async () => {
    const compteur = { n: 0 };
    await scanInterrompu(3, compteur);
    const faitsAvant = cache.allResults().length;
    // La présence d'abord : sans travail déjà acquis, « reprendre » ne
    // voudrait rien dire et le test célébrerait un vide.
    expect(faitsAvant).toBeGreaterThanOrEqual(3);
    const total = cache.avancementLiens(30).total;
    expect(faitsAvant).toBeLessThan(total);

    // Le second passage COMPTE lui aussi ses vérifications — sinon l'assertion
    // porterait sur un compteur que personne n'incrémente, et passerait au
    // vert quoi qu'il arrive.
    let refaits = 0;
    const compte = async (url: string) => {
      refaits++;
      return makeCheck(new Map())(url);
    };
    const scanner = new Scanner({
      mcp: mcpCaller, jobs: store, cache,
      check: compte, concurrency: 5, ttlDays: 30,
    });
    const jobId = scanner.startScan("links");
    await waitForStatus(store, jobId, ["done"]);
    // Le second passage ne refait QUE le reste : sans la reprise, il aurait
    // revérifié les `total` liens depuis le début.
    expect(refaits).toBe(total - faitsAvant);
    expect(cache.avancementLiens(30).verifies).toBe(total);
  });

  it("interrompue, l'analyse n'a PAS de date — mais elle a un avancement", async () => {
    const compteur = { n: 0 };
    await scanInterrompu(3, compteur);
    // `lastScan` reste nul : rien n'est terminé, et le prétendre ferait passer
    // une analyse partielle pour un bilan complet.
    expect(cache.lastScan("links")).toBeNull();
    // Mais l'avancement, lui, existe — c'est ce que l'écran affichait comme
    // « jamais », au-dessus d'un travail déjà fait.
    const av = cache.avancementLiens(30);
    expect(av.verifies).toBeGreaterThanOrEqual(3);
    expect(av.verifies).toBeLessThan(av.total);
  });

  it("un résultat PÉRIMÉ ne compte plus comme vérifié", async () => {
    const compteur = { n: 0 };
    await scanInterrompu(3, compteur);
    const frais = cache.avancementLiens(30).verifies;
    expect(frais).toBeGreaterThanOrEqual(3);

    // On VIEILLIT un résultat de 60 jours plutôt que de mettre le TTL à zéro :
    // avec un TTL nul la coupure vaut `Date.now()`, et un résultat écrit dans
    // la même milliseconde tombe pile dessus — le test dépendait alors de
    // l'horloge, ce qu'il a fini par démontrer en échouant.
    const vieux = cache.allResults()[0]!;
    cache.setResult({ ...vieux, checkedAt: new Date(Date.now() - 60 * 864e5).toISOString() });
    // Un de moins : c'est ce que le scan ira revérifier, et ce que l'écran
    // doit cesser d'annoncer comme acquis.
    expect(cache.avancementLiens(30).verifies).toBe(frais - 1);
  });
});

describe("revérification des indéterminés", () => {
  let conn: McpConnection;
  let store: JobStore;
  let cache: AnalysisCache;

  beforeEach(async () => {
    const fake = await connectFake({ raindropCount: 25 });
    conn = McpConnection.fromClient(fake.client);
    store = new JobStore();
    cache = await AnalysisCache.load(join(repertoireTemporaire("recheck-"), "analysis.json"));
  });
  const mcpCaller = (tool: string, args: Record<string, unknown>) => conn.call(tool, args);

  it("ne checke QUE les indéterminés du cache, rafraîchit leurs verdicts, ne pose PAS markScanDone", async () => {
    cache.setItemsIndex(
      [{ id: 1, url: "https://bloque.example", title: "b", collectionId: 0 }].map((x) => ({
        ...x, excerpt: "", note: "", domain: "", tags: [], created: "", lastUpdate: "",
        important: false, type: "link", cover: null, cache: null, broken: false, highlights: [],
      })),
    );
    const r = (url: string, status: CheckOutcome["status"], reason: string | null = null) => ({
      raindropId: 1, url, status, httpStatus: null,
      redirectChain: null, finalUrl: null, redirectKind: null,
      reason, checkedAt: new Date().toISOString(),
    });
    cache.setResult(r("https://bloque.example", "indeterminate", "http_403"));
    cache.setResult(r("https://saine.example", "ok"));
    cache.setResult(r("https://morte.example", "dead", "http_404"));
    const scanner = new Scanner({
      mcp: mcpCaller, jobs: store, cache,
      check: makeCheck(new Map([["https://bloque.example", "ok" as const]])),
      concurrency: 5, ttlDays: 30,
    });
    const jobId = scanner.startRecheckIndetermine();
    const snap = await waitForStatus(store, jobId, ["done"]);
    expect(snap.progress.total).toBe(1);
    expect(cache.getResult("https://bloque.example")?.status).toBe("ok");
    expect(cache.getResult("https://morte.example")?.status).toBe("dead");
    // Une revérification n'est pas un scan complet : la fraîcheur du
    // tableau de bord ne bouge pas — sinon « Relancer » croirait tout fait.
    expect(cache.lastScan("links")).toBeNull();
  });

  it("garde commune avec le scan de liens, dans les DEUX sens", async () => {
    // Tous les checks pendent jusqu'à la libération — une FILE, sinon chaque
    // appel écrase le resolve précédent et le scan ne finit jamais.
    const file = () => {
      const resolvers: (() => void)[] = [];
      let ouvert = false;
      return {
        lent: (url: string) =>
          new Promise<CheckOutcome>((resolve) => {
            const finir = () => resolve({ url, status: "ok", httpStatus: 200, redirectChain: null, finalUrl: null, redirectKind: null, reason: null });
            if (ouvert) finir();
            else resolvers.push(finir);
          }),
        taille: () => resolvers.length,
        liberer: () => {
          ouvert = true; // les arrivées TARDIVES des workers passent aussi
          resolvers.forEach((r) => r());
        },
      };
    };
    const essai = file();
    const scanner = new Scanner({ mcp: mcpCaller, jobs: store, cache, check: essai.lent, concurrency: 5, ttlDays: 30 });
    const scanId = scanner.startScan("links");
    for (let i = 0; i < 200 && essai.taille() === 0; i++) await new Promise((r) => setTimeout(r, 5));
    expect(() => scanner.startRecheckIndetermine()).toThrow(/en cours/);
    essai.liberer();
    await waitForStatus(store, scanId, ["done"]);

    // Sens inverse — et ménage : la revérification ne doit pas rester en vol.
    // Une cible, sinon le job (cache vide) finit avant l'assertion de garde.
    cache.setResult({ raindropId: 1, url: "https://a-revoir.example", status: "indeterminate", httpStatus: null, redirectChain: null, finalUrl: null, redirectKind: null, reason: "http_403", checkedAt: new Date().toISOString() });
    const essai2 = file();
    const scanner2 = new Scanner({ mcp: mcpCaller, jobs: store, cache, check: essai2.lent, concurrency: 5, ttlDays: 30 });
    const recheckId = scanner2.startRecheckIndetermine();
    for (let i = 0; i < 200 && essai2.taille() === 0; i++) await new Promise((r) => setTimeout(r, 5));
    expect(() => scanner2.startScan("links")).toThrow(/en cours/);
    essai2.liberer();
    await waitForStatus(store, recheckId, ["done"]);
  });
});
