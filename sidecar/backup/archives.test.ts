import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { repertoireTemporaire } from "../testing/tmp.js";
import { startFauxApi, type FauxApi } from "../testing/apiServer.js";
import { Throttle } from "../mcp/throttle.js";
import { archiver, purgerOrphelins, appliquerBudget } from "./archives.js";

// `repertoireTemporaire` rend une string, pas une fonction (déjà vu dans
// balayage.test.ts, correction R3) : un nouveau dossier par appel de `dir()`.
const dir = () => repertoireTemporaire("backup-archives-");
let api: FauxApi | undefined;
afterEach(async () => { await api?.close(); api = undefined; });

describe("archiver", () => {
  it("suit le 303 à la main et écrit du .html.gz tel quel", async () => {
    api = await startFauxApi([]);
    const dossier = join(dir(), "a");
    const r = await archiver({
      token: "j", baseUrl: `http://127.0.0.1:${api.port}/rest/v1`,
      file: new Throttle(0), dossierArchives: dossier, raindropId: 42,
    });
    expect(r.ok).toBe(true);
    const chemin = join(dossier, "42.html.gz");
    const octets = await readFile(chemin);
    // Le contenu reste gzippé : nommer .html un contenu compressé produirait
    // des archives que rien n'ouvre.
    expect(octets.subarray(0, 3)).toEqual(Buffer.from([0x1f, 0x8b, 0x08]));
    expect(gunzipSync(octets).toString()).toContain("archive");
  });
});

describe("rétention des archives", () => {
  it("purge les orphelins — un signet effacé n'a plus d'archive", async () => {
    const dossier = join(dir(), "orphelins");
    await mkdir(dossier, { recursive: true });
    await writeFile(join(dossier, "1.html.gz"), "a");
    await writeFile(join(dossier, "2.html.gz"), "b");
    const supprimes = await purgerOrphelins(dossier, new Set([1]));
    expect(supprimes).toBe(1);
    expect(await readdir(dossier)).toEqual(["1.html.gz"]);
  });

  it("le budget évince les plus anciennes, pas les récentes", async () => {
    const dossier = join(dir(), "budget");
    await mkdir(dossier, { recursive: true });
    await writeFile(join(dossier, "1.html.gz"), Buffer.alloc(100));
    await new Promise((r) => setTimeout(r, 15));
    await writeFile(join(dossier, "2.html.gz"), Buffer.alloc(100));
    const evinces = await appliquerBudget(dossier, 150);
    expect(evinces).toBe(1);
    expect(await readdir(dossier)).toEqual(["2.html.gz"]);
  });
});
