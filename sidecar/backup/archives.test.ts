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

// Les trois chemins d'échec d'`archiver`. Aucun n'était couvert : le lot
// l'avait noté comme dette. Ils comptent, parce qu'`archivage.ts` promet
// qu'un échec sur un signet n'interrompt jamais les suivants — promesse qui
// suppose que chaque échec se transforme bien en `{ok:false, raison}` plutôt
// qu'en exception.
describe("archiver — ce qui échoue, et comment", () => {
  // `BodyInit`/`HeadersInit` sont des types DOM : le sidecar ne charge que
  // les `lib` de Node, et les nommer ici ne passe pas le typecheck explicite.
  const reponse = (init: { status: number; headers?: Record<string, string>; corps?: string }) =>
    new Response(init.corps ?? null, { status: init.status, headers: init.headers });

  it("pas de `Location` sur /cache : refus nommé, jamais une exception", async () => {
    const dossier = join(dir(), "sansLocation");
    const fetchImpl = (async () => reponse({ status: 404 })) as unknown as typeof fetch;
    const r = await archiver({
      token: "j", fetchImpl, file: new Throttle(0), dossierArchives: dossier, raindropId: 1,
    });
    expect(r).toEqual({ ok: false, raison: "pas de redirection (http 404)" });
  });

  // La signature S3 est temporaire : une URL périmée rend 403, et ce n'est
  // pas une panne de l'application.
  it("copie inaccessible : le code HTTP de S3 est rapporté tel quel", async () => {
    const dossier = join(dir(), "s3refuse");
    const fetchImpl = (async (url: string | URL) =>
      String(url).includes("/cache")
        ? reponse({ status: 303, headers: { location: "http://s3.invalide/objet" } })
        : reponse({ status: 403 })) as unknown as typeof fetch;
    const r = await archiver({
      token: "j", fetchImpl, file: new Throttle(0), dossierArchives: dossier, raindropId: 2,
    });
    expect(r).toEqual({ ok: false, raison: "copie inaccessible (http 403)" });
  });

  // Une coupure réseau LÈVE. `archivage.ts` boucle sur les identifiants : une
  // exception qui s'échapperait d'ici interromprait tous les suivants.
  it("une coupure réseau devient un refus, elle ne s'échappe pas", async () => {
    const dossier = join(dir(), "coupure");
    const fetchImpl = (async () => {
      throw new Error("fetch failed");
    }) as unknown as typeof fetch;
    const r = await archiver({
      token: "j", fetchImpl, file: new Throttle(0), dossierArchives: dossier, raindropId: 3,
    });
    expect(r).toEqual({ ok: false, raison: "fetch failed" });
  });

  // Le second appel porte l'URL SIGNÉE : y réémettre l'en-tête
  // d'authentification la ferait rejeter par S3 (mesuré, §5.4).
  it("le second appel ne porte AUCUN en-tête d'authentification", async () => {
    const dossier = join(dir(), "signature");
    const entetes: unknown[] = [];
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      entetes.push(init?.headers);
      return String(url).includes("/cache")
        ? reponse({ status: 303, headers: { location: "http://s3.invalide/objet" } })
        : reponse({ status: 200, corps: "<html>archive</html>" });
    }) as unknown as typeof fetch;
    const r = await archiver({
      token: "j", fetchImpl, file: new Throttle(0), dossierArchives: dossier, raindropId: 4,
    });
    expect(r.ok).toBe(true);
    // Le premier l'a bien porté — sans quoi l'absence sur le second ne
    // prouverait rien.
    expect(JSON.stringify(entetes[0])).toContain("Bearer");
    expect(entetes[1]).toBeUndefined();
  });
});

// L'écriture EN FLUX et sa contrepartie : le fichier temporaire.
//
// Tamponnée, une écriture interrompue ne laissait RIEN. En flux, elle
// laisserait un `<id>.html.gz` tronqué — qu'`inventorier()` compterait comme
// une archive, que l'interface marquerait « Archivé », et dont le budget
// pèserait les octets. Une archive tronquée qui se présente comme bonne est
// le mode de défaillance qu'une sauvegarde existe pour exclure.
describe("archiver — l'écriture en flux ne laisse jamais de demi-archive", () => {
  const fetchVers = (corps: () => ReadableStream<Uint8Array>) =>
    (async (url: string | URL) =>
      String(url).includes("/cache")
        ? new Response(null, { status: 303, headers: { location: "http://s3.invalide/objet" } })
        : new Response(corps(), { status: 200 })) as unknown as typeof fetch;

  it("le nom DÉFINITIF n'apparaît qu'une fois l'écriture terminée", async () => {
    // Le test « rien ne reste après l'échec » ne prouve RIEN ici : avec ou
    // sans temporaire, le `catch` efface et le dossier finit vide. Ce que le
    // temporaire garantit, c'est qu'à AUCUN INSTANT un fichier au nom
    // définitif n'existe — sinon un plantage du processus (où aucun `catch`
    // ne tourne) laisserait une archive tronquée qui se présente comme bonne.
    // On regarde donc le dossier PENDANT l'écriture.
    const dossier = join(dir(), "pendant");
    const vuPendant: string[][] = [];
    let i = 0;
    const corps = () =>
      new ReadableStream<Uint8Array>({
        async pull(c) {
          i++;
          if (i <= 3) return c.enqueue(new TextEncoder().encode("<html>".repeat(200)));
          vuPendant.push(await readdir(dossier).catch(() => []));
          c.error(new Error("connexion perdue"));
        },
      });
    const r = await archiver({
      token: "j", fetchImpl: fetchVers(corps), file: new Throttle(0),
      dossierArchives: dossier, raindropId: 11,
    });
    expect(r.ok).toBe(false);
    // Pendant : un temporaire, et LUI SEUL.
    expect(vuPendant[0]).toEqual(["11.html.gz.partiel"]);
    // Après : ni l'archive, ni son temporaire.
    expect(await readdir(dossier)).toEqual([]);
  });

  it("le temporaire d'un plantage ne serait JAMAIS pris pour une archive", async () => {
    // Contrôle du nom : un `.partiel` oublié par un plantage du processus
    // (aucun `catch` ne tourne alors) ne doit pas être adopté. On prouve
    // d'abord que le dossier contient bien un vrai fichier — sinon ce test
    // constate un inventaire vide qui l'aurait été de toute façon.
    const dossier = join(dir(), "reliquat");
    await mkdir(dossier, { recursive: true });
    await writeFile(join(dossier, "7.html.gz"), Buffer.alloc(10));
    await writeFile(join(dossier, "8.html.gz.partiel"), Buffer.alloc(9_000));
    const inv = await inventorier(dossier);
    expect(inv.ids).toEqual([7]);
    expect(inv.octets).toBe(10);
  });

  it("une copie démesurée est coupée, nommée, et n'écrit rien", async () => {
    // Le garde-fou ne protège plus la mémoire (le flux s'en charge) mais le
    // disque : une réponse qui ne finit pas le remplirait.
    const sansFin = () =>
      new ReadableStream<Uint8Array>({
        pull(c) {
          c.enqueue(new Uint8Array(1024));
        },
      });
    const dossier = join(dir(), "demesure");
    const r = await archiver({
      token: "j", fetchImpl: fetchVers(sansFin), file: new Throttle(0),
      dossierArchives: dossier, raindropId: 12, maxOctets: 2 ** 20,
    });
    expect(r).toEqual({ ok: false, raison: "copie trop volumineuse (> 1 Mo)" });
    expect(await readdir(dossier)).toEqual([]);
  });

  it("un premier morceau d'UN octet ne fausse pas la reniflée du gzip", async () => {
    // `estGzip` a besoin de deux octets. Un serveur qui livre le premier
    // morceau en un seul octet ferait conclure « pas du gzip » à tort, et le
    // fichier serait comprimé DEUX fois — `gunzip` en rendrait du gzip.
    const deja = gzipSync(Buffer.from("<html>déjà</html>"));
    const goutteAGoutte = () => {
      let i = 0;
      return new ReadableStream<Uint8Array>({
        pull(c) {
          if (i >= deja.length) return c.close();
          c.enqueue(new Uint8Array([deja[i]!]));
          i++;
        },
      });
    };
    const dossier = join(dir(), "goutte");
    const r = await archiver({
      token: "j", fetchImpl: fetchVers(goutteAGoutte), file: new Throttle(0),
      dossierArchives: dossier, raindropId: 13,
    });
    expect(r.ok).toBe(true);
    expect(gunzipSync(await readFile(join(dossier, "13.html.gz"))).toString()).toBe("<html>déjà</html>");
  });
});
