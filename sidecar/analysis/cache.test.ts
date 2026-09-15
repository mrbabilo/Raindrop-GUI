import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AnalysisCache } from "./cache.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "cache-")); });

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
