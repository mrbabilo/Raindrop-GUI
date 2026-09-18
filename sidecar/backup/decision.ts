//! Quand sauvegarder, et en quel mode.
//!
//! Isolé de l'orchestration : ces deux questions se répondent sur le seul
//! manifeste, sans disque ni réseau, et c'est ce qui les rend vérifiables.

import { dernierValide, type Manifeste } from "./manifeste.js";

/** Sept jours — §5.3 : « un balayage complet est exécuté au moins une fois par
 *  semaine, que les compteurs aient bougé ou non ». La comparaison de
 *  compteurs est un déclencheur bon marché, pas une garantie : une suppression
 *  ET un ajout entre deux passages laissent le compte inchangé, et l'élément
 *  supprimé survivrait indéfiniment comme s'il existait encore. */
export const JOURS_BALAYAGE_COMPLET = 7;

/** §4.4 : au démarrage de l'app si la dernière sauvegarde date de plus de
 *  24 h — plutôt qu'à heure fixe, qui tomberait forcément au mauvais moment et
 *  ne servirait à rien si l'app est fermée. */
export const HEURES_DEMARRAGE = 24;

/** `2026-09-17T10-00-00` → Date. */
export function dateDe(horodatage: string): Date {
  return new Date(`${horodatage.slice(0, 10)}T${horodatage.slice(11).replace(/-/g, ":")}Z`);
}

const depuis = (horodatage: string, ref: Date): number => ref.getTime() - dateDe(horodatage).getTime();

/**
 * Un balayage complet s'impose si aucun instantané VALIDE n'existe, ou si le
 * dernier remonte à plus de `JOURS_BALAYAGE_COMPLET`. `dernierValide` ignore
 * les instantanés incomplets : un balayage interrompu ne repousse pas
 * l'échéance du suivant.
 */
export function doitBalayerComplet(m: Manifeste, maintenant: Date): boolean {
  const d = dernierValide(m);
  return d === undefined || depuis(d.horodatage, maintenant) > JOURS_BALAYAGE_COMPLET * 864e5;
}

/**
 * Au démarrage (§4.4) : plus de 24 h depuis la dernière TENTATIVE, valide ou
 * non. Se fonder sur `dernierValide` ici relancerait une sauvegarde à chaque
 * lancement tant qu'une seule échouerait — jusqu'à marteler l'API.
 */
export function doitSauvegarderAuDemarrage(m: Manifeste, maintenant: Date): boolean {
  const dernier = [...m.instantanes].sort((a, b) => a.horodatage.localeCompare(b.horodatage)).at(-1);
  return dernier === undefined || depuis(dernier.horodatage, maintenant) > HEURES_DEMARRAGE * 36e5;
}
