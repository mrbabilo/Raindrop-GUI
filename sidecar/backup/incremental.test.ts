import { describe, it, expect, afterEach } from "vitest";
import { startFauxApi, type FauxApi } from "../testing/apiServer.js";
import { makeLecture } from "./lecture.js";
import { Throttle } from "../mcp/throttle.js";
import { lireModifies } from "./incremental.js";

let api: FauxApi | undefined;
afterEach(async () => { await api?.close(); api = undefined; });

const item = (id: number, lastUpdate: string) =>
  ({ _id: id, created: "2020-01-01T00:00:00.000Z", lastUpdate, title: `t${id}` });

const lect = (a: FauxApi) =>
  makeLecture({ token: "j", baseUrl: `http://127.0.0.1:${a.port}/rest/v1`, file: new Throttle(0) });

describe("incrémental", () => {
  it("s'arrête au watermark et ne rapatrie que le neuf", async () => {
    api = await startFauxApi([
      item(3, "2026-03-01T00:00:00.000Z"),
      item(2, "2026-02-01T00:00:00.000Z"),
      item(1, "2026-01-01T00:00:00.000Z"),
    ]);
    const r = await lireModifies({ lecture: lect(api), collectionId: 0, watermark: "2026-02-01T00:00:00.000Z" });
    const ids = r.modifies.map((m) => (m as { _id: number })._id).sort();
    // `>=` : l'élément PILE au watermark est réapplique — idempotent, et il
    // vaut mieux le réécrire que le sauter.
    expect(ids).toEqual([2, 3]);
    expect(r.nouveauWatermark).toBe("2026-03-01T00:00:00.000Z");
  });

  // Correction §1bis n°4 : plusieurs éléments à la même seconde.
  it("des dates égales ne font sauter personne, ni produire de doublon", async () => {
    const meme = "2026-05-05T12:00:00.000Z";
    api = await startFauxApi([
      item(10, meme), item(11, meme), item(12, meme),
      item(1, "2026-01-01T00:00:00.000Z"),
    ]);
    const r = await lireModifies({ lecture: lect(api), collectionId: 0, watermark: meme });
    const ids = r.modifies.map((m) => (m as { _id: number })._id).sort((a, b) => a - b);
    expect(ids).toEqual([10, 11, 12]);
    // Le dédoublonnage par `_id`. (Il ne s'exerce PAS ici : une seule page de
    // 4 items est lue, aucune page de recouvrement n'entre en jeu — voir
    // l'en-tête du module, qui dit pourquoi ce bloc n'a pas de test.)
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rien de neuf coûte une seule requête", async () => {
    // NOTE : Cette assertion de "une seule requête" n'est vraie que sur une
    // bibliothèque tenant en une page (ici : 1 item). En production, avec une
    // page PLEINE d'éléments tous plus anciens que le watermark, le code lit
    // la page de recouvrement — le plancher réel est de DEUX requêtes, pas
    // une. Le test ne ment pas, mais sa fausse API minuscule cache un coût
    // qu'on rencontrerait en réel.
    api = await startFauxApi([item(1, "2026-01-01T00:00:00.000Z")]);
    const r = await lireModifies({ lecture: lect(api), collectionId: 0, watermark: "2026-06-01T00:00:00.000Z" });
    expect(r.modifies).toHaveLength(0);
    expect(r.pages).toBe(1);
  });

  it("un watermark vide s'arrête à maxPages au lieu de tout rapatrier", async () => {
    // 150 éléments = 3 pages pleines : c'est le SEUL cas où `maxPages` est
    // réellement ce qui arrête la boucle. Avec une bibliothèque d'un seul
    // élément, la page courte cassait la boucle avant que le garde-fou
    // n'entre en jeu — le test passait même en l'ignorant complètement.
    api = await startFauxApi(
      Array.from({ length: 150 }, (_, i) =>
        item(i + 1, `2026-06-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`),
      ),
    );
    const r = await lireModifies({ lecture: lect(api), collectionId: 0, watermark: "", maxPages: 2 });
    expect(r.pages).toBe(2);
    // Deux pages exactement, donc 100 éléments et non 150 : le garde-fou a
    // tranché au lieu de laisser filer.
    expect(r.modifies).toHaveLength(100);
  });
});

// §3.4 : « un champ qu'on n'a pas écrit est définitivement perdu » — a
// fortiori un ITEM entier. Un objet sans `_id` numérique faisait pourtant
// avancer le watermark (donc il ne serait jamais relu) tout en étant jeté :
// la seule perte à la fois silencieuse et DÉFINITIVE du lot.
describe("un item sans `_id` numérique", () => {
  it("est conservé, et n'empêche pas le watermark d'avancer", async () => {
    const sansId = { created: "2020-01-01T00:00:00.000Z", lastUpdate: "2026-04-01T00:00:00.000Z", title: "orphelin" };
    api = await startFauxApi([
      item(3, "2026-03-01T00:00:00.000Z"),
      sansId as unknown as ReturnType<typeof item>,
      item(1, "2026-01-01T00:00:00.000Z"),
    ]);
    const r = await lireModifies({ lecture: lect(api), collectionId: 0, watermark: "2026-02-01T00:00:00.000Z" });
    // L'objet était bien dans la fenêtre lue — sans quoi cette assertion
    // célébrerait la conservation de quelque chose que rien n'apportait.
    expect(r.modifies).toContainEqual(expect.objectContaining({ title: "orphelin" }));
    expect(r.modifies.map((m) => (m as { _id?: number })._id)).toContain(3);
    // Le watermark avance jusqu'au plus récent, orphelin compris : c'est
    // précisément ce qui rendait la perte définitive.
    expect(r.nouveauWatermark).toBe("2026-04-01T00:00:00.000Z");
  });
});
