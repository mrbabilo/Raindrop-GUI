import { repertoireTemporaire } from "../../testing/tmp.js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import type { Hono } from "hono";
import { createApp } from "../app.js";
import type { SidecarDeps } from "../deps.js";
import { connectFake } from "../../testing/fakeServer.js";
import { McpConnection } from "../../mcp/connection.js";
import { JobStore } from "../../jobs/store.js";
import { AnalysisCache } from "../../analysis/cache.js";
import { Scanner } from "../../analysis/scanner.js";
import { filtrerGeneriques } from "../../analysis/duplicates.js";
import type { LinkCheckResult, RaindropItem } from "../../../shared/types.js";

let conn: McpConnection;
let app: Hono;
let jobs: JobStore;
let cache: AnalysisCache;
let scanner: Scanner;

// Adaptation brief : l'API locale est derrière l'auth Bearer (Task 7, spec §3.7)
// → chaque requête du test fournit le token local (même motif que app.test.ts).
const TOKEN = "t";
const req = async (hono: Hono, path: string, init?: RequestInit): Promise<Response> =>
  hono.request(path, { ...init, headers: { Authorization: `Bearer ${TOKEN}` } });

beforeEach(async () => {
  const fake = await connectFake({ raindropCount: 20 });
  conn = McpConnection.fromClient(fake.client);
  jobs = new JobStore();
  cache = await AnalysisCache.load(join(repertoireTemporaire("ra-"), "analysis.json"));
  scanner = new Scanner({
    mcp: (t, a) => conn.call(t, a),
    jobs,
    cache,
    check: async (url) => ({ url, status: "ok", httpStatus: 200, redirectChain: null, finalUrl: null, redirectKind: null, reason: null }),
    concurrency: 5,
    ttlDays: 30,
  });
  const deps: SidecarDeps = {
    mcp: (t, a, tms) => conn.call(t, a, tms),
    state: () => "connected",
    restart: async () => undefined,
    jobs,
    cache,
    scanner,
    direct: {
      updateRaindropUrl: async () => ({ ok: true as const, data: { id: 1 } }),
      unrestore: async () => ({ ok: true as const, data: { restored: 0 } }),
    },
    origins: {
      remember: async () => undefined,
      take: async () => ({ known: new Map(), unknown: [] }),
      forget: async () => undefined,
      flush: async () => undefined,
    } as unknown as SidecarDeps["origins"],
    smartlists: {} as SidecarDeps["smartlists"],
    journal: { info: () => undefined, warn: () => undefined, error: () => undefined },
    logsDir: "/non-existant",
  };
  app = createApp(deps, { localToken: TOKEN });
});
afterEach(async () => conn.close());

describe("routes analyse", () => {
  it("POST /scan lançe un job, GET /status le reflète une fois terminé", async () => {
    const res = await req(app, "/api/analysis/scan", {
      method: "POST",
      body: JSON.stringify({ type: "duplicates" }),
    });
    expect(res.status).toBe(202);
    const { jobId } = (await res.json()) as { jobId: string };

    let done = false;
    for (let i = 0; i < 200 && !done; i++) {
      const s = (await (await req(app, `/api/jobs/${jobId}`)).json()) as { status: string };
      done = s.status === "done";
      if (!done) await new Promise((r) => setTimeout(r, 25));
    }
    expect(done).toBe(true);

    const status = (await (await req(app, "/api/analysis/status")).json()) as {
      duplicates: { lastScan: string | null; running: boolean };
    };
    expect(status.duplicates.lastScan).toBeTruthy();
    expect(status.duplicates.running).toBe(false);
  });

  it("POST /scan refuse un type inconnu (400)", async () => {
    const res = await req(app, "/api/analysis/scan", { method: "POST", body: JSON.stringify({ type: "magie" }) });
    expect(res.status).toBe(400);
  });

  // La garde de ré-entrance n'est pas une saisie invalide : un 400
  // « INVALID_INPUT » sur « scan déjà en cours » étiquette mal la panne
  // (le message écran restait juste, le code mentait).
  it("POST /scan pendant un scan en cours : 409 SCAN_EN_COURS", async () => {
    const bloque = createApp(
      { ...({ mcp: () => new Promise<never>(() => undefined) }) as unknown as SidecarDeps,
        state: () => "connected",
        restart: async () => undefined,
        jobs,
        cache,
        scanner,
      } as unknown as SidecarDeps,
      { localToken: TOKEN },
    );
    await req(bloque, "/api/analysis/scan", { method: "POST", body: JSON.stringify({ type: "links" }) });
    const res = await req(bloque, "/api/analysis/scan", { method: "POST", body: JSON.stringify({ type: "links" }) });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("SCAN_EN_COURS");
  });

  it("GET /results/duplicates renvoie les groupes", async () => {
    await req(app, "/api/analysis/scan", { method: "POST", body: JSON.stringify({ type: "duplicates" }) });
    await new Promise((r) => setTimeout(r, 400));
    const res = await req(app, "/api/analysis/results/duplicates");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { exact: unknown[]; normalized: unknown[]; fuzzy: unknown[] };
    expect(body).toHaveProperty("exact");
  });

  it("GET /results/links pagine et enrichit du titre", async () => {
    await req(app, "/api/analysis/scan", { method: "POST", body: JSON.stringify({ type: "links" }) });
    await new Promise((r) => setTimeout(r, 600));
    const res = await req(app, "/api/analysis/results/links?page=0&per_page=10");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { title: string; url: string; status: string }[]; total: number };
    expect(body.items.length).toBe(10);
    expect(body.items[0]!.title).toBeTruthy();
  });
});

// La signalétique d'état de la liste principale : un diagnostic PAR SIGNET,
// et une précédence quand il y en a deux.
describe("GET /etats — les diagnostics de la liste principale", () => {
  const item = (id: number, url: string) =>
    ({ id, url, title: `t${id}`, collectionId: 7 }) as unknown as RaindropItem;
  const resultat = (url: string, status: string) =>
    ({
      raindropId: 1, url, status, httpStatus: status === "dead" ? 404 : 200,
      redirectChain: null, finalUrl: null, redirectKind: null, reason: null,
      checkedAt: new Date().toISOString(),
    }) as unknown as LinkCheckResult;

  it("ne transmet QUE les signets diagnostiqués", async () => {
    cache.setItemsIndex([item(1, "https://sain.example"), item(2, "https://mort.example")]);
    cache.setResult(resultat("https://sain.example", "ok"));
    cache.setResult(resultat("https://mort.example", "dead"));
    const body = (await (await req(app, "/api/analysis/etats")).json()) as { etats: Record<string, string> };
    // Un lien sain ne porte aucune marque (DESIGN.md §5) : rien à dire, donc
    // rien à transmettre. La charge suit les PROBLÈMES, pas la bibliothèque.
    expect(body.etats).toEqual({ "2": "dead" });
  });

  // Le diagnostic orphelin (URL dont plus aucun signet connu ne porte) se
  // voit — choix du 2026-09-19 — mais il doit se DIRE : sans la marque, une
  // ligne sans titre ni collection proposait des actions qui ne peuvent plus
  // aboutir, et le front ne pouvait pas l'écarter de « Tout sélectionner ».
  it("une URL sans signet connu sort marquée orphelin", async () => {
    cache.setResult({ url: "https://perdue.example/fini", status: "dead", httpStatus: 404, redirectChain: null, finalUrl: null, redirectKind: null, reason: "http_404", checkedAt: "2026-09-20T00:00:00Z", raindropId: 9_999 });
    cache.setResult({ url: "https://autre.example/x", status: "ok", httpStatus: 200, redirectChain: null, finalUrl: null, redirectKind: null, reason: null, checkedAt: "2026-09-20T00:00:00Z", raindropId: 5 });
    cache.setItemsIndex([{ id: 5, url: "https://autre.example/x", title: "Autre", collectionId: 7, created: "2025-01-01T00:00:00Z", lastUpdate: "2025-01-01T00:00:00Z", tags: [], type: "link", cover: null, important: false, excerpt: "", note: "", domain: "autre.example", highlights: [] } as unknown as RaindropItem]);
    const res = await req(app, "/api/analysis/results/links"); // all : le verdict ok du non-orphelin y figure aussi
    const body = (await res.json()) as { items: { orphelin?: boolean; title: string }[] };
    const perdue = body.items.find((i) => i.title === "https://perdue.example/fini");
    expect(perdue).toBeDefined();
    expect(perdue?.orphelin).toBe(true);
    const autre = body.items.find((i) => i.title === "Autre");
    expect(autre?.orphelin).toBe(false);
  });

  it("trois signets sur une URL morte reçoivent TOUS leur marque", async () => {
    cache.setItemsIndex([item(1, "https://m.example"), item(2, "https://m.example"), item(3, "https://m.example")]);
    cache.setResult(resultat("https://m.example", "dead"));
    const body = (await (await req(app, "/api/analysis/etats")).json()) as { etats: Record<string, string> };
    expect(body.etats).toEqual({ "1": "dead", "2": "dead", "3": "dead" });
  });

  it("mort ET doublon : « mort » l'emporte", async () => {
    // La précédence est le seul contrat qu'un test puisse perdre en silence :
    // sans elle, la ligne porterait le double trait du doublon et le lien
    // cassé disparaîtrait de l'écran.
    cache.setItemsIndex([item(1, "https://m.example"), item(2, "https://m.example")]);
    cache.setGroups({
      exact: [{ key: "k", kind: "exact", items: [item(1, "https://m.example"), item(2, "https://m.example")] }],
      normalized: [], fuzzy: [],
    } as never);
    // D'abord la présence du doublon seul — sinon l'assertion suivante ne
    // prouverait pas que quelque chose a été écrasé.
    const avant = (await (await req(app, "/api/analysis/etats")).json()) as { etats: Record<string, string> };
    expect(avant.etats).toEqual({ "1": "duplicate", "2": "duplicate" });
    cache.setResult(resultat("https://m.example", "dead"));
    const apres = (await (await req(app, "/api/analysis/etats")).json()) as { etats: Record<string, string> };
    expect(apres.etats).toEqual({ "1": "dead", "2": "dead" });
  });
});

// Le filtre à la LECTURE des groupes génériques : sans lui, les caches
// antérieurs à la correction gardaient leur pollution jusqu'à un re-scan.
// Le câblage ne peut pas se tester depuis la fonction pure — sabotage prouvé.
describe("GET /results/duplicates — le filtre de lecture est CÂBLÉ", () => {
  it("un groupe générique stocké dans le cache ne sort pas", async () => {
    cache.setGroups({
      exact: [],
      normalized: [],
      fuzzy: [
        { key: "korben.info|weiterleitungshinweis", kind: "fuzzy", items: [
          { id: 1, url: "https://korben.info/a", title: "Weiterleitungshinweis", collectionId: 1, created: "2020-01-01T00:00:00.000Z" },
          { id: 2, url: "https://korben.info/b", title: "Weiterleitungshinweis", collectionId: 1, created: "2020-01-01T00:00:00.000Z" },
        ] },
        { key: "exemple.org|vrai titre", kind: "fuzzy", items: [
          { id: 3, url: "https://exemple.org/a", title: "Vrai titre", collectionId: 1, created: "2020-01-01T00:00:00.000Z" },
          { id: 4, url: "https://exemple.org/b", title: "Vrai titre", collectionId: 1, created: "2020-01-01T00:00:00.000Z" },
        ] },
      ],
    });
    const body = (await (await req(app, "/api/analysis/results/duplicates")).json()) as {
      fuzzy: { key: string }[];
    };
    // La présence d'abord : le groupe sain DOIT sortir, sinon ce test
    // célèbrerait une route qui ne rend plus rien.
    expect(body.fuzzy.map((g) => g.key)).toEqual(["exemple.org|vrai titre"]);
  });
});
