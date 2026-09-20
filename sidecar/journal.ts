//! La lecture du journal sidecar pour l'interface (consultation depuis les
//! Réglages, spec « journal lisible » 2026-09-20) : le fichier JSONL du jour,
//! parsé ligne à ligne. Une ligne corrompue (coupure en écriture) est SAUTÉE,
//! jamais une erreur — les suivantes restent lisibles. Fichier absent :
//! liste vide, l'état normal d'un premier jour.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface EntreeJournal {
  ts: string;
  level?: string;
  msg: string;
  [champ: string]: unknown;
}

export async function lireJournal(
  logsDir: string,
  opts: { limit?: number } = {},
): Promise<EntreeJournal[]> {
  const limit = opts.limit ?? 500;
  const nom = `sidecar-${new Date().toISOString().slice(0, 10)}.jsonl`;
  let brut: string;
  try {
    brut = await readFile(join(logsDir, nom), "utf8");
  } catch {
    return [];
  }
  const entrees: EntreeJournal[] = [];
  for (const ligne of brut.split("\n")) {
    if (ligne.trim() === "") continue;
    try {
      const e = JSON.parse(ligne) as EntreeJournal;
      if (typeof e?.ts === "string" && typeof e?.msg === "string") entrees.push(e);
    } catch {
      // ligne tronquée : sautée
    }
  }
  return entrees.slice(-limit);
}
