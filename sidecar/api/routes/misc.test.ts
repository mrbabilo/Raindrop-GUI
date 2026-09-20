import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Hono } from "hono";
import { createApp } from "../app.js";
import type { SidecarDeps } from "../deps.js";
import { connectFake } from "../../testing/fakeServer.js";
import { McpConnection } from "../../mcp/connection.js";

let conn: McpConnection;
let app: Hono;
// Store d'origines factice : le vidage doit appeler purge() — c'est le seul
// geste de ce fichier qui touche le store, donc un journal suffit.
const makeOriginsFake = () => {
  const journal: string[] = [];
  const vide = async () => undefined;
  const store = {
    remember: vide,
    take: async () => ({ known: new Map(), unknown: [] }),
    forget: vide,
    purge: async () => { journal.push("purge"); },
    flush: vide,
    journal,
  };
  return store as unknown as SidecarDeps["origins"] & { journal: string[] };
};

const deps = (c: McpConnection, origins = makeOriginsFake()): SidecarDeps => ({
  mcp: (tool, args, t) => c.call(tool, args, t),
  state: () => "connected",
  restart: async () => undefined,
  jobs: { get: () => undefined, list: () => [] } as unknown as SidecarDeps["jobs"],
  cache: {} as SidecarDeps["cache"],
  scanner: {} as SidecarDeps["scanner"],
  origins,
  journal: { info: () => undefined, warn: () => undefined, error: () => undefined },
  logsDir: "/non-existant",
  direct: {} as SidecarDeps["direct"],
});

// Adaptation brief : l'API locale est derrière l'auth Bearer (Task 7, spec §3.7)
// → chaque requête du test fournit le token local (même motif que raindrops.test.ts).
const TOKEN = "test-token";
const req = (hono: Hono, path: string, init?: RequestInit, token: string = TOKEN): Promise<Response> =>
  Promise.resolve(hono.request(path, { ...init, headers: { Authorization: `Bearer ${token}` } }));

beforeEach(async () => {
  const fake = await connectFake({ raindropCount: 9 });
  conn = McpConnection.fromClient(fake.client);
  app = createApp(deps(conn), { localToken: "test-token" });
});
afterEach(async () => conn.close());

describe("routes tags", () => {
  it("GET / renvoie les tags avec compteurs", async () => {
    const res = await req(app, "/api/tags");
    const body = (await res.json()) as { items: { name: string; count: number }[] };
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0]).toMatchObject({ name: expect.any(String), count: expect.any(Number) });
  });

  // Régression : l'incident d'origine (Task 7c) venait d'une lecture `.items`
  // sur une réponse MCP qui est en réalité un tableau nu. Si `{items: [...]}`
  // (l'ancienne enveloppe fausse) réapparaît un jour, ce test doit le voir.
  it("échoue bruyamment (502) si get_tags renvoie {items:[...]} au lieu d'un tableau nu", async () => {
    const badDeps: SidecarDeps = { ...deps(conn), mcp: async () => ({ ok: true, data: { items: [] } }) };
    const badApp = createApp(badDeps, { localToken: "test-token" });
    const res = await req(badApp, "/api/tags");
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("RAINDROP_API");
  });

  it("POST /manage rename exige new_name (400 sinon)", async () => {
    const res = await req(app, "/api/tags/manage", {
      method: "POST",
      body: JSON.stringify({ operation: "rename", tags: ["rust"] }),
    });
    expect(res.status).toBe(400);
  });
});

describe("routes user", () => {
  it("GET /api/user renvoie le compte", async () => {
    const res = await req(app, "/api/user");
    expect(((await res.json()) as { email: string }).email).toBe("moi@example.com");
  });

  // Le vrai `/user` de Raindrop ne porte AUCUN compte de signets (vérifié en
  // réel le 2026-09-18) : le `?? 0` qui tenait cette place fabriquait un zéro
  // affiché tel quel (« — 0 signets ») au premier lancement et au panneau de
  // sauvegarde. Le compte se DÉRIVE d'une lecture de la collection 0.
  it("le compte de signets est dérivé, pas lu du profil", async () => {
    const res = await req(app, "/api/user");
    const corps = (await res.json()) as { bookmarksCount?: number };
    // Le faux serveur porte un jeu de signets non vide : le compte dérivé
    // doit le refléter. Sans cette borne, un zéro passerait pour un succès.
    expect(corps.bookmarksCount).toBeGreaterThan(0);
  });

  it("dérivation impossible : le champ est ABSENT, jamais zéro", async () => {
    // Un zéro inventé se lit comme un fait ; l'absence, elle, se rattrape à
    // l'écran (« Compte détecté » sans chiffre).
    const fake = await connectFake({ failTools: ["search_raindrops"] });
    const sansCompte = McpConnection.fromClient(fake.client);
    const appSeul = createApp(deps(sansCompte), { localToken: TOKEN });
    const corps = (await (await req(appSeul, "/api/user")).json()) as {
      email: string;
      bookmarksCount?: number;
    };
    expect(corps.email).toBe("moi@example.com"); // le profil répond quand même
    expect("bookmarksCount" in corps).toBe(false);
    await sansCompte.close();
  });

  it("POST /api/parse-url préremplit un titre", async () => {
    const res = await req(app, "/api/parse-url", {
      method: "POST",
      body: JSON.stringify({ url: "https://example.com/a" }),
    });
    expect(((await res.json()) as { title: string }).title).toContain("example.com");
  });

  it("POST /api/check-urls détecte les existants", async () => {
    const list = (await (await req(app, "/api/raindrops?per_page=1")).json()) as { items: { url: string }[] };
    const res = await req(app, "/api/check-urls", {
      method: "POST",
      body: JSON.stringify({ urls: [list.items[0]!.url, "https://absent.example"] }),
    });
    const body = (await res.json()) as { items: { url: string; exists: boolean }[] };
    expect(body.items[0]!.exists).toBe(true);
    expect(body.items[1]!.exists).toBe(false);
  });
});

describe("routes maintenance", () => {
  it("POST /api/maintenance/empty-trash exige confirm (400)", async () => {
    const res = await req(app, "/api/maintenance/empty-trash", { method: "POST", body: "{}" });
    expect(res.status).toBe(400);
  });

  it("POST /api/maintenance/empty-trash avec confirm exécute ET purge les origines", async () => {
    // Toute origine mémorisée pointe vers un id qui n'existe plus après le
    // vidage : le store doit être purgé, sinon le fichier grossit à jamais.
    const origins = makeOriginsFake();
    app = createApp(deps(conn, origins), { localToken: TOKEN });
    const res = await req(app, "/api/maintenance/empty-trash", {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    });
    expect(res.status).toBe(200);
    expect(origins.journal).toEqual(["purge"]);
  });
});
// Pas de describe « routes highlights » : la route a été supprimée (R8cP-1 —
// elle appelait un endpoint fantôme 404 en réel) ; les highlights traversent
// GET /api/raindrops/:id (mappers.test.ts sonde la traversée).
