//! Le balayage complet de la bibliothèque, et sa réconciliation par identifiants.
//!
//! TRI : `created` ASCENDANT, jamais `-created` (§4.2). En descendant, un
//! signet créé pendant les 2 min 20 apparaît en page 0 et décale tout ce qui
//! suit. En ascendant, les nouveaux s'ajoutent APRÈS le point de lecture.
//!
//! MAIS l'ascendant ne protège pas des SUPPRESSIONS (correction §1bis n°1) :
//! une suppression en amont décale la suite vers l'arrière et fait sauter un
//! élément — que l'incrémental par `-lastUpdate` ne rattrapera jamais, un
//! élément sauté n'ayant aucune date nouvelle. D'où la réconciliation par
//! IDENTIFIANTS (pas par cardinalité) : `ids.size === countFinal` seul est
//! aveugle à une suppression compensée par un décalage de lecture — voir
//! `passer()` pour la démonstration arithmétique. TROIS signaux, déjà en
//! main, à coût nul — mais deux qui portent et un qui veille :
//!   1. La DÉCROISSANCE du `count` au fil des pages : le seul des trois qui
//!      capte une suppression en amont, cas où `ids.size` et `countFinal`
//!      restent ÉGAUX alors qu'un élément a été sauté (démonstration
//!      arithmétique ci-dessous, dans `passer()`).
//!   2. `ids.size === countFinal` : le contrôle général — il capte le
//!      décalage AVANT (restauration depuis la corbeille, voir plus bas) et
//!      toute mutation tardive.
//!   3. `lignes === ids.size` : SUBSUMÉ par le 2 sous pagination par offset
//!      (mesuré, pas supposé — `lignes` suit toujours la taille de la
//!      collection au moment de la page finale, donc `lignes ≈ countFinal`
//!      et un doublon qui fait chuter `ids.size` sous `lignes` le fait
//!      chuter tout autant sous `countFinal` : le 3 ne se déclenche jamais
//!      seul). Conservé comme fil-piège : le jour où la pagination passerait
//!      d'un offset à un curseur, `lignes` cesserait de suivre `countFinal`
//!      et cette clause redeviendrait discriminante — si elle se déclenche
//!      seule, c'est que le modèle de pagination a changé sous nos pieds.
//!
//! Le décalage AVANT existe aussi, par une voie différente : une restauration
//! depuis la corbeille réinsère un signet avec son `created` D'ORIGINE (pas
//! « maintenant »), qui peut le ranger avant le curseur de lecture — le
//! curseur (par offset, monotone) ne repasse jamais dessus, il reste
//! définitivement lu, et un élément déjà vu est relu au passage suivant
//! (`lignes > ids.size`). Le `count`, lui, ne fait QUE croître dans ce cas
//! (une insertion), la décroissance reste donc silencieuse — c'est la
//! réconciliation par identifiants/cardinalité qui capte le coup, pas elle.
//!
//! LIMITE ADMISE : une suppression ET une création dans le même intervalle
//! inter-page laissent le count inchangé et `ids.size` inchangé — le saut
//! reste invisible. Le refermer exigerait de comparer les ensembles
//! d'identifiants, soit un second balayage complet (2 min 20). Cette limite
//! est assumée et documentée : le péché que §1bis corrige est de
//! surpromettre la fidélité, pas de garantir l'impossible. Une limite
//! énoncée est conforme ; une limite tue ne l'est pas.

import { ouvrirJsonl } from "./instantane.js";
import type { Lecture } from "./lecture.js";

const PAR_PAGE = 50;

export interface ResultatBalayage {
  ids: Set<number>;
  lignes: number;
  sha256: string;
  /** Faux = la réconciliation a échoué après rejeu, ou le balayage a été annulé. */
  complet: boolean;
  raison?: string;
  countFinal: number;
}

interface Deps {
  lecture: Lecture;
  chemin: string;
  collectionId: number;
  onProgress?(faits: number, total: number): void;
  annule?(): boolean;
}

interface Passage extends Omit<ResultatBalayage, "complet" | "raison"> {
  /** Le count a DÉCRU pendant le passage : décalage arrière, saut possible. */
  decroissance: boolean;
  annule: boolean;
}

/**
 * Un passage : écrit le JSONL, collecte les identifiants, et détecte une
 * décroissance du `count`.
 *
 * Pourquoi la décroissance et pas seulement `ids.size === countFinal` : sur
 * 120 items, `perpage` 50, tri ascendant, une suppression de l'index 0 juste
 * après la page 0 —
 *
 *   page 0  → anciens 0..49      (50 identifiants)
 *   suppression → 119 items, tout recule d'un cran
 *   page 1 (offset 50)  → anciens 51..100   ← L'ANCIEN 50 N'EST JAMAIS LU
 *   page 2 (offset 100) → anciens 101..119  (19 items, < 50 → arrêt)
 *
 *   ids.size = 50 + 50 + 19 = 119     countFinal = 119     → ÉGAUX
 *
 * Un élément a disparu de l'instantané sans un mot, et les deux nombres
 * restent égaux. Le `count`, lui, a bel et bien décru entre la page 0 (120)
 * et la page 1 (119) : c'est ce signal qui trahit le décalage, pas l'écart
 * final.
 */
async function passer(deps: Deps): Promise<Passage> {
  const ecrivain = await ouvrirJsonl(deps.chemin);
  const ids = new Set<number>();
  let page = 0;
  let total = 0;
  // Le plus grand count vu : c'est la DÉCROISSANCE qui trahit le décalage
  // arrière, pas l'écart final. Le count arrive dans chaque réponse de page,
  // ce contrôle ne coûte donc aucune requête.
  let countMax = 0;
  let decroissance = false;
  let annule = false;
  for (;;) {
    if (deps.annule?.()) {
      annule = true;
      break;
    }
    const p = await deps.lecture.page(deps.collectionId, {
      sort: "created",
      page,
      perpage: PAR_PAGE,
    });
    total = p.count;
    if (p.count < countMax) decroissance = true;
    if (p.count > countMax) countMax = p.count;
    for (const item of p.items) {
      await ecrivain.ligne(item);
      const id = (item as { _id?: number })._id;
      if (typeof id === "number") ids.add(id);
    }
    deps.onProgress?.(ids.size, total);
    if (p.items.length < PAR_PAGE) break;
    page++;
  }
  const { lignes, sha256 } = await ecrivain.fermer();
  // Le compte est relu À LA FIN : il ferme la fenêtre restée ouverte après la
  // dernière page.
  const countFinal = await deps.lecture.compteur(deps.collectionId);
  if (countFinal < countMax) decroissance = true;
  return { ids, lignes, sha256, countFinal, decroissance, annule };
}

/**
 * Balaye, réconcilie, et rejoue UNE fois si le passage n'est pas cohérent.
 *
 * Cohérent = les trois clauses ci-dessous, mais seules DEUX portent
 * effectivement (voir l'en-tête du module pour le détail et sa mesure) :
 *   - `!decroissance` — capte la suppression en amont, le cas que la
 *     cardinalité seule ne voit pas (`ids.size` et `countFinal` restent
 *     ÉGAUX alors qu'un élément a été sauté) ;
 *   - `ids.size === countFinal` — capte le reste (décalage avant, mutation
 *     tardive) ;
 *   - `lignes === ids.size` — n'ajoute rien sous pagination par offset
 *     (subsumé par la clause précédente, mesuré) ; gardé en fil-piège pour
 *     un changement de modèle de pagination, pas comme troisième signal
 *     indépendant.
 *
 * Incohérent : quelque chose a bougé pendant la course. Un rejeu suffit dans
 * la quasi-totalité des cas — c'est le comportement que §1bis n°1 décrit,
 * « rejeu unique, puis incomplet SI L'ÉCART PERSISTE ». S'il persiste,
 * l'instantané est marqué INCOMPLET et `dernierValide()` (Task 6) ne le
 * comptera jamais comme la dernière sauvegarde valide (§6).
 */
export async function balayerComplet(deps: Deps): Promise<ResultatBalayage> {
  let dernier: Passage | undefined;
  for (const essai of [1, 2]) {
    const r = await passer(deps);
    dernier = r;
    // L'annulation est lue sur le passage, pas en rappelant `deps.annule()` :
    // le rappel appartient à l'appelant et peut compter ses invocations.
    if (r.annule) {
      return depouiller(r, false, "balayage annulé");
    }
    if (!r.decroissance && r.ids.size === r.countFinal && r.lignes === r.ids.size) {
      return depouiller(r, true);
    }
    if (essai === 2) break;
  }
  const r = dernier!;
  return depouiller(
    r,
    false,
    `réconciliation impossible : ${r.ids.size} identifiants collectés, ` +
      `${r.lignes} lignes écrites, ${r.countFinal} annoncés` +
      (r.decroissance ? ", et le compte a décru pendant le passage" : "") +
      " — la bibliothèque a changé pendant les deux passages",
  );
}

/** Le passage interne dépouillé de ses drapeaux, en résultat public. */
function depouiller(p: Passage, complet: boolean, raison?: string): ResultatBalayage {
  const { decroissance: _d, annule: _a, ...reste } = p;
  return raison === undefined ? { ...reste, complet } : { ...reste, complet, raison };
}
