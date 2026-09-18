//! L'orchestration : quel mode, dans quel ordre, et ce qu'on ose écrire au
//! manifeste.
//!
//! Deux promesses tiennent ici, et nulle part ailleurs :
//!   - `complet` n'est JAMAIS forcé à `true` — il vient du résultat du
//!     balayage. Sans cela, la garde `dernierValide()` (Task 6) continuerait
//!     de fonctionner parfaitement sur une donnée qui ment ;
//!   - un instantané dont l'empreinte ne se vérifie plus ne sert JAMAIS de
//!     base à un incrémental (§6) : sans cela une corruption silencieuse se
//!     propagerait de sauvegarde en sauvegarde, et deviendrait l'histoire.

import { access, rm } from "node:fs/promises";
import { join } from "node:path";
import { appliquerBudget, purgerOrphelins, ARCHIVES_MAX_GO } from "./archives.js";
import {
  balayerEtRelire,
  collecterAuxiliaires,
  ecrireDocument,
  fusionner,
  NOMS,
  type Piece,
} from "./collecte.js";
import {
  doitBalayerComplet,
  doitSauvegarderAuDemarrage,
  JOURS_BALAYAGE_COMPLET,
} from "./decision.js";
import { lireModifies } from "./incremental.js";
import { horodatage, verifierJsonl } from "./instantane.js";
import {
  aConserver,
  dernierValide,
  ecrireManifeste,
  lireManifeste,
  type EntreeInstantane,
  type Manifeste,
} from "./manifeste.js";
import type { Lecture } from "./lecture.js";
import type { JobHandle } from "../jobs/store.js";

export interface ResultatSauvegarde extends EntreeInstantane {
  /** Renseigné quand un incrémental a dû basculer en balayage complet : c'est
   *  le « et le dit » de §6, porté jusqu'au résultat du job (donc jusqu'à
   *  l'interface), pas seulement jusqu'aux journaux. Volontairement HORS de
   *  l'entrée écrite au manifeste, qui reste un `EntreeInstantane` nu. */
  bascule?: string;
  /** Pourquoi l'instantané n'est pas complet, le cas échéant. */
  raison?: string;
}

export interface StatutSauvegarde {
  actif: boolean;
  dossier?: string;
  raison?: string;
  dernier?: EntreeInstantane | null;
  instantanes?: number;
}

export interface Sauvegarde {
  executer(mode: "complet" | "incremental", job?: JobHandle): Promise<ResultatSauvegarde>;
  doitBalayerComplet(m: Manifeste, maintenant: Date): boolean;
  doitSauvegarderAuDemarrage(m: Manifeste, maintenant: Date): boolean;
  statut(): Promise<StatutSauvegarde>;
}

interface File {
  run<T>(fn: () => Promise<T>, o?: { rang?: "interactif" | "fond" }): Promise<T>;
}

export interface DepsSauvegarde {
  lecture: Lecture;
  dossier: string;
  /** Réservés à l'archivage à la demande (§5.4, `archiver`) : l'orchestration
   *  ne fait que purger et borner le dossier d'archives. */
  file: File;
  token: string;
  avertir?: (message: string, champs?: Record<string, unknown>) => void;
  maintenant?: () => Date;
}

export function makeSauvegarde(deps: DepsSauvegarde): Sauvegarde {
  const maintenant = deps.maintenant ?? (() => new Date());
  const avertir = deps.avertir ?? (() => undefined);
  const archives = join(deps.dossier, "archives");

  /** Un nom de dossier LIBRE : deux instantanés de la même seconde
   *  partageraient le même nom, et le second écraserait le premier — or §6
   *  promet l'inverse, « jamais d'écrasement avant écriture réussie ». La
   *  seconde suivante garde un horodatage canonique, donc analysable. */
  const horodatageLibre = async (debut: Date): Promise<string> => {
    let d = debut;
    for (;;) {
      const h = horodatage(d);
      try {
        await access(join(deps.dossier, h));
        d = new Date(d.getTime() + 1000);
      } catch {
        return h;
      }
    }
  };

  /** Le watermark se relève AVANT le balayage. Relevé après, un élément
   *  modifié PENDANT le balayage mais déjà écrit dans son état d'avant
   *  porterait une date inférieure au watermark : l'incrémental suivant ne le
   *  relirait jamais — perte silencieuse et définitive. Relevé avant, il est
   *  relu une fois de trop, ce qui est sans effet. */
  const releverWatermark = async (): Promise<string> => {
    const p = await deps.lecture.page(0, { sort: "-lastUpdate", page: 0, perpage: 1 });
    return (p.items[0] as { lastUpdate?: string } | undefined)?.lastUpdate ?? "";
  };

  const enregistrer = async (
    m: Manifeste,
    entree: EntreeInstantane,
    ids: Set<number> | undefined,
  ): Promise<void> => {
    if (ids) {
      await purgerOrphelins(archives, ids);
      await appliquerBudget(archives, ARCHIVES_MAX_GO * 2 ** 30);
    }
    const toutes = [...m.instantanes, entree];
    const gardes = new Set(aConserver(toutes.map((i) => i.horodatage), maintenant()));
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
  const finir = async (arg: {
    m: Manifeste;
    horodatage: string;
    cible: string;
    pieces: Piece[];
    count: number;
    watermark: string;
    ids?: Set<number>;
    bascule?: string;
    ecart?: string;
  }): Promise<ResultatSauvegarde> => {
    const complet = arg.pieces.every((p) => p.fidele) && arg.ecart === undefined;
    const raisons = [...arg.pieces.map((p) => p.raison), arg.ecart].filter((r): r is string => !!r);
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

  const balayerTout = async (m: Manifeste, job?: JobHandle, bascule?: string): Promise<ResultatSauvegarde> => {
    const h = await horodatageLibre(maintenant());
    const cible = join(deps.dossier, h);
    const watermark = await releverWatermark();
    const commun = { lecture: deps.lecture, dossier: cible };
    const principal = await balayerEtRelire({
      ...commun,
      nom: NOMS.raindrops,
      collectionId: 0,
      onProgress: (faits, total) => job?.progress(faits, total, "bookmarks"),
      annule: () => job?.isCancelled() ?? false,
    });
    // La corbeille contient ce que l'utilisateur vient de supprimer, donc
    // exactement ce qu'une sauvegarde doit pouvoir rendre (§5.1).
    const corbeille = await balayerEtRelire({
      ...commun,
      nom: NOMS.corbeille,
      collectionId: -99,
      annule: () => job?.isCancelled() ?? false,
    });
    const aux = await collecterAuxiliaires(commun);
    return finir({
      m,
      horodatage: h,
      cible,
      pieces: [principal, corbeille, ...aux],
      count: principal.count,
      watermark,
      ...(principal.ids ? { ids: principal.ids } : {}),
      ...(bascule === undefined ? {} : { bascule }),
    });
  };

  /** Pourquoi l'incrémental est impossible — ou `undefined` s'il l'est. */
  const raisonDeBasculer = async (m: Manifeste): Promise<string | undefined> => {
    const base = dernierValide(m);
    if (!base) return "aucune sauvegarde complète disponible — balayage complet";
    if (doitBalayerComplet(m, maintenant())) {
      return `plus de ${JOURS_BALAYAGE_COMPLET} jours sans balayage complet — balayage complet (§5.3)`;
    }
    const attendue = base.empreintes[NOMS.raindrops];
    if (!attendue) return `l'instantané ${base.horodatage} n'a pas d'empreinte — balayage complet`;
    const v = await verifierJsonl(join(deps.dossier, base.horodatage, NOMS.raindrops), attendue);
    if (!v.ok) {
      return `l'instantané ${base.horodatage} ne se vérifie plus (${v.raison ?? "?"}) — balayage complet`;
    }
    return undefined;
  };

  const rafraichir = async (m: Manifeste, job?: JobHandle): Promise<ResultatSauvegarde> => {
    const base = dernierValide(m)!;
    const { modifies, nouveauWatermark } = await lireModifies({
      lecture: deps.lecture,
      collectionId: 0,
      watermark: base.watermark,
    });
    job?.progress(modifies.length, modifies.length, "éléments modifiés");
    const h = await horodatageLibre(maintenant());
    const cible = join(deps.dossier, h);
    const principal = await fusionner({
      source: join(deps.dossier, base.horodatage, NOMS.raindrops),
      dossier: cible,
      nom: NOMS.raindrops,
      modifies,
    });
    const corbeille = await balayerEtRelire({
      lecture: deps.lecture,
      dossier: cible,
      nom: NOMS.corbeille,
      collectionId: -99,
    });
    const aux = await collecterAuxiliaires({ lecture: deps.lecture, dossier: cible });
    // §5.3 — l'angle mort du tri par modification : un élément supprimé
    // ailleurs ne change aucune date, il ne remonterait jamais. Le compte
    // distant le trahit pour UNE requête ; l'instantané se déclare alors
    // incomplet plutôt que de prétendre refléter la bibliothèque.
    const distant = await deps.lecture.compteur(0);
    const ecart =
      distant === principal.count
        ? undefined
        : `le compte distant (${distant}) diverge du fusionné (${principal.count}) — un balayage complet est nécessaire`;
    return finir({
      m,
      horodatage: h,
      cible,
      pieces: [principal, corbeille, ...aux],
      count: principal.count,
      watermark: nouveauWatermark,
      ...(ecart === undefined ? {} : { ecart }),
    });
  };

  return {
    doitBalayerComplet,
    doitSauvegarderAuDemarrage,
    statut: async () => {
      const m = await lireManifeste(deps.dossier, avertir);
      return {
        actif: true,
        dossier: deps.dossier,
        dernier: dernierValide(m) ?? null,
        instantanes: m.instantanes.length,
      };
    },
    executer: async (mode, job) => {
      const m = await lireManifeste(deps.dossier, avertir);
      if (mode === "complet") return balayerTout(m, job);
      const bascule = await raisonDeBasculer(m);
      if (bascule === undefined) return rafraichir(m, job);
      avertir("sauvegarde : bascule en balayage complet", { cause: bascule });
      return balayerTout(m, job, bascule);
    },
  };
}
