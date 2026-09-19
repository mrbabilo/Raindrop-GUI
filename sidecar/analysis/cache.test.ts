import { repertoireTemporaire } from "../testing/tmp.js";
import { describe, it, expect, beforeEach } from "vitest";
import {readFileSync, writeFileSync, existsSync} from "node:fs";
import { join } from "node:path";
import { AnalysisCache } from "./cache.js";

let dir: string;
beforeEach(() => { dir = repertoireTemporaire("cache-"); });

const result = (url: string, status: "ok" | "dead") => ({
  raindropId: 1, url, status, httpStatus: status === "ok" ? 200 : 404,
  redirectChain: null, finalUrl: null, redirectKind: null,
  reason: status === "ok" ? null : "http_404", checkedAt: new Date().toISOString(),
});

describe("AnalysisCache", () => {
  it("roundtrip save/load", async () => {
    const file = join(dir, "analysis.json");
    let cache = await AnalysisCache.load(file);
    cache.setResult(result("https://a.example", "ok"));
    cache.markScanDone("links");
    await cache.save();

    cache = await AnalysisCache.load(file);
    expect(cache.getResult("https://a.example")?.status).toBe("ok");
    expect(cache.lastScan("links")).toBeTruthy();
  });

  it("fichier corrompu → cache vide, pas de throw", async () => {
    const file = join(dir, "analysis.json");
    writeFileSync(file, "{corrompu");
    const cache = await AnalysisCache.load(file);
    expect(cache.getResult("https://a.example")).toBeUndefined();
  });

  it("save atomique : pas de .tmp résiduel", async () => {
    const file = join(dir, "analysis.json");
    const cache = await AnalysisCache.load(file);
    await cache.save();
    expect(existsSync(file)).toBe(true);
    expect(existsSync(`${file}.tmp`)).toBe(false);
    JSON.parse(readFileSync(file, "utf8")); // JSON valide
  });

  it("staleUrls : nouvelles + expirées seulement", async () => {
    const cache = await AnalysisCache.load(join(dir, "analysis.json"));
    cache.setResult(result("https://vieux.example", "ok"));
    // on vieillit artificiellement ce résultat de 40 jours
    const r = cache.getResult("https://vieux.example")!;
    cache.setResult({ ...r, checkedAt: new Date(Date.now() - 40 * 864e5).toISOString() });
    const stale = cache.staleUrls(
      [
        { id: 1, url: "https://vieux.example", title: "v", collectionId: 0 },
        { id: 2, url: "https://nouveau.example", title: "n", collectionId: 0 },
      ].map((x) => ({ ...x, excerpt: "", note: "", domain: "", tags: [], created: "", lastUpdate: "", important: false, type: "link", cover: null })),
      30,
    );
    expect(stale.map((s) => s.url).sort()).toEqual(["https://nouveau.example", "https://vieux.example"]);
  });
});

// Une URL, plusieurs signets. Mesuré le 2026-09-19 sur la bibliothèque
// réelle : 430 signets partagent une URL au caractère près. Rendre le
// stockage tel quel — un résultat par URL — cachait jusqu'à 242 signets
// morts, que rien n'aurait jamais signalés.
describe("resultatsParSignet — un lien mort partagé se voit AUTANT DE FOIS", () => {
  const item = (id: number, url: string) =>
    ({ id, url, title: `t${id}`, collectionId: 7 }) as unknown as Parameters<AnalysisCache["setItemsIndex"]>[0][number];

  it("trois signets sur la même URL morte rendent TROIS lignes", async () => {
    const cache = await AnalysisCache.load(join(dir, "a.json"));
    cache.setItemsIndex([item(1, "https://mort.example"), item(2, "https://mort.example"), item(3, "https://mort.example")]);
    cache.setResult(result("https://mort.example", "dead"));
    // Le stockage, lui, n'a bien qu'UNE entrée : c'est le bon cache de
    // vérification, une URL ne se vérifie qu'une fois.
    expect(cache.allResults()).toHaveLength(1);
    const lignes = cache.resultatsParSignet();
    expect(lignes.map((r) => r.raindropId).sort()).toEqual([1, 2, 3]);
    expect(lignes.every((r) => r.status === "dead")).toBe(true);
  });

  it("le `raindropId` stocké ne désigne rien : il est recalculé", async () => {
    // Le résultat porte `raindropId: 1` (voir la fabrique `result`), qui n'est
    // qu'un hasard d'ordonnancement du scan. Les signets réels sont 41 et 42.
    const cache = await AnalysisCache.load(join(dir, "b.json"));
    cache.setItemsIndex([item(41, "https://x.example"), item(42, "https://x.example")]);
    cache.setResult(result("https://x.example", "dead"));
    expect(cache.resultatsParSignet().map((r) => r.raindropId).sort()).toEqual([41, 42]);
  });

  it("une URL sans signet connu garde sa ligne, elle ne disparaît pas", async () => {
    // D'abord la présence : avec un index peuplé, la ligne suit l'index.
    const cache = await AnalysisCache.load(join(dir, "c.json"));
    cache.setResult(result("https://orpheline.example", "dead"));
    expect(cache.resultatsParSignet()).toHaveLength(1);
    cache.setItemsIndex([item(9, "https://orpheline.example")]);
    expect(cache.resultatsParSignet().map((r) => r.raindropId)).toEqual([9]);
  });
});

describe("setItemsIndex REMPLACE — un signet supprimé ne ressuscite pas", () => {
  const item = (id: number, url: string) =>
    ({ id, url, title: `t${id}`, collectionId: 7 }) as unknown as Parameters<AnalysisCache["setItemsIndex"]>[0][number];

  it("le signet absent du nouvel instantané sort de l'index", async () => {
    const cache = await AnalysisCache.load(join(dir, "d.json"));
    cache.setItemsIndex([item(1, "https://a.example"), item(2, "https://b.example")]);
    // La présence D'ABORD : sans elle, l'absence ci-dessous ne prouverait rien.
    expect(Object.keys(cache.getItemsIndex()).sort()).toEqual(["1", "2"]);
    // Nouvel instantané : le signet 2 a été supprimé de la bibliothèque.
    cache.setItemsIndex([item(1, "https://a.example")]);
    expect(Object.keys(cache.getItemsIndex())).toEqual(["1"]);
  });

  it("et son lien mort cesse d'apparaître — sinon l'écran proposerait de réparer un signet disparu", async () => {
    const cache = await AnalysisCache.load(join(dir, "e.json"));
    cache.setItemsIndex([item(1, "https://mort.example"), item(2, "https://mort.example")]);
    cache.setResult(result("https://mort.example", "dead"));
    expect(cache.resultatsParSignet()).toHaveLength(2);
    cache.setItemsIndex([item(1, "https://mort.example")]);
    expect(cache.resultatsParSignet().map((r) => r.raindropId)).toEqual([1]);
  });
});
