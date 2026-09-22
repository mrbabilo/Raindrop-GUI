//! Les tests de POST /unrestore, extraits de raindrops.test.ts (plafond dur
//! de 400 lignes ; frontière naturelle : la restauration est le seul
//! consommateur de `direct.unrestore`, le reste du fichier n'exerce pas ce
//! chemin). Harnais recopié à dessein : ce que ces tests montent (direct
//! espion + origines factices) n'est pas ce que les écritures montent.

import { repertoireTemporaire } from "../../testing/tmp.js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Hono } from "hono";
import { join } from "node:path";
import { createApp } from "../app.js";
import type { SidecarDeps } from "../deps.js";
import { connectFake } from "../../testing/fakeServer.js";
import { McpConnection } from "../../mcp/connection.js";
import { makeOriginStore } from "../../trash/origins.js";

let conn: McpConnection;
let baseDeps: SidecarDeps;

const TOKEN = "test-token";
const req = async (hono: Hono, path: string, init?: RequestInit, token: string = TOKEN): Promise<Response> =>
  hono.request(path, { ...init, headers: { Authorization: `Bearer ${token}` } });

const makeOriginsFake = (journal: string[], initial?: Map<number, number>) => {
  const map = new Map(initial);
  const store = {
    remember: async (id: number, collectionId: number) => {
      journal.push(`remember:${id}:${collectionId}`);
      map.set(id, collectionId);
    },
    take: async (ids: number[]) => {
      const known = new Map<number, number>();
      const unknown: number[] = [];
      for (const id of ids) {
        const dest = map.get(id);
        if (dest === undefined) unknown.push(id);
        else known.set(id, dest);
      }
      return { known, unknown };
    },
    forget: async (ids: number[]) => {
      journal.push(`forget:${ids.join(",")}`);
      for (const id of ids) map.delete(id);
    },
    flush: async () => undefined,
  };
  return { map, store: store as unknown as SidecarDeps["origins"] };
};

const unrestoreDirect = (calls: [number[], number][], failTo?: number) => ({
  updateRaindropUrl: async () => ({ ok: true as const, data: { id: 1 } }),
  unrestore: async (ids: number[], toCollectionId: number) => {
    calls.push([ids, toCollectionId]);
    if (toCollectionId === failTo) return { ok: false as const, code: "RAINDROP_API" as const, message: "http 500" };
    return { ok: true as const, data: { restored: ids.length } };
  },
});

const unrestoreApp = (calls: [number[], number][], origins: ReturnType<typeof makeOriginsFake>, failTo?: number): Hono =>
  createApp({ ...baseDeps, direct: unrestoreDirect(calls, failTo), origins: origins.store }, { localToken: TOKEN });

const brokenOrigins = () => makeOriginStore({ file: join(repertoireTemporaire("origines-ko-"), "pas-de-rep", "origins.json") });

beforeEach(async () => {
  const fake = await connectFake({ raindropCount: 30 });
  conn = McpConnection.fromClient(fake.client);
  baseDeps = {
    mcp: (tool, args, timeoutMs) => conn.call(tool, args, timeoutMs),
    state: () => "connected",
    restart: async () => undefined,
    jobs: { get: () => undefined, list: () => [] } as unknown as SidecarDeps["jobs"],
    cache: {} as SidecarDeps["cache"],
    smartlists: {} as SidecarDeps["smartlists"],
    scanner: { startScan: () => "", isRunning: () => false } as unknown as SidecarDeps["scanner"],
    direct: unrestoreDirect([]),
    origins: makeOriginsFake([]).store,
    journal: { info: () => undefined, warn: () => undefined, error: () => undefined },
    logsDir: "/non-existant",
  };
});
afterEach(async () => conn.close());

describe("routes raindrops — la restauration (POST /unrestore)", () => {
  it("POST /unrestore avec toCollectionId : un appel, origines oubliées, unknown:[]", async () => {
    const calls: [number[], number][] = [];
    const origins = makeOriginsFake([], new Map([[1000, 5]]));
    const res = await req(unrestoreApp(calls, origins), "/api/raindrops/unrestore", {
      method: "POST",
      body: JSON.stringify({ ids: [1000, 1002], toCollectionId: 9 }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ restored: 2, unknown: [] });
    expect(calls).toEqual([[[1000, 1002], 9]]);
    expect(origins.map.has(1000)).toBe(false); // forget des ids restaurés
  });

  it("POST /unrestore avec destination et écriture du store impossible → 200, forget avalé", async () => {
    const calls: [number[], number][] = [];
    const store = brokenOrigins();
    // préchauffe la MÉMOIRE (le disque est KO) : sinon forget n'a rien à retirer
    // et ne déclenche jamais l'écriture qui doit être avalée
    await store.remember(1000, 9).catch(() => undefined);
    await store.remember(1002, 9).catch(() => undefined);
    const res = await req(
      createApp({ ...baseDeps, direct: unrestoreDirect(calls), origins: store }, { localToken: TOKEN }),
      "/api/raindrops/unrestore",
      { method: "POST", body: JSON.stringify({ ids: [1000, 1002], toCollectionId: 9 }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ restored: 2, unknown: [] });
  });

  it("POST /unrestore sans destination : un appel par origine, unknown renvoyé tel quel", async () => {
    const calls: [number[], number][] = [];
    const origins = makeOriginsFake([], new Map([[1000, 5], [1001, 5], [1002, 7]]));
    const res = await req(unrestoreApp(calls, origins), "/api/raindrops/unrestore", {
      method: "POST",
      body: JSON.stringify({ ids: [1000, 1001, 1002, 1003] }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ restored: 3, unknown: [1003] });
    // les groupes passent par la file (throttle 550 ms en prod), l'un après l'autre
    expect(calls).toEqual([[[1000, 1001], 5], [[1002], 7]]);
    expect(origins.map.has(1000)).toBe(false);
    expect(origins.map.has(1002)).toBe(false);
    expect(origins.map.get(1003)).toBeUndefined();
  });

  it("échec d'une destination : origines du groupe en échec conservées (retry possible)", async () => {
    const calls: [number[], number][] = [];
    const origins = makeOriginsFake([], new Map([[1000, 5], [1002, 7]]));
    const res = await req(unrestoreApp(calls, origins, 7), "/api/raindrops/unrestore", {
      method: "POST",
      body: JSON.stringify({ ids: [1000, 1002] }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ restored: 1, unknown: [] });
    expect(origins.map.get(1002)).toBe(7); // PAS forget — sinon irrécupérable à l'origine
    expect(origins.map.has(1000)).toBe(false);
  });

  it("POST /unrestore avec toCollectionId en échec → erreur, origines conservées", async () => {
    const calls: [number[], number][] = [];
    const origins = makeOriginsFake([], new Map([[1000, 5]]));
    const res = await req(unrestoreApp(calls, origins, 9), "/api/raindrops/unrestore", {
      method: "POST",
      body: JSON.stringify({ ids: [1000, 1001], toCollectionId: 9 }),
    });
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("RAINDROP_API");
    expect(origins.map.get(1000)).toBe(5);
  });

  it("POST /unrestore exige ids non vides (400)", async () => {
    const res = await req(unrestoreApp([], makeOriginsFake([])), "/api/raindrops/unrestore", {
      method: "POST",
      body: JSON.stringify({ ids: [] }),
    });
    expect(res.status).toBe(400);
  });
});

// La route dedupe : câblage du job, validation du corps.
