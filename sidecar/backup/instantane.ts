//! L'écriture d'un instantané, et sa relecture immédiate.
//!
//! §6 : « une archive jamais relue est une archive qu'on CROIT bonne, et
//! c'est le mode de défaillance qu'une sauvegarde existe pour exclure ».
//! Le JSONL (§4.2) permet ici deux choses, et deux seulement : écrire en flux
//! sans charger 11 Mo en mémoire, et relire ligne à ligne (la vérification,
//! la fusion incrémentale).
//!
//! PAS la reprise d'une sauvegarde interrompue. `ouvrirJsonl` TRONQUE le
//! fichier — c'est délibéré, et un test le verrouille. Le format la rendra
//! possible le jour où quelqu'un l'écrira (relire les lignes déjà bonnes,
//! rouvrir en ajout, repartir à la page correspondante) ; ce lot ne l'a pas
//! fait, et une sauvegarde interrompue recommence de zéro. La capacité est
//! DIFFÉRÉE, pas acquise : la vendre ici ferait exactement ce que la spec
//! s'interdit — promettre ce que le code ne tient pas.

import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { once } from "node:events";

export interface EcrivainJsonl {
  ligne(objet: unknown): Promise<void>;
  fermer(): Promise<{ lignes: number; sha256: string }>;
}

export async function ouvrirJsonl(chemin: string): Promise<EcrivainJsonl> {
  await mkdir(dirname(chemin), { recursive: true });
  const flux = createWriteStream(chemin, { encoding: "utf8" });
  // L'empreinte se calcule AU FIL de l'écriture : relire 11 Mo pour la
  // produire doublerait la lecture disque sans rien apporter.
  const hash = createHash("sha256");
  let lignes = 0;
  return {
    async ligne(objet) {
      const texte = JSON.stringify(objet) + "\n";
      hash.update(texte);
      lignes++;
      if (!flux.write(texte)) await once(flux, "drain");
    },
    async fermer() {
      await new Promise<void>((r, j) => flux.end((e?: Error) => (e ? j(e) : r())));
      return { lignes, sha256: hash.digest("hex") };
    },
  };
}

export async function sha256Fichier(chemin: string): Promise<string> {
  return createHash("sha256").update(await readFile(chemin)).digest("hex");
}

export interface VerdictVerification {
  ok: boolean;
  lignes: number;
  raison?: string;
}

/**
 * Relit ce qui vient d'être écrit : nombre de lignes, validité JSON de
 * CHACUNE, puis empreinte. Dans cet ordre — une ligne tronquée se nomme
 * mieux qu'une empreinte qui diffère, et l'utilisateur mérite de savoir
 * LAQUELLE.
 */
export async function verifierJsonl(
  chemin: string,
  attendu: { lignes: number; sha256: string },
): Promise<VerdictVerification> {
  let brut: string;
  try {
    brut = await readFile(chemin, "utf8");
  } catch (e) {
    return { ok: false, lignes: 0, raison: `illisible : ${e instanceof Error ? e.message : String(e)}` };
  }
  const lignes = brut === "" ? [] : brut.replace(/\n$/, "").split("\n");
  for (const [i, l] of lignes.entries()) {
    try {
      JSON.parse(l);
    } catch {
      return { ok: false, lignes: lignes.length, raison: `ligne ${i + 1} n'est pas du JSON valide` };
    }
  }
  if (lignes.length !== attendu.lignes) {
    return { ok: false, lignes: lignes.length, raison: `${lignes.length} lignes au lieu de ${attendu.lignes}` };
  }
  if ((await sha256Fichier(chemin)) !== attendu.sha256) {
    return { ok: false, lignes: lignes.length, raison: "empreinte différente de celle écrite" };
  }
  return { ok: true, lignes: lignes.length };
}

/** `2026-09-16T15-30-00` — utilisable comme nom de dossier (§4.2). */
export function horodatage(d: Date = new Date()): string {
  return d.toISOString().slice(0, 19).replace(/:/g, "-");
}
