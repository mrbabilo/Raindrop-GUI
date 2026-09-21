//! La lecture du contenu archivé (spec lecture §3) : le `.html.gz` rendu
//! DÉCOMPRIMÉ EN FLUX — jamais la copie entière en mémoire, la leçon de
//! l'écriture (lot 2026-09-18) appliquée à la lecture.
//!
//! Le refus NOMMÉ n'est possible qu'AVANT le premier octet envoyé. D'où des
//! contrôles à froid, sur le seul descripteur de fichier :
//! - la magie `1f 8b` sur les deux premiers octets : un fichier qui n'est
//!   pas gzip est nommé « illisible » au lieu d'exploser à mi-flux ;
//! - `ISIZE` (les 4 derniers octets d'un gzip) porte la taille décompressée
//!   **modulo 2^32** — lisible en 4 octets, là où décompresser pour compter
//!   coûterait la lecture entière. Le dépassement de modulo n'est pas
//!   atteignable : l'écriture coupe à 256 Mo (`ARCHIVE_MAX_OCTETS`), aucun
//!   fichier de ce dossier ne peut annoncer un ISIZE enveloppé.
//!
//! La corruption EN COURS de flux reste possible (en-tête vrai, corps faux) :
//! le flux s'interrompt alors, le sidecar ne plante pas (testé), et le front
//! nomme l'échec « archive illisible » (spec §5).

import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";

/** Garde de décompression (spec lecture §3). MESURÉ (2026-09-19) : le p99
 *  stocké (31,5 Mo) sort à ~47 Mo décompressé (rapport 1,5×) — seuls les
 *  hors-normes (≈ > 42 Mo stockés) la rencontrent. */
export const LECTURE_MAX_OCTETS = 64 * 2 ** 20;

export type ContenuArchive =
  | { ok: true; flux: ReadableStream<Uint8Array>; dateIso: string }
  | { ok: false; raison: "introuvable" | "trop-volumineuse" | "illisible"; detail: string };

export async function lireContenu(dossierArchives: string, id: number): Promise<ContenuArchive> {
  // `id` est déjà un entier (la route l'a validé) : le nom de fichier n'est
  // pas un chemin négociable.
  const chemin = join(dossierArchives, `${id}.html.gz`);
  let fh: Awaited<ReturnType<typeof open>>;
  try {
    fh = await open(chemin, "r");
  } catch {
    return { ok: false, raison: "introuvable", detail: `aucune archive pour le signet ${id}` };
  }
  try {
    const s = await fh.stat();
    // 18 octets = 10 d'en-tête + 8 de pied gzip : en dessous, rien à déplier.
    if (s.size < 18) {
      return { ok: false, raison: "illisible", detail: `archive trop courte (${s.size} octets) pour être un gzip` };
    }
    const magie = Buffer.alloc(2);
    await fh.read(magie, 0, 2, 0);
    if (!(magie[0] === 0x1f && magie[1] === 0x8b)) {
      return { ok: false, raison: "illisible", detail: "l'archive n'est pas du gzip (signature absente)" };
    }
    const isize = Buffer.alloc(4);
    await fh.read(isize, 0, 4, s.size - 4);
    const decomprime = isize.readUInt32LE(0);
    if (decomprime > LECTURE_MAX_OCTETS) {
      return {
        ok: false,
        raison: "trop-volumineuse",
        detail: `décompressée, l'archive dépasserait la garde de ${Math.round(LECTURE_MAX_OCTETS / 2 ** 20)} Mo (ISIZE annonce ${decomprime})`,
      };
    }
    const flux = Readable.toWeb(createReadStream(chemin).pipe(createGunzip())) as ReadableStream<Uint8Array>;
    return { ok: true, flux, dateIso: s.mtime.toISOString() };
  } finally {
    await fh.close();
  }
}
