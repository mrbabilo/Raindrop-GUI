//! Ce que le manifeste ne cite pas, et qui pourtant occupe le disque.
//!
//! Deux situations produisent des dossiers orphelins, et la rotation ne les
//! voit NI l'une NI l'autre — elle n'itère que sur les horodatages du
//! manifeste :
//!
//! - une **exception en cours de balayage** laisse un dossier partiel
//!   (~11 Mo), hors de tout budget : le §5.4 ne borne que `archives/` ;
//! - un **manifeste corrompu** rend un inventaire vide, et la sauvegarde
//!   suivante en réécrit un qui ne porte que sa propre entrée : tous les
//!   dossiers antérieurs deviennent irrécupérables, pour toujours.
//!
//! `meta.json` tranche entre les deux. Il s'écrit EN DERNIER, et son rôle est
//! déjà écrit dans `enregistrement.ts` : « le manifeste peut être perdu, le
//! dossier lu seul, l'instantané reste capable de dire s'il ment ». Sa
//! présence signe donc un instantané que le manifeste a oublié ; son absence,
//! un balayage mort en route.

import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { NOMS } from "./collecte.js";
import type { EntreeInstantane, Manifeste } from "./manifeste.js";

/** Le dossier des copies permanentes : il a ses propres règles (§5.4). */
const HORS_INSTANTANES = new Set(["archives"]);

/** Les champs qu'un `meta.json` doit porter pour valoir ré-adoption. */
function entreeDepuisMeta(valeur: unknown, horodatage: string): EntreeInstantane | undefined {
  if (typeof valeur !== "object" || valeur === null) return undefined;
  const m = valeur as { complet?: unknown; count?: unknown; watermark?: unknown };
  if (typeof m.complet !== "boolean" || typeof m.count !== "number" || typeof m.watermark !== "string") {
    return undefined;
  }
  return {
    // L'horodatage vient du NOM DU DOSSIER, pas du meta : c'est lui que la
    // rotation efface, et un meta qui se tromperait de nom ferait supprimer
    // un dossier voisin.
    horodatage,
    complet: m.complet,
    count: m.count,
    watermark: m.watermark,
    // Volontairement VIDE : on ne peut rien garantir d'un dossier que le
    // manifeste avait oublié, et recalculer les empreintes depuis les
    // fichiers ne prouverait rien (elles coïncideraient par construction).
    // Sans empreinte, `raisonDeBasculer` repart en balayage complet plutôt
    // que de bâtir sur cet instantané — le repli honnête.
    empreintes: {},
  };
}

/**
 * Confronte les dossiers présents au manifeste. Rend les entrées à RÉ-ADOPTER
 * (l'appelant les joint aux siennes avant la rotation) ; supprime au passage
 * les dossiers partiels, en le disant.
 *
 * Un dossier de sauvegarde absent ou illisible n'est pas une panne : il n'y a
 * simplement rien à réconcilier.
 */
export async function reconcilier(
  dossier: string,
  m: Manifeste,
  avertir: (message: string, champs?: Record<string, unknown>) => void,
): Promise<EntreeInstantane[]> {
  let entrees;
  try {
    entrees = await readdir(dossier, { withFileTypes: true });
  } catch {
    return [];
  }
  const cites = new Set(m.instantanes.map((i) => i.horodatage));
  const adoptes: EntreeInstantane[] = [];
  for (const e of entrees) {
    if (!e.isDirectory() || HORS_INSTANTANES.has(e.name) || cites.has(e.name)) continue;
    const chemin = join(dossier, e.name);
    let meta: unknown;
    try {
      meta = JSON.parse(await readFile(join(chemin, NOMS.meta), "utf8"));
    } catch {
      meta = undefined;
    }
    const entree = meta === undefined ? undefined : entreeDepuisMeta(meta, e.name);
    if (entree) {
      adoptes.push(entree);
      avertir("instantané absent du manifeste, ré-adopté", { horodatage: e.name });
      continue;
    }
    // Ramasser des mégaoctets en silence serait aussi mauvais que les laisser
    // fuir : on dit ce qu'on efface, et pourquoi.
    avertir("dossier d'instantané partiel ramassé (meta.json absent ou illisible)", { horodatage: e.name });
    await rm(chemin, { recursive: true, force: true });
  }
  return adoptes;
}
