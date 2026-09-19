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
import type {
  DepsSauvegarde,
  ResultatSauvegarde,
  Sauvegarde,
} from "./contrat-sauvegarde.js";
import { balayerEtRelire, collecterAuxiliaires, fusionner, NOMS } from "./collecte.js";
import {
  doitBalayerComplet,
  doitSauvegarderAuDemarrage,
  JOURS_BALAYAGE_COMPLET,
} from "./decision.js";
import { lireModifies } from "./incremental.js";
import { horodatage, verifierJsonl } from "./instantane.js";
import { makeEnregistreur, type Menage } from "./enregistrement.js";
import { dernierValide, lireManifeste, type Manifeste } from "./manifeste.js";
import type { Lecture } from "./lecture.js";
import { avecReprise } from "./resilience.js";
import type { JobHandle } from "../jobs/store.js";

export function makeSauvegarde(deps: DepsSauvegarde): Sauvegarde {
  const maintenant = deps.maintenant ?? (() => new Date());
  const avertir = deps.avertir ?? (() => undefined);
  const finir = makeEnregistreur({ dossier: deps.dossier, maintenant, avertir });

  /**
   * La lecture du job : la même, enveloppée d'une reprise en vol (429 →
   * pause, panne réseau → retry). Construite PAR EXÉCUTION et non une fois
   * pour toutes, parce que la reprise doit pouvoir être interrompue par
   * l'annulation de CE job — `deps.lecture`, lui, est partagé et vit depuis
   * le démarrage du sidecar.
   *
   * Sur 245 requêtes, un 429 ou un timeout sont routiniers : sans cela,
   * l'un comme l'autre avortaient le job entier et remettaient 2 min 20 à
   * refaire (§1ter).
   */
  const lectureDe = (job?: JobHandle): Lecture =>
    avecReprise(deps.lecture, {
      annule: () => job?.isCancelled() ?? false,
      avertir,
      ...(deps.dormir ? { dormir: deps.dormir } : {}),
    });

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
  const releverWatermark = async (lecture: Lecture): Promise<string> => {
    const p = await lecture.page(0, { sort: "-lastUpdate", page: 0, perpage: 1 });
    return (p.items[0] as { lastUpdate?: string } | undefined)?.lastUpdate ?? "";
  };

  const balayerTout = async (m: Manifeste, job?: JobHandle, bascule?: string): Promise<ResultatSauvegarde> => {
    const lecture = lectureDe(job);
    const h = await horodatageLibre(maintenant());
    const cible = join(deps.dossier, h);
    const watermark = await releverWatermark(lecture);
    const commun = { lecture, dossier: cible };
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
    // Chaque pièce émet une progression FINALE nommée (spec sélection §3) :
    // un segment sans label ferait geler une barre de progression. Les clés
    // sont stables — le front les traduit (LABELS_PROGRESSION).
    job?.progress(corbeille.count, corbeille.count, "corbeille");
    const aux = await collecterAuxiliaires(commun);
    // Ordre de `collecterAuxiliaires` : collections, surlignages, utilisateur.
    const clesAux = ["collections", "surlignages", "profil"] as const;
    for (const [i, cle] of clesAux.entries()) {
      const piece = aux[i];
      job?.progress(piece?.count ?? 0, piece?.count ?? 0, cle);
    }
    return finir({
      m,
      horodatage: h,
      cible,
      pieces: [principal, corbeille, ...aux],
      count: principal.count,
      watermark,
      // L'UNION des deux jeux : un signet mis à la corbeille est restaurable,
      // et ne garder que les identifiants de la collection 0 ferait purger son
      // archive — alors que la corbeille est justement ce que ce lot tient à
      // sauvegarder.
      ids: new Set([...(principal.ids ?? []), ...(corbeille.ids ?? [])]),
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
    const lecture = lectureDe(job);
    const annule = () => job?.isCancelled() ?? false;
    const { modifies, nouveauWatermark } = await lireModifies({
      lecture,
      collectionId: 0,
      watermark: base.watermark,
    });
    job?.progress(modifies.length, modifies.length, "modifies");
    const h = await horodatageLibre(maintenant());
    const cible = join(deps.dossier, h);
    const principal = await fusionner({
      source: join(deps.dossier, base.horodatage, NOMS.raindrops),
      dossier: cible,
      nom: NOMS.raindrops,
      modifies,
    });
    const corbeille = await balayerEtRelire({
      lecture,
      dossier: cible,
      nom: NOMS.corbeille,
      collectionId: -99,
      annule,
    });
    const aux = await collecterAuxiliaires({ lecture, dossier: cible });
    const pieces = [principal, corbeille, ...aux];
    if (annule()) {
      // L'annulation prime sur l'escalade : relancer 245 requêtes après un
      // « annuler » serait le contraire de ce qui vient d'être demandé. La
      // corbeille, balayée sous la même annulation, a déjà rendu l'instantané
      // incomplet — il ne sera jamais présenté comme valide (§6), et
      // l'interface ne dira plus « annulé » au-dessus d'un instantané qui se
      // prétend bon.
      return finir({ m, horodatage: h, cible, pieces, count: principal.count, watermark: nouveauWatermark });
    }
    // §5.3 — l'angle mort du tri par modification : un élément supprimé
    // ailleurs ne change aucune date, il ne remonterait JAMAIS. Le compte
    // distant le trahit pour UNE requête. Comparé ici, après la fusion, et non
    // avant : avant, le moindre AJOUT ferait diverger le compte et coûterait
    // 245 requêtes, alors que l'incrémental le rattrape déjà (il porte un
    // `lastUpdate` récent). Après, seule la suppression distante subsiste.
    const distant = await lecture.compteur(0);
    if (distant !== principal.count) {
      const ecart = `le compte distant (${distant}) diverge du fusionné (${principal.count}) — balayage complet`;
      // ESCALADE dans la même exécution. S'arrêter à « incomplet » laisserait
      // le prochain incrémental repartir du MÊME watermark, rediverger et se
      // déclarer incomplet à son tour : une seule suppression distante
      // coûterait jusqu'à une semaine sans sauvegarde valide, le temps que la
      // règle des sept jours tire. La fusion n'ayant été ni enregistrée au
      // manifeste ni dotée de son `meta.json`, son dossier s'efface sans rien
      // perdre — le laisser joncherait l'arbre de dossiers que rien ne cite.
      await rm(cible, { recursive: true, force: true });
      avertir("sauvegarde : bascule en balayage complet", { cause: ecart });
      return balayerTout(m, job, ecart);
    }
    return finir({ m, horodatage: h, cible, pieces, count: principal.count, watermark: nouveauWatermark });
  };

  // Une seule sauvegarde en vol à la fois. Deux `executer("balayage")`
  // concurrents partageraient le même horodatage (leurs deux `access()`
  // rendent ENOENT), entrelaceraient deux flux sur le MÊME `raindrops.jsonl`,
  // puis écriraient chacun un manifeste depuis un `m` périmé — la seconde
  // écriture perdant l'entrée de la première, dont le dossier resterait
  // orphelin. Et 2 × 245 requêtes contre un plafond de 120/min. La garde vaut
  // pour CETTE instance ; en production il n'y en a qu'une, dans `deps`.
  let enVol: Promise<ResultatSauvegarde> | undefined;

  const executerSeul = async (
    mode: "balayage" | "incremental",
    job?: JobHandle,
  ): Promise<ResultatSauvegarde> => {
    const m = await lireManifeste(deps.dossier, avertir);
    if (mode === "balayage") return balayerTout(m, job);
    const bascule = await raisonDeBasculer(m);
    if (bascule === undefined) return rafraichir(m, job);
    avertir("sauvegarde : bascule en balayage complet", { cause: bascule });
    return balayerTout(m, job, bascule);
  };

  /**
   * Une erreur arrivée APRÈS une annulation se nomme « annulée ».
   *
   * `balayage.ts` fait déjà ce travail pour ce qui casse PENDANT le balayage :
   * là, un instantané partiel existe, et il se termine proprement en incomplet.
   * Mais tout n'est pas dans le balayage — le relevé du watermark le précède,
   * les pièces auxiliaires le suivent — et une reprise interrompue par
   * l'annulation y relance l'erreur en cours (un 429, un timeout). Sans cette
   * relecture, celui qui vient de cliquer « annuler » lirait « http 429 ».
   *
   * On ne FABRIQUE pas d'instantané pour autant : à ce stade il peut n'y avoir
   * aucun dossier, et en inventer un serait exactement le péché que §6
   * proscrit. Le job échoue — mais il dit pourquoi, et c'est vrai.
   */
  const executerNomme = async (
    mode: "balayage" | "incremental",
    job?: JobHandle,
  ): Promise<ResultatSauvegarde> => {
    try {
      return await executerSeul(mode, job);
    } catch (e) {
      if (!job?.isCancelled()) throw e;
      const cause = e instanceof Error ? e.message : String(e);
      avertir("sauvegarde annulée pendant une reprise", { cause });
      throw new Error("sauvegarde annulée");
    }
  };

  return {
    doitBalayerComplet,
    doitSauvegarderAuDemarrage,
    enCours: () => enVol !== undefined,
    statut: async () => {
      const m = await lireManifeste(deps.dossier, avertir);
      return {
        actif: true,
        dossier: deps.dossier,
        dernier: dernierValide(m) ?? null,
        instantanes: m.instantanes.length,
      };
    },
    executer: (mode, job) => {
      if (enVol) return Promise.reject(new Error("une sauvegarde est déjà en cours"));
      // `executerSeul` court jusqu'à son premier `await` AVANT que la ligne
      // suivante ne s'exécute : rien ne peut s'intercaler entre le test et la
      // pose du drapeau.
      const p = executerNomme(mode, job);
      enVol = p;
      return p.finally(() => {
        if (enVol === p) enVol = undefined;
      });
    },
  };
}
