import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";
import { repertoireTemporaire } from "../testing/tmp.js";
import { startFauxApi, type FauxApi } from "../testing/apiServer.js";
import { Throttle } from "../mcp/throttle.js";
import { archiver, inventorier, purgerOrphelins, appliquerBudget } from "./archives.js";

// `repertoireTemporaire` rend une string, pas une fonction (déjà vu dans
// balayage.test.ts, correction R3) : un nouveau dossier par appel de `dir()`.
const dir = () => repertoireTemporaire("backup-archives-");
let api: FauxApi | undefined;
afterEach(async () => { await api?.close(); api = undefined; });

describe("archiver", () => {
  it("suit le 303 à la main et écrit un .html.gz RÉELLEMENT gzippé", async () => {
    api = await startFauxApi([]);
    const dossier = join(dir(), "a");
    const r = await archiver({
      token: "j", baseUrl: `http://127.0.0.1:${api.port}/rest/v1`,
      file: new Throttle(0), dossierArchives: dossier, raindropId: 42,
    });
    expect(r.ok).toBe(true);
    const chemin = join(dossier, "42.html.gz");
    const octets = await readFile(chemin);
    // Le faux serveur annonce `Content-Encoding: gzip` comme le vrai, donc
    // `fetch` a DÉPLIÉ le corps : sans recompression, ce fichier serait du
    // HTML en clair sous un nom `.gz` que `gunzip` refuse.
    expect(octets.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]));
    expect(gunzipSync(octets).toString()).toContain("archive");
  });

  it("ne recomprime PAS un corps déjà gzippé", async () => {
    // Le cas où `fetch` ne déplie pas (pas d'en-tête d'encodage, ou un undici
    // qui change d'avis) : une seconde compression donnerait un fichier que
    // `gunzip` rend... du gzip, et non le HTML attendu.
    const deja = gzipSync(Buffer.from("<html>déjà</html>"));
    const dossier = join(dir(), "b");
    const fetchImpl = (async (url: string | URL) =>
      String(url).includes("/cache")
        ? new Response(null, { status: 303, headers: { location: "http://s3.invalide/objet" } })
        : new Response(deja, { status: 200 })) as unknown as typeof fetch;
    const r = await archiver({
      token: "j", fetchImpl, file: new Throttle(0), dossierArchives: dossier, raindropId: 7,
    });
    expect(r.ok).toBe(true);
    const octets = await readFile(join(dossier, "7.html.gz"));
    expect(gunzipSync(octets).toString()).toBe("<html>déjà</html>");
  });
});

describe("inventorier", () => {
  it("répertoire absent → inventaire vide", async () => {
    expect(await inventorier(join(dir(), "inexistant"))).toEqual({ ids: [], octets: 0 });
  });

  it("compte les <id>.html.gz, ignore le reste, somme les octets", async () => {
    const dossier = join(dir(), "inv");
    await mkdir(dossier, { recursive: true });
    await writeFile(join(dossier, "7.html.gz"), Buffer.alloc(30));
    await writeFile(join(dossier, "2.html.gz"), Buffer.alloc(10));
    await writeFile(join(dossier, "manifest.json"), "{}"); // ignoré
    await writeFile(join(dossier, "notes.txt"), "x"); // ignoré
    const inv = await inventorier(dossier);
    expect(inv.ids).toEqual([2, 7]); // tri croissant, déterministe
    expect(inv.octets).toBe(40);
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
