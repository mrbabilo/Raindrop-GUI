//! Le rafraîchissement incrémental : `-lastUpdate` jusqu'au watermark.
//!
//! C'est ce qui rend la sauvegarde quotidienne quasi gratuite (§5.2) — quelques
//! éléments modifiés coûtent une requête, là où un balayage complet en coûte
//! 245.
//!
//! ÉGALITÉ DE DATES (correction §1bis n°4) : plusieurs éléments peuvent
//! partager la même seconde de `lastUpdate`. Un `>` strict en sauterait, un
//! `>=` seul bouclerait. La règle : `>=`, UNE page de recouvrement au-delà du
//! croisement, et dédoublonnage par `_id`. Réappliquer un élément déjà à jour
//! est sans effet — l'opération est idempotente.
//!
//! ⚠️ LA PAGE DE RECOUVREMENT N'EST COUVERTE PAR AUCUN TEST, et ce n'est pas
//! un oubli qu'on corrige d'une assertion. Elle est MANDATÉE par la spec
//! (§1bis n°4, contraignant) mais analytiquement REDONDANTE avec la règle
//! `>=` : tout élément qui partage la seconde du watermark satisfait déjà
//! `date >= watermark` et entre dans `parId`, sur sa page comme sur la
//! suivante. Vérifié par exécution : les quatre scénarios du test donnent des
//! résultats identiques avec et sans le bloc de recouvrement. Elle reste ici
//! parce qu'une correction contraignante ne se retire pas sur un raisonnement,
//! et parce qu'un modèle de pagination différent (curseur plutôt qu'offset)
//! pourrait la rendre nécessaire. Quiconque la trouverait « morte » et
//! voudrait la supprimer : il n'y a PAS de test derrière, la relire ici
//! d'abord.

import type { Lecture } from "./lecture.js";

const PAR_PAGE = 50;
/** Garde-fou : un watermark absent ou aberrant ne doit pas rapatrier 245 pages. */
const MAX_PAGES_DEFAUT = 20;

export interface ResultatIncremental {
  modifies: unknown[];
  nouveauWatermark: string;
  pages: number;
}

export async function lireModifies(deps: {
  lecture: Lecture;
  collectionId: number;
  watermark: string;
  maxPages?: number;
}): Promise<ResultatIncremental> {
  const max = deps.maxPages ?? MAX_PAGES_DEFAUT;
  const parId = new Map<number, unknown>();
  let nouveauWatermark = deps.watermark;
  let pages = 0;
  let recouvrementRestant = -1; // -1 = pas encore croisé

  for (let page = 0; page < max; page++) {
    const p = await deps.lecture.page(deps.collectionId, {
      sort: "-lastUpdate",
      page,
      perpage: PAR_PAGE,
    });
    pages++;
    let croiseSurCettePage = false;
    for (const item of p.items) {
      const o = item as { _id?: number; lastUpdate?: string };
      const date = o.lastUpdate ?? "";
      if (date > nouveauWatermark) nouveauWatermark = date;
      // Dates comparées lexicographiquement (pas parseInt). Cela ne vaut qu'à
      // une condition, nécessaire ET suffisante : que le format reste
      // ISO-8601 UTC constant. Toute déviation silencieuse (offset autre que
      // Z, précision différente) casserait la comparaison sans lever d'erreur.
      // Raindrop rend toujours le format fixe — mais c'est une hypothèse.
      // `>=` et non `>` : l'élément PILE au watermark est réappliqué. Le
      // réécrire est sans effet ; le sauter perdrait ses voisins de même
      // seconde.
      if (deps.watermark === "" || date >= deps.watermark) {
        if (typeof o._id === "number") parId.set(o._id, item);
      } else {
        croiseSurCettePage = true;
      }
    }
    if (p.items.length < PAR_PAGE) break;
    if (croiseSurCettePage && recouvrementRestant === -1) {
      // Une page de recouvrement : les éléments de même seconde peuvent
      // chevaucher la frontière de page.
      recouvrementRestant = 1;
      continue;
    }
    if (recouvrementRestant > 0) {
      recouvrementRestant--;
      if (recouvrementRestant === 0) break;
    }
  }
  return { modifies: [...parId.values()], nouveauWatermark, pages };
}
