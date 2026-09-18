//! L'enregistrement d'un instantané : `meta.json`, l'entrée au manifeste, la
//! rotation et la purge des archives.
//!
//! Séparé de l'orchestration selon la frontière que le supplément désignait —
//! « la collecte d'un côté, la décision et la rotation de l'autre ». C'est ici
//! que `complet` se décide, en un point unique, par conjonction de ce que les
//! pièces ont rapporté : jamais une constante.

import { rm } from "node:fs/promises";
import { join } from "node:path";
import { appliquerBudget, purgerOrphelins, ARCHIVES_MAX_GO } from "./archives.js";
import { ecrireDocument, NOMS, type Piece } from "./collecte.js";
import {
  aConserver,
  ecrireManifeste,
  type EntreeInstantane,
  type Manifeste,
} from "./manifeste.js";
import type { ResultatSauvegarde } from "./sauvegarde.js";

/** Tout ce qu'un passage a produit, avant d'être jugé et inscrit. */
export interface Bilan {
  m: Manifeste;
  horodatage: string;
  cible: string;
  pieces: Piece[];
  count: number;
  watermark: string;
  ids?: Set<number>;
  bascule?: string;
}

export function makeEnregistreur(deps: {
  dossier: string;
  maintenant: () => Date;
  avertir: (message: string, champs?: Record<string, unknown>) => void;
}): (bilan: Bilan) => Promise<ResultatSauvegarde> {
  const { avertir, maintenant } = deps;
  const archives = join(deps.dossier, "archives");

  /** Archives purgées, manifeste écrit, dossiers évincés — dans cet ordre. */
  const enregistrer = async (m: Manifeste, entree: EntreeInstantane, ids?: Set<number>) => {
    if (ids) {
      await purgerOrphelins(archives, ids);
      await appliquerBudget(archives, ARCHIVES_MAX_GO * 2 ** 30);
    }
    const toutes = [...m.instantanes, entree];
    const gardes = new Set(aConserver(toutes.map((i) => i.horodatage), maintenant()));
    // L'instantané qu'on vient d'écrire et de vérifier n'est JAMAIS celui que
    // la rotation efface : horloge qui recule, ou manifeste portant des
    // entrées plus récentes, et il tombe hors des « 7 derniers ».
    gardes.add(entree.horodatage);
    // Le manifeste D'ABORD, les suppressions ensuite : une coupure entre les
    // deux laisse des dossiers orphelins (inoffensifs), jamais un manifeste
    // qui désigne des dossiers effacés.
    await ecrireManifeste(deps.dossier, {
      version: 1,
      instantanes: toutes.filter((i) => gardes.has(i.horodatage)),
    });
    for (const i of toutes) {
      if (!gardes.has(i.horodatage)) await rm(join(deps.dossier, i.horodatage), { recursive: true, force: true });
    }
  };

  const ecrireDocumentMeta = async (cible: string, meta: unknown): Promise<void> => {
    const p = await ecrireDocument(cible, NOMS.meta, meta);
    if (!p.fidele) avertir("meta.json ne se relit pas", { raison: p.raison });
  };

  /** Le point unique où `complet` se décide : la conjonction de ce que les
   *  pièces ont rapporté. Jamais une constante. */
  const finir = async (arg: Bilan): Promise<ResultatSauvegarde> => {
    const complet = arg.pieces.every((p) => p.fidele);
    const raisons = arg.pieces.map((p) => p.raison).filter((r): r is string => !!r);
    const raison = raisons.length > 0 ? raisons.join(" ; ") : undefined;
    // `meta.json` porte la complétude AU PLUS PRÈS des données (§6) : le
    // manifeste peut être perdu, le dossier lu seul, l'instantané reste
    // capable de dire s'il ment.
    await ecrireDocumentMeta(arg.cible, {
      horodatage: arg.horodatage,
      complet,
      count: arg.count,
      watermark: arg.watermark,
      ...(raison === undefined ? {} : { raison }),
      ...(arg.bascule === undefined ? {} : { bascule: arg.bascule }),
    });
    const entree: EntreeInstantane = {
      horodatage: arg.horodatage,
      complet,
      count: arg.count,
      watermark: arg.watermark,
      empreintes: Object.fromEntries(arg.pieces.map((p) => [p.nom, p.empreinte])),
    };
    await enregistrer(arg.m, entree, arg.ids);
    if (raison) avertir("instantané incomplet", { horodatage: arg.horodatage, raison });
    return {
      ...entree,
      ...(raison === undefined ? {} : { raison }),
      ...(arg.bascule === undefined ? {} : { bascule: arg.bascule }),
    };
  };

  return finir;
}
