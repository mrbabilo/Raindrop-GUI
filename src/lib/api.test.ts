import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, ApiError } from "./api";

// Sous jsdom il n'y a pas de window.RAINDROP_GUI : getConnection() suit la
// branche dev et lit le token de l'env. stubEnv patche process.env ET
// import.meta.env — aucun .env requis, le test reste hermétique.
beforeEach(() => {
  vi.stubEnv("VITE_LOCAL_API_TOKEN", "dev-local-token");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const okJson = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("api", () => {
  it("get parse le JSON et pose le Bearer", async () => {
    const f = vi.fn(async () => okJson({ items: [], count: 0 }));
    vi.stubGlobal("fetch", f);
    const out = await api.get<{ count: number }>("/api/raindrops", { per_page: 50, important: undefined });
    expect(out.count).toBe(0);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/raindrops?per_page=50"); // undefined filtré
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer dev-local-token");
  });

  it("jette ApiError{code,message} sur erreur uniforme", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "MCP_CRASHED", message: "mort" } }), { status: 503 })));
    const err = await api.get("/api/user").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("MCP_CRASHED");
    expect((err as ApiError).status).toBe(503);
  });

  it("send POST sérialise le body JSON", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ restored: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    await api.send("POST", "/api/raindrops/unrestore", { ids: [1] });  // contrat étendu Task 0b : {ids, toCollectionId?}
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ ids: [1] });
  });

  it("préserve code ET statut indépendamment (401 porte INVALID_INPUT)", async () => {
    // Le sidecar classe 401/403 comme INVALID_INPUT : le front ne doit pas
    // dériver le statut du code — les deux sont reportés tels quels.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "INVALID_INPUT", message: "token invalide" } }), { status: 401 })));
    const err = await api.get("/api/collections").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("INVALID_INPUT");
    expect((err as ApiError).status).toBe(401);
    expect((err as ApiError).message).toBe("token invalide");
  });

  it("erreur sans corps JSON → code RAINDROP_API, message humain, statut en détail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("proxy indisponible", { status: 500 })));
    const err = await api.get("/api/user").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("RAINDROP_API");
    expect((err as ApiError).status).toBe(500);
    expect((err as ApiError).message).toBe("Le service local a répondu par une erreur inattendue (http 500).");
    expect((err as ApiError).detail).toBe("http 500");
  });

  it("get sans query ne produit pas de '?'", async () => {
    const f = vi.fn(async () => okJson({}));
    vi.stubGlobal("fetch", f);
    await api.get("/api/user");
    const [url] = f.mock.calls[0] as unknown as [string];
    expect(url).toBe("/api/user");
  });

  // Un tableau se RÉPÈTE, il ne se joint pas. `String(["a","b"])` rendrait
  // « a,b » : une seule valeur, donc un filtre sur une seule étiquette pour
  // une demande qui en portait deux — sans erreur, et invisible à l'écran.
  it("un tableau devient un paramètre répété, jamais une valeur jointe", async () => {
    const f = vi.fn(async () => okJson({}));
    vi.stubGlobal("fetch", f);
    await api.get("/api/raindrops", { tags: ["webdesign", "code"], per_page: 50 });
    const [url] = f.mock.calls[0] as unknown as [string];
    const recus = new URL(url, "http://x").searchParams.getAll("tags");
    expect(recus).toEqual(["webdesign", "code"]);
    expect(url).not.toContain("webdesign%2Ccode");
  });

  it("un tableau VIDE n'émet aucun paramètre — c'est l'absence de filtre", async () => {
    const f = vi.fn(async () => okJson({}));
    vi.stubGlobal("fetch", f);
    await api.get("/api/raindrops", { tags: [] });
    const [url] = f.mock.calls[0] as unknown as [string];
    expect(url).toBe("/api/raindrops");
  });

  it("send sans body n'envoie ni corps ni Content-Type", async () => {
    const f = vi.fn(async () => okJson({}));
    vi.stubGlobal("fetch", f);
    await api.send("DELETE", "/api/raindrops/1000");
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
    expect(init.headers).not.toHaveProperty("Content-Type");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer dev-local-token");
  });
});

// Audit UX du 2026-09-23 : l'écran affichait le message TECHNIQUE tel quel —
// « Erreur : Error: failed to update raindrop », « Load failed », « The
// operation timed out ». §10 : une erreur dit ce qui s'est passé et comment
// le corriger. Le texte d'origine reste lisible dans `detail`.
describe("api — une erreur se dit en français, avec la marche à suivre", () => {
  const repond = (code: string, message: string, status: number) =>
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code, message } }), { status })));

  it.each([
    ["MCP_TIMEOUT", 504, "Raindrop n'a pas répondu à temps. Réessayez dans un instant."],
    ["RATE_LIMITED", 429, "Trop de requêtes vers Raindrop : patientez une minute, puis réessayez."],
    ["MCP_CRASHED", 503, "La connexion à Raindrop s'est interrompue. Redémarrez-la depuis la bannière, puis réessayez."],
  ])("%s → phrase humaine, détail conservé", async (code, status, attendu) => {
    repond(code, "Error: brut technique", status);
    const err = (await api.get("/api/x").catch((e) => e)) as ApiError;
    expect(err.code).toBe(code);
    expect(err.message).toBe(attendu);
    expect(err.detail).toBe("Error: brut technique");
  });

  it("RAINDROP_API : la phrase garde la raison, sans le préfixe « Error: »", async () => {
    repond("RAINDROP_API", "Error: failed to update raindrop", 502);
    const err = (await api.get("/api/x").catch((e) => e)) as ApiError;
    expect(err.message).toBe("Raindrop a refusé l'opération (failed to update raindrop).");
  });

  it("un message déjà rédigé par le sidecar (INVALID_INPUT, SCAN_EN_COURS…) passe tel quel", async () => {
    repond("SCAN_EN_COURS", "une analyse est déjà en cours", 409);
    const err = (await api.get("/api/x").catch((e) => e)) as ApiError;
    expect(err.message).toBe("une analyse est déjà en cours");
  });

  it("le service local injoignable (fetch rejeté) se dit comme tel", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Load failed"); }));
    const err = (await api.get("/api/x").catch((e) => e)) as Error;
    expect(err.message).toBe("Le service local ne répond pas. S'il ne revient pas, relancez l'application.");
  });

  it("le délai dépassé se dit comme tel", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("The operation timed out.", "TimeoutError"); }));
    const err = (await api.get("/api/x").catch((e) => e)) as Error;
    expect(err.message).toBe("Le service local n'a pas répondu à temps. Réessayez dans un instant.");
  });
});

// Spec §7 (hors ligne) : « écritures refusées proprement » — rien ne les
// refusait : une écriture partait et échouait au bout du pont (proposition 6
// de l'audit UX). Seules les écritures CHEZ RAINDROP se suspendent ; ce qui
// reste local (vues sauvegardées, sauvegarde, annulation d'un job) passe.
describe("api — hors ligne, les écritures vers Raindrop sont refusées avant de partir", () => {
  const horsLigne = (v: boolean) => Object.defineProperty(navigator, "onLine", { value: !v, configurable: true });
  afterEach(() => horsLigne(false));

  it.each([
    ["PATCH", "/api/raindrops/1"],
    ["DELETE", "/api/raindrops/1?from=3"],
    ["POST", "/api/raindrops/bulk"],
    ["DELETE", "/api/collections/9"],
    ["POST", "/api/tags/manage"],
    ["POST", "/api/maintenance/empty-trash"],
  ] as const)("%s %s : refus immédiat, rien n'est envoyé", async (methode, chemin) => {
    const f = vi.fn(async () => okJson({}));
    vi.stubGlobal("fetch", f);
    horsLigne(true);
    const err = (await api.send(methode, chemin, {}).catch((e) => e)) as Error;
    expect(err.message).toBe("Hors ligne : la modification n'a pas été envoyée. Réessayez au retour du réseau.");
    expect(f).not.toHaveBeenCalled();
  });

  it("les écritures LOCALES et les lectures passent", async () => {
    const f = vi.fn(async () => okJson({}));
    vi.stubGlobal("fetch", f);
    horsLigne(true);
    await api.send("POST", "/api/smartlists", { label: "x" });
    await api.send("POST", "/api/jobs/j1/cancel");
    await api.get("/api/raindrops");
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("témoin : en ligne, l'écriture part", async () => {
    const f = vi.fn(async () => okJson({}));
    vi.stubGlobal("fetch", f);
    await api.send("PATCH", "/api/raindrops/1", {});
    expect(f).toHaveBeenCalledTimes(1);
  });
});
