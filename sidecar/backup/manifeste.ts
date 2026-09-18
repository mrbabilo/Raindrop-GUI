//! L'inventaire des instantanés, et la règle de rétention.
//!
//! ÉCRITURE ATOMIQUE (correction §1bis n°7) : `manifest.json` est le SEUL
//! fichier réécrit à chaque passage — les instantanés, eux, naissent dans un
//! dossier neuf. Une coupure en cours d'écriture le laisserait tronqué, et
//! avec lui l'inventaire de toutes les sauvegardes.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const FICHIER = "manifest.json";

export interface EntreeInstantane {
  horodatage: string;
  complet: boolean;
  count: number;
  watermark: string;
  empreintes: Record<string, { lignes: number; sha256: string }>;
}

export interface Manifeste {
  version: 1;
  instantanes: EntreeInstantane[];
}

/** Un dossier vierge ou un manifeste illisible rend un inventaire vide : la
 *  prochaine sauvegarde repartira complète, et le dira (§4.1). */
export async function lireManifeste(dossier: string): Promise<Manifeste> {
  try {
    const m = JSON.parse(await readFile(join(dossier, FICHIER), "utf8")) as Manifeste;
    if (m.version === 1 && Array.isArray(m.instantanes)) return m;
  } catch {
    /* absent, tronqué, ou d'une version inconnue */
  }
  return { version: 1, instantanes: [] };
}

export async function ecrireManifeste(dossier: string, m: Manifeste): Promise<void> {
  await mkdir(dossier, { recursive: true });
  const cible = join(dossier, FICHIER);
  const temporaire = `${cible}.en-cours`;
  await writeFile(temporaire, JSON.stringify(m, null, 2), "utf8");
  // Renommage sur le MÊME système de fichiers : atomique.
  await rename(temporaire, cible);
}

export function dernierValide(m: Manifeste): EntreeInstantane | undefined {
  return [...m.instantanes].reverse().find((i) => i.complet);
}

/** Lundi de la semaine d'un horodatage `2026-09-16T10-00-00`, en `YYYY-MM-DD`. */
function semaineDe(horodatage: string): string {
  const d = new Date(`${horodatage.slice(0, 10)}T00:00:00Z`);
  const jour = (d.getUTCDay() + 6) % 7; // lundi = 0
  d.setUTCDate(d.getUTCDate() - jour);
  return d.toISOString().slice(0, 10);
}

/**
 * Les 7 derniers, plus le PLUS ANCIEN de chacune des 4 semaines précédentes.
 *
 * La promotion se calcule à partir des instantanés PRÉSENTS, jamais d'un
 * calendrier théorique (§5.5) : si l'app reste fermée trois semaines, les
 * semaines sans instantané restent vides — rien n'est fabriqué, rien n'est
 * purgé à tort.
 */
export function aConserver(horodatages: string[], maintenant: Date): string[] {
  const tries = [...horodatages].sort();
  const garde = new Set(tries.slice(-7));
  const semaineCourante = semaineDe(maintenant.toISOString().slice(0, 19).replace(/:/g, "-"));

  const parSemaine = new Map<string, string>();
  for (const h of tries) {
    const s = semaineDe(h);
    if (s === semaineCourante) continue;
    // Le plus ancien : `tries` est croissant, donc le premier vu gagne.
    if (!parSemaine.has(s)) parSemaine.set(s, h);
  }
  // Les quatre semaines précédentes les plus récentes.
  for (const h of [...parSemaine.entries()].sort().slice(-4).map(([, v]) => v)) {
    garde.add(h);
  }
  return tries.filter((h) => garde.has(h));
}
