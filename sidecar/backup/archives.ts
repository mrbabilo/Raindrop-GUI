//! Les copies permanentes Pro, archivées à la demande.
//!
//! MESURÉ le 2026-09-16 (§5.4) : `GET /raindrop/{id}/cache` répond **303**
//! (la doc annonce 307) vers une URL S3 signée et temporaire ; la signature ne
//! couvre que GET (un HEAD renvoie 403, donc pas de sondage de taille) ; le
//! contenu est du HTML GZIPPÉ servi en `text/html` — mais avec
//! `Content-Encoding: gzip`, que `fetch` déplie tout seul (mesuré le
//! 2026-09-18) : ce qui arrive dans `arrayBuffer()` est EN CLAIR.
//!
//! La redirection se suit À LA MAIN (correction §1bis n°5) : suivie
//! automatiquement, l'en-tête `Authorization` du premier appel serait réémis
//! vers une URL déjà signée, que S3 peut rejeter.

import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import type { File } from "../mcp/throttle.js";

/** La signature d'un flux gzip : `1f 8b`. */
const estGzip = (b: Buffer): boolean => b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b;

/** Budget par défaut du dossier d'archives (correction §1bis n°2).
 *
 *  ⚠️ CALIBRAGE PÉRIMÉ, mesuré le 2026-09-18 : la spec raisonnait à « 2,1 Mo
 *  pièce », la distribution réelle des 8 875 copies donne une médiane de
 *  1,17 Mo mais une MOYENNE de 3,18 Mo (p90 7,52 ; p99 31,46 ; max 160,67).
 *  Ces 5 Go ne tiennent donc pas ~2 400 archives mais **~1 600**, soit 18 %
 *  d'une bibliothèque de 12 210 signets — dont l'archivage intégral pèserait
 *  27,6 Go. Le nombre n'est pas changé ici : c'est un budget, pas une
 *  prédiction, et l'utilisateur n'a rien demandé de plus. Ce qui change, c'est
 *  que l'éviction qu'il provoque ne se fait plus en silence. */
export const ARCHIVES_MAX_GO = 5;

/**
 * Le garde-fou par copie. Il ne protège plus la MÉMOIRE — l'écriture est en
 * flux — mais le DISQUE : une réponse qui ne finit pas remplirait le dossier
 * jusqu'à saturation. Placé très au-dessus du maximum observé (160,67 Mo) pour
 * qu'il ne coupe jamais une copie réelle : il n'est pas là pour trier, il est
 * là pour qu'une anomalie s'arrête.
 */
export const ARCHIVE_MAX_OCTETS = 256 * 2 ** 20;

export async function archiver(deps: {
  token: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  file: File;
  dossierArchives: string;
  raindropId: number;
  timeoutMs?: number;
  /** Garde-fou par copie ; défaut `ARCHIVE_MAX_OCTETS`. */
  maxOctets?: number;
}): Promise<{ ok: true; chemin: string; octets: number } | { ok: false; raison: string }> {
  const base = deps.baseUrl ?? "https://api.raindrop.io/rest/v1";
  const f = deps.fetchImpl ?? fetch;
  const delai = deps.timeoutMs ?? 60_000;

  // SEUL l'appel Raindrop prend le créneau de la file (audit du 2026-09-23) :
  // le téléchargement S3 qui suit n'est pas un appel Raindrop — hôte signé,
  // hors de la limite de débit — et une copie pèse jusqu'à 160 Mo (mesuré).
  // Tenu DANS le créneau, il gelait la file séquentielle : fiches, listes et
  // palette attendaient la fin du téléchargement (même principe que la
  // pause de reprise, trap « reprise en vol »).
  let cible: string | null;
  try {
    const r1 = await deps.file.run(
      () =>
        f(`${base}/raindrop/${deps.raindropId}/cache`, {
          headers: { Authorization: `Bearer ${deps.token}` },
          redirect: "manual",
          signal: AbortSignal.timeout(delai),
        }),
      { rang: "fond" },
    );
    cible = r1.headers.get("location");
    if (!cible) return { ok: false as const, raison: `pas de redirection (http ${r1.status})` };
  } catch (e) {
    return { ok: false as const, raison: e instanceof Error ? e.message : String(e) };
  }
  try {
    // Second appel SANS en-tête d'authentification : l'URL est déjà signée.
    const r2 = await f(cible, { signal: AbortSignal.timeout(delai) });
    if (!r2.ok) return { ok: false as const, raison: `copie inaccessible (http ${r2.status})` };
    if (!r2.body) return { ok: false as const, raison: "copie sans corps" };
    await mkdir(deps.dossierArchives, { recursive: true });
    const chemin = join(deps.dossierArchives, `${deps.raindropId}.html.gz`);
    return await ecrireArchive(r2.body, chemin, deps.maxOctets ?? ARCHIVE_MAX_OCTETS);
  } catch (e) {
    return { ok: false as const, raison: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Écrit la copie EN FLUX, par un fichier temporaire, puis renomme.
 *
 * **Le flux.** `arrayBuffer()` tenait la copie ENTIÈRE en mémoire, puis la
 * recomprimait : sur le maximum mesuré (160,67 Mo de HTML en clair) cela fait
 * deux allocations de cet ordre dans un sidecar qui sert par ailleurs
 * l'interface. Le pipeline ne retient qu'un morceau à la fois.
 *
 * **Le fichier temporaire.** C'est la contrepartie obligatoire du flux, pas un
 * raffinement. Une écriture tamponnée ne laissait RIEN derrière elle quand la
 * connexion tombait ; une écriture en flux laisse un `<id>.html.gz` TRONQUÉ,
 * qu'`inventorier()` compterait comme une archive, que l'interface marquerait
 * « Archivé », et dont `appliquerBudget` pèserait les octets. Une archive
 * tronquée qui se présente comme bonne est exactement le mode de défaillance
 * qu'une sauvegarde existe pour exclure (§6). Le nom `.partiel` ne satisfait
 * pas `ID_DE` — un reliquat de plantage n'est donc jamais adopté.
 *
 * **La reniflée.** Elle porte sur le PREMIER morceau, accumulé jusqu'à avoir
 * les deux octets de la signature. Elle existe parce que la production sert
 * l'objet avec `Content-Encoding: gzip` — que `fetch` déplie tout seul, donc
 * ce qui arrive est en clair et doit être recomprimé — mais rien ne garantit
 * qu'undici gardera cet avis. Comprimer du gzip donnerait un fichier que
 * `gunzip` rend… du gzip.
 */
async function ecrireArchive(
  corps: ReadableStream<Uint8Array>,
  chemin: string,
  maxOctets: number,
): Promise<{ ok: true; chemin: string; octets: number } | { ok: false; raison: string }> {
  const lecteur = corps.getReader();
  const temporaire = `${chemin}.partiel`;
  // La tête : de quoi décider, soit deux octets — un serveur peut très bien
  // livrer le premier morceau en une poignée d'octets.
  const morceaux: Buffer[] = [];
  let tete = 0;
  let fini = false;
  while (tete < 2 && !fini) {
    const { done, value } = await lecteur.read();
    if (done) fini = true;
    else if (value) {
      morceaux.push(Buffer.from(value));
      tete += value.byteLength;
    }
  }
  const dejaGzip = estGzip(Buffer.concat(morceaux));

  let recus = morceaux.reduce((n, m) => n + m.byteLength, 0);
  async function* source(): AsyncGenerator<Buffer> {
    for (const m of morceaux) yield m;
    while (!fini) {
      const { done, value } = await lecteur.read();
      if (done) break;
      if (!value) continue;
      recus += value.byteLength;
      // Le garde-fou coupe le flux au lieu de remplir le disque. Lever ici
      // interrompt `pipeline`, qui détruit le fichier temporaire ouvert ; le
      // `catch` ci-dessous l'efface pour de bon.
      if (recus > maxOctets) throw new Error(`copie trop volumineuse (> ${Math.round(maxOctets / 2 ** 20)} Mo)`);
      yield Buffer.from(value);
    }
  }

  try {
    // Les deux formes écrites en toutes lettres : la surcharge variadique de
    // `pipeline` ne se type pas depuis un tableau construit, et un
    // `@ts-expect-error` masquerait aussi bien une vraie erreur.
    if (dejaGzip) await pipeline(Readable.from(source()), createWriteStream(temporaire));
    else await pipeline(Readable.from(source()), createGzip(), createWriteStream(temporaire));
    // Le renommage est le SEUL moment où le nom définitif apparaît : avant
    // lui, rien sur le disque ne ressemble à une archive.
    await rename(temporaire, chemin);
    const { size } = await stat(chemin);
    return { ok: true as const, chemin, octets: size };
  } catch (e) {
    await rm(temporaire, { force: true });
    return { ok: false as const, raison: e instanceof Error ? e.message : String(e) };
  }
}

export interface Archive {
  id: number;
  nom: string;
  octets: number;
  mtime: number;
}

/**
 * La marche du dossier, en UN endroit : readdir, noms filtrés par `ID_DE`,
 * taille et date au stat. Elle était recopiée à l'identique par
 * `inventorier`, `purgerOrphelins` et `appliquerBudget` — trois occasions de
 * diverger sur ce qui compte comme une archive, alors que c'est précisément
 * la question que le `.partiel` rend délicate.
 *
 * Répertoire absent : l'état normal d'un dossier neuf, pas une erreur.
 * Trié par identifiant, pour que tout appelant reçoive un ordre déterminé.
 */
export async function lireArchives(dossierArchives: string): Promise<Archive[]> {
  let noms: string[];
  try {
    noms = await readdir(dossierArchives);
  } catch {
    return [];
  }
  const out: Archive[] = [];
  for (const nom of noms) {
    const id = ID_DE(nom);
    if (id === undefined) continue;
    const s = await stat(join(dossierArchives, nom));
    out.push({ id, nom, octets: s.size, mtime: s.mtimeMs });
  }
  return out.sort((a, b) => a.id - b.id);
}

/**
 * Ce qui est archivé, lisible par l'interface (spec sélection §4.1).
 *
 * La forme reste PLATE (`ids`, `octets`) : cette valeur part telle quelle en
 * JSON vers le front (`GET /api/backup/archives`), et une `Map` s'y
 * sérialiserait en `{}`.
 */
export async function inventorier(dossierArchives: string): Promise<{ ids: number[]; octets: number }> {
  const archives = await lireArchives(dossierArchives);
  return { ids: archives.map((a) => a.id), octets: archives.reduce((n, a) => n + a.octets, 0) };
}

const ID_DE = (nom: string): number | undefined => {
  const m = /^(\d+)\.html\.gz$/.exec(nom);
  return m ? Number(m[1]) : undefined;
};

/**
 * Une archive dont l'identifiant n'est plus vivant est supprimée. Appelée à
 * chaque balayage complet, où l'ensemble des identifiants est justement connu
 * (correction §1bis n°2) — sans quoi l'archive d'un signet effacé resterait
 * indéfiniment sous un identifiant qui ne résout plus.
 */
export async function purgerOrphelins(dossierArchives: string, idsVivants: Set<number>): Promise<number> {
  let supprimes = 0;
  for (const a of await lireArchives(dossierArchives)) {
    if (idsVivants.has(a.id)) continue;
    await rm(join(dossierArchives, a.nom), { force: true });
    supprimes++;
  }
  return supprimes;
}

/**
 * Au-delà du budget, les archives les PLUS ANCIENNES sont évincées jusqu'à
 * repasser sous le seuil. Une archive évincée se recrée à la demande —
 * l'endpoint `/cache` reste la source. Pas d'exception pour les liens morts :
 * une règle unique vaut mieux qu'une exception qui rouvrirait la croissance
 * sans borne.
 */
export async function appliquerBudget(dossierArchives: string, maxOctets: number): Promise<number> {
  const fichiers = await lireArchives(dossierArchives);
  let total = fichiers.reduce((n, f) => n + f.octets, 0);
  fichiers.sort((a, b) => a.mtime - b.mtime); // le plus ancien d'abord
  let evinces = 0;
  for (const f of fichiers) {
    if (total <= maxOctets) break;
    await rm(join(dossierArchives, f.nom), { force: true });
    total -= f.octets;
    evinces++;
  }
  return evinces;
}
