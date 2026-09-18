import { describe, it, expect, afterEach } from "vitest";
import { startFauxApi, type FauxApi } from "../testing/apiServer.js";
import { makeLecture, ErreurHttpRaindrop } from "./lecture.js";
import { Throttle } from "../mcp/throttle.js";

let api: FauxApi | undefined;
afterEach(async () => {
  await api?.close();
  api = undefined;
});

const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    _id: 1000 + i,
    created: `2020-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    lastUpdate: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    title: `t${i}`,
  }));

const lecture = (a: FauxApi) =>
  makeLecture({ token: "jeton", baseUrl: `http://127.0.0.1:${a.port}/rest/v1`, file: new Throttle(0) });

/**
 * Une file espionne : exécute réellement `fn` (donc les assertions sur la
 * requête HTTP restent valables) mais enregistre le rang demandé à chaque
 * appel. Sert à prouver que `collections`/`highlights`/`user` passent bien
 * PAR la file (pas un `fetch` direct qui la court-circuiterait), au rang
 * "fond" — pas seulement que le résultat a la bonne forme.
 */
const lectureAvecSpyFile = (a: FauxApi) => {
  const rangs: Array<"interactif" | "fond" | undefined> = [];
  const file = {
    run: <T>(fn: () => Promise<T>, o?: { rang?: "interactif" | "fond" }) => {
      rangs.push(o?.rang);
      return fn();
    },
  };
  const lecture = makeLecture({ token: "jeton", baseUrl: `http://127.0.0.1:${a.port}/rest/v1`, file });
  return { lecture, rangs };
};

describe("lecture", () => {
  it("rend les items BRUTS et le compte, sans normaliser", async () => {
    api = await startFauxApi(items(3));
    const p = await lecture(api).page(0, { sort: "created", page: 0 });
    expect(p.count).toBe(3);
    // Le brut : les champs de l'API, pas ceux du DTO du front.
    expect(p.items[0]).toMatchObject({ _id: 1000, created: expect.any(String) });
  });

  it("le compteur ne rapatrie pas la bibliothèque", async () => {
    api = await startFauxApi(items(120));
    expect(await lecture(api).compteur(0)).toBe(120);
    // perpage=1 : un compteur ne doit pas coûter une page entière — et pas
    // seulement « une seule requête », mais bien CETTE requête-là. Le faux
    // serveur rend `count: items.length` quel que soit `perpage` : sans
    // cette assertion sur la requête réellement émise, une implémentation
    // fautive à perpage=50 passerait tout aussi bien.
    const appelsRaindrops = api.appels.filter((a) => a.includes("raindrops"));
    expect(appelsRaindrops).toHaveLength(1);
    expect(appelsRaindrops[0]).toContain("perpage=1");
  });

  it("le jeton part en en-tête, jamais dans l'URL", async () => {
    api = await startFauxApi(items(1));
    await lecture(api).page(0, { sort: "created", page: 0 });
    expect(api.appels.join("|")).not.toContain("jeton");
  });

  it("le jeton arrive bien en en-tête Authorization (pas seulement absent de l'URL)", async () => {
    api = await startFauxApi(items(1));
    await lecture(api).page(0, { sort: "created", page: 0 });
    // L'absence dans l'URL (test précédent) ne prouve pas la présence dans
    // l'en-tête : un typo sur le nom de l'en-tête, ou sa suppression pure,
    // laisserait ce test-là vert alors que l'authentification serait cassée.
    expect(api.authorizations).toEqual(["Bearer jeton"]);
  });

  it("un 429 est rendu comme tel, pas aplati en panne réseau", async () => {
    api = await startFauxApi(items(1));
    api.repondre429(1);
    await expect(lecture(api).page(0, { sort: "created", page: 0 })).rejects.toThrow(/429/);
  });

  it("un 429 porte un status structuré, pas seulement une sous-chaîne du message", async () => {
    api = await startFauxApi(items(1));
    api.repondre429(1);
    const erreur = await lecture(api)
      .page(0, { sort: "created", page: 0 })
      .catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurHttpRaindrop);
    expect((erreur as ErreurHttpRaindrop).status).toBe(429);
  });

  it("collections() déballe items et passe par la file au rang fond", async () => {
    api = await startFauxApi(items(0));
    const { lecture, rangs } = lectureAvecSpyFile(api);
    const c = await lecture.collections();
    expect(c).toEqual([{ _id: 1, title: "A" }]);
    expect(rangs).toEqual(["fond"]);
  });

  // §5.1 : « l'arborescence complète » coûte DEUX requêtes. `/collections` ne
  // rend que les racines — l'endpoint des imbriquées est distinct.
  it("collectionsEnfants() interroge /collections/childrens et passe par la file au rang fond", async () => {
    api = await startFauxApi(items(0));
    const { lecture, rangs } = lectureAvecSpyFile(api);
    const c = await lecture.collectionsEnfants();
    expect(c).toEqual([
      { _id: 1, title: "A" },
      { _id: 2, title: "A/enfant", parent: { $id: 1 } },
    ]);
    expect(api.appels).toEqual(["/rest/v1/collections/childrens"]);
    expect(rangs).toEqual(["fond"]);
  });

  it("highlights() rend {count, items} et passe par la file au rang fond", async () => {
    api = await startFauxApi(items(0));
    const { lecture, rangs } = lectureAvecSpyFile(api);
    const h = await lecture.highlights(0);
    expect(h.count).toBe(2);
    expect(h.items).toEqual([
      { _id: 501, text: "surlignage" },
      { _id: 502, text: "autre" },
    ]);
    expect(api.appels).toEqual(["/rest/v1/highlights?page=0&perpage=50"]);
    expect(rangs).toEqual(["fond"]);
  });

  it("user() rend l'objet brut, sans le déballer, et passe par la file au rang fond", async () => {
    api = await startFauxApi(items(0));
    const { lecture, rangs } = lectureAvecSpyFile(api);
    const u = await lecture.user();
    expect(u).toEqual({ user: { _id: 7 } });
    expect(api.appels).toEqual(["/rest/v1/user"]);
    expect(rangs).toEqual(["fond"]);
  });
});
