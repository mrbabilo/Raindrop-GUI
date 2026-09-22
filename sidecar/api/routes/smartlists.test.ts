import { describe, it, expect } from "vitest";
import { createApp } from "../app.js";
import type { SidecarDeps } from "../deps.js";
import { makeSmartListStore } from "../../smartlists/store.js";
import { JobStore } from "../../jobs/store.js";
import { repertoireTemporaire } from "../../testing/tmp.js";

const TOKEN = "t";

const deps = (): SidecarDeps => ({
  mcp: async () => ({ ok: true as const, data: {} }),
  state: () => "connected",
  restart: async () => undefined,
  jobs: new JobStore(),
  cache: {} as SidecarDeps["cache"],
  scanner: {} as SidecarDeps["scanner"],
  origins: {} as SidecarDeps["origins"],
  smartlists: makeSmartListStore({ file: `${repertoireTemporaire("sl-route-")}/smartlists.json` }),
  direct: {} as SidecarDeps["direct"],
  journal: { info: () => undefined, warn: () => undefined, error: () => undefined },
  logsDir: repertoireTemporaire("sl-logs-"),
});

// Chaque test a SON app (donc SON dépôt neuf) : les requêtes D'UN test se
// voient, celles des autres non. `app()` renvoie le req lié à cette app.
const app = () => {
  const hono = createApp(deps(), { localToken: TOKEN });
  return async (method: string, path: string, corps?: unknown): Promise<Response> =>
    hono.request(path, {
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        ...(corps !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: corps !== undefined ? JSON.stringify(corps) : undefined,
    });
};

describe("/api/smartlists", () => {
  it("POST crée : id préfixé sl-, cree posée, le front n'a pas voix dessus", async () => {
    const req = app();
    const res = await req("POST", "/api/smartlists", { label: "Rust", vue: { collectionId: 0, tags: ["rust"] } });
    expect(res.status).toBe(200);
    const sl = (await res.json()) as { id: string; label: string; cree: string; vue: { collectionId: number } };
    expect(sl.id).toMatch(/^sl-/);
    expect(sl.cree).not.toBe("");
    expect(sl.vue).toEqual({ collectionId: 0, tags: ["rust"] });
  });

  it("GET rend la collection au format {items}", async () => {
    const req = app();
    await req("POST", "/api/smartlists", { label: "Rust", vue: { collectionId: 0 } });
    await req("POST", "/api/smartlists", { label: "Design", vue: { collectionId: 101, search: "affiche" } });
    const res = await req("GET", "/api/smartlists");
    expect(res.status).toBe(200);
    const corps = (await res.json()) as { items: { label: string }[] };
    expect(corps.items.map((s) => s.label)).toEqual(["Rust", "Design"]);
  });

  it("PATCH renomme ; id inconnu → 404 NOT_FOUND", async () => {
    const req = app();
    const cree = (await (await req("POST", "/api/smartlists", { label: "Rust", vue: { collectionId: 0 } })).json()) as {
      id: string;
    };
    const maj = await req("PATCH", `/api/smartlists/${cree.id}`, { label: "Rust web" });
    expect(maj.status).toBe(200);
    expect(((await maj.json()) as { label: string }).label).toBe("Rust web");
    // La modification persiste : un GET de la même app la lit.
    const liste = (await (await req("GET", "/api/smartlists")).json()) as { items: { label: string }[] };
    expect(liste.items[0]!.label).toBe("Rust web");

    const inconnu = await req("PATCH", "/api/smartlists/sl-inconnu", { label: "x" });
    expect(inconnu.status).toBe(404);
    expect(((await inconnu.json()) as { error: { code: string } }).error.code).toBe("NOT_FOUND");
  });

  it("DELETE supprime ; id inconnu → 404", async () => {
    const req = app();
    const cree = (await (await req("POST", "/api/smartlists", { label: "Rust", vue: { collectionId: 0 } })).json()) as {
      id: string;
    };
    expect((await req("DELETE", `/api/smartlists/${cree.id}`)).status).toBe(200);
    const liste = (await (await req("GET", "/api/smartlists")).json()) as { items: unknown[] };
    expect(liste.items).toEqual([]);
    expect((await req("DELETE", `/api/smartlists/${cree.id}`)).status).toBe(404);
  });

  it("zod refuse : nom vide, nom de 81 signes, vue sans collectionId", async () => {
    const req = app();
    const vide = await req("POST", "/api/smartlists", { label: "   ", vue: { collectionId: 0 } });
    expect(vide.status).toBe(400);
    const long = await req("POST", "/api/smartlists", { label: "a".repeat(81), vue: { collectionId: 0 } });
    expect(long.status).toBe(400);
    const sansVue = await req("POST", "/api/smartlists", { label: "Rust", vue: { tags: ["rust"] } });
    expect(sansVue.status).toBe(400);
    const apres = (await (await req("GET", "/api/smartlists")).json()) as { items: unknown[] };
    expect(apres.items).toEqual([]);
  });

  it("une vue minimale « Tous » filtré est légale (collectionId seul)", async () => {
    const req = app();
    const res = await req("POST", "/api/smartlists", { label: "Tous", vue: { collectionId: 0 } });
    expect(res.status).toBe(200);
    const sl = (await res.json()) as { vue: Record<string, unknown> };
    expect(Object.keys(sl.vue)).toEqual(["collectionId"]);
  });
});
