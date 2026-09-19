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
  dernierValide,
  ecrireManifeste,
  type EntreeInstantane,
  type Manifeste,
} from "./manifeste.js";
import { reconcilier } from "./reconciliation.js";
import type { ResultatSauvegarde } from "./contrat-sauvegarde.js";

/** Ce que le ménage des archives a retiré, quand il a retiré quelque chose.
 *  ABSENT (et non deux zéros) lorsqu'aucun ménage n'a eu lieu — un balayage
 *  annulé n'en fait pas : deux zéros inventés se liraient comme un fait
 *  vérifié, la leçon du `bookmarksCount` à zéro. */
export interface Menage {
  orphelines: number;
  evincees: number;
}

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
  const enregistrer = async (m: Manifeste, entree: EntreeInstantane, ids?: Set<number>): Promise<Menage | undefined> => {
    // `entree.complet` est la PRÉCONDITION de la purge, pas un détail : sur un
    // balayage annulé, `balayerComplet` rend le `Set` de ce qu'il a vu JUSQUE-LÀ
    // (page 40 sur 245 → ~2 000 identifiants sur 12 210). Purger là-dessus
    // effacerait les archives de 10 000 signets bien vivants — et une archive
    // est précisément ce qu'on ne peut plus recréer quand la page est morte,
    // c'est-à-dire la raison même de l'archivage. `archives.ts` pose la
    // précondition en toutes lettres : « l'ensemble des identifiants est
    // justement connu ». Elle ne tient que si le balayage est allé au bout.
    let menage: Menage | undefined;
    if (ids && entree.complet) {
      const orphelines = await purgerOrphelins(archives, ids);
      const evincees = await appliquerBudget(archives, ARCHIVES_MAX_GO * 2 ** 30);
      // DIT, pas fait en silence. Le budget de 5 Go tient ~1 600 archives à
      // la taille réelle (3,18 Mo en moyenne, et non les 2,1 Mo sur lesquels
      // il a été calibré) : l'éviction n'est donc pas un cas limite, elle
      // arrivera — au cours d'une sauvegarde de fond que l'utilisateur n'a
      // pas demandée, et qui effacerait sans un mot des copies permanentes
      // qu'il croyait gardées. §5.4 assume qu'« une archive évincée se recrée
      // à la demande » ; encore faut-il savoir qu'elle a disparu.
      if (orphelines > 0 || evincees > 0) {
        avertir("ménage des archives", { orphelines, evincees });
        menage = { orphelines, evincees };
      }
    }
    // Avant de décider quoi garder : confronter les dossiers PRÉSENTS au
    // manifeste. Sans cela, un balayage mort en route laisse ~11 Mo que rien
    // ne ramasse, et un manifeste corrompu (inventaire vide) fait perdre la
    // trace de tous les dossiers antérieurs — qui survivent sur le disque
    // sans que la rotation puisse plus jamais les atteindre.
    // `entree` est joint à ce qu'on déclare connu : son dossier VIENT d'être
    // écrit, meta.json compris, et il serait sinon ré-adopté comme orphelin —
    // en double avec lui-même.
    const adoptes = await reconcilier(deps.dossier, { version: 1, instantanes: [...m.instantanes, entree] }, avertir);
    const toutes = [...m.instantanes, ...adoptes, entree];
    const gardes = new Set(aConserver(toutes.map((i) => i.horodatage), maintenant()));
    // L'instantané qu'on vient d'écrire et de vérifier n'est JAMAIS celui que
    // la rotation efface : horloge qui recule, ou manifeste portant des
    // entrées plus récentes, et il tombe hors des « 7 derniers ».
    gardes.add(entree.horodatage);
    // Et la DERNIÈRE SAUVEGARDE VALIDE, pour la même raison. `aConserver` ne
    // reçoit que des chaînes : elle ne peut structurellement pas protéger un
    // instantané pour sa validité. Or l'annulation est un bouton, et chaque
    // annulation écrit une entrée `complet: false` : sept annulations dans la
    // même semaine calendaire chassent le seul instantané valide hors des
    // « 7 derniers », sans que la promotion hebdomadaire le rattrape (elle
    // ignore la semaine courante). Son dossier serait effacé ET sa ligne
    // retirée du manifeste — il ne resterait même pas la trace qu'une bonne
    // sauvegarde a existé.
    const valide = dernierValide({ version: 1, instantanes: toutes });
    if (valide) gardes.add(valide.horodatage);
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
    return menage;
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
    const menage = await enregistrer(arg.m, entree, arg.ids);
    if (raison) avertir("instantané incomplet", { horodatage: arg.horodatage, raison });
    return {
      ...entree,
      ...(raison === undefined ? {} : { raison }),
      ...(arg.bascule === undefined ? {} : { bascule: arg.bascule }),
      ...(menage === undefined ? {} : { menage }),
    };
  };

  return finir;
}
