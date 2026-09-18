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

import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gzip } from "node:zlib";
import { promisify } from "node:util";

const comprimer = promisify(gzip);

/** La signature d'un flux gzip : `1f 8b`. */
const estGzip = (b: Buffer): boolean => b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b;

/** Budget par défaut du dossier d'archives (correction §1bis n°2). */
export const ARCHIVES_MAX_GO = 5;

interface File {
  run<T>(fn: () => Promise<T>, o?: { rang?: "interactif" | "fond" }): Promise<T>;
}

export async function archiver(deps: {
  token: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  file: File;
  dossierArchives: string;
  raindropId: number;
  timeoutMs?: number;
}): Promise<{ ok: true; chemin: string; octets: number } | { ok: false; raison: string }> {
  const base = deps.baseUrl ?? "https://api.raindrop.io/rest/v1";
  const f = deps.fetchImpl ?? fetch;
  const delai = deps.timeoutMs ?? 60_000;

  return deps.file.run(async () => {
    try {
      const r1 = await f(`${base}/raindrop/${deps.raindropId}/cache`, {
        headers: { Authorization: `Bearer ${deps.token}` },
        redirect: "manual",
        signal: AbortSignal.timeout(delai),
      });
      const cible = r1.headers.get("location");
      if (!cible) {
        return { ok: false as const, raison: `pas de redirection (http ${r1.status})` };
      }
      // Second appel SANS en-tête d'authentification : l'URL est déjà signée.
      const r2 = await f(cible, { signal: AbortSignal.timeout(delai) });
      if (!r2.ok) return { ok: false as const, raison: `copie inaccessible (http ${r2.status})` };
      const recu = Buffer.from(await r2.arrayBuffer());
      // MESURÉ le 2026-09-18 : S3 sert l'objet avec `Content-Encoding: gzip`,
      // et `fetch` (undici) le DÉPLIE de façon transparente — `arrayBuffer()`
      // rend donc du HTML EN CLAIR. Écrit « tel quel », il portait un nom
      // `.html.gz` que `gunzip` refuse, et pesait 5,6 Mo là où l'objet stocké
      // en fait 3,1. On recomprime : le nom redevient vrai et le budget §5.4
      // retrouve l'ordre de grandeur sur lequel il a été calibré.
      // Le test le manquait parce que le faux serveur n'annonçait pas
      // l'encodage — undici laissait alors passer les octets gzippés.
      const octets = estGzip(recu) ? recu : await comprimer(recu);
      await mkdir(deps.dossierArchives, { recursive: true });
      const chemin = join(deps.dossierArchives, `${deps.raindropId}.html.gz`);
      await writeFile(chemin, octets);
      return { ok: true as const, chemin, octets: octets.byteLength };
    } catch (e) {
      return { ok: false as const, raison: e instanceof Error ? e.message : String(e) };
    }
  }, { rang: "fond" });
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
  let noms: string[];
  try {
    noms = await readdir(dossierArchives);
  } catch {
    return 0; // pas encore d'archives
  }
  for (const nom of noms) {
    const id = ID_DE(nom);
    if (id !== undefined && !idsVivants.has(id)) {
      await rm(join(dossierArchives, nom), { force: true });
      supprimes++;
    }
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
  let noms: string[];
  try {
    noms = await readdir(dossierArchives);
  } catch {
    return 0;
  }
  const fichiers = [];
  for (const nom of noms) {
    if (ID_DE(nom) === undefined) continue;
    const s = await stat(join(dossierArchives, nom));
    fichiers.push({ nom, octets: s.size, mtime: s.mtimeMs });
  }
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
