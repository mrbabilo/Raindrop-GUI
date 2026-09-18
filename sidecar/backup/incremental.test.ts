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
    // Le dédoublonnage par _id : la page de recouvrement les revoit.
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

  it("un watermark vide rend la main sans tout rapatrier", async () => {
    api = await startFauxApi([item(1, "2026-01-01T00:00:00.000Z")]);
    const r = await lireModifies({ lecture: lect(api), collectionId: 0, watermark: "", maxPages: 2 });
    expect(r.pages).toBeLessThanOrEqual(2);
  });
});
