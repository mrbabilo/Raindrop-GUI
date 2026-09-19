import { t } from "../i18n/fr";

/**
 * L'estimation du temps restant, à partir du DÉBIT OBSERVÉ.
 *
 * Aucun chiffre en dur (CLAUDE.md) : la durée ne se déduit pas d'une mesure
 * faite un jour sur une bibliothèque, mais de la vitesse à laquelle CE job
 * avance, maintenant. Un balayage sur un réseau lent, une file ralentie par
 * une reprise après 429, une bibliothèque deux fois plus grande — le débit
 * l'absorbe, une constante mentirait.
 */
export interface Echantillon {
  /** Horodatage en millisecondes (`Date.now()`). */
  t: number;
  done: number;
}

/** Fenêtre d'observation : au-delà, l'échantillon est trop vieux pour dire le
 *  débit COURANT. Un job qui accélère ou ralentit doit se voir. */
export const FENETRE_MS = 30_000;
/** En deçà, le débit est du bruit : deux événements à 200 ms d'intervalle
 *  donneraient une estimation qui saute de plusieurs minutes à chaque rendu. */
const MINIMUM_MS = 1_500;

/**
 * Rend les secondes restantes, ou `null` quand on ne sait pas encore.
 *
 * `null` est une réponse, pas un échec : afficher « ≈ 0 min » ou un temps
 * calculé sur deux points collés serait pire que ne rien dire. L'estimation
 * apparaît quand elle vaut quelque chose, et pas avant.
 */
export function estimerSecondes(echantillons: readonly Echantillon[], total: number): number | null {
  if (echantillons.length < 2 || total <= 0) return null;
  const premier = echantillons[0]!;
  const dernier = echantillons[echantillons.length - 1]!;
  const dt = dernier.t - premier.t;
  const dd = dernier.done - premier.done;
  if (dt < MINIMUM_MS || dd <= 0) return null;
  const reste = total - dernier.done;
  if (reste <= 0) return null; // rien à attendre : le segment est fini
  return (reste / (dd / dt)) / 1000;
}

/**
 * Met la durée en mots, avec la PRÉCISION QU'ELLE MÉRITE.
 *
 * Un « ≈ 7 min 23 s » afficherait une exactitude que l'estimation n'a pas :
 * elle repose sur un débit qui varie. Les paliers disent l'ordre de grandeur,
 * qui est la seule chose vraie — et cessent de sautiller à chaque rendu.
 */
export function formaterDuree(secondes: number): string {
  if (secondes < 45) return t("eta.moinsDUneMinute");
  const minutes = Math.round(secondes / 60);
  if (minutes < 60) return t("eta.minutes", { n: minutes });
  const heures = Math.floor(minutes / 60);
  return t("eta.heures", { n: heures, minutes: String(minutes % 60).padStart(2, "0") });
}
