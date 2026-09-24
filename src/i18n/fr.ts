// Le dictionnaire : UN seul, fusionné depuis des fichiers de DOMAINE
// (`textes/`) — le fichier unique dépassait le plafond de 400 lignes
// (audit UX du 2026-09-23). Une clé ne vit que dans un domaine : fr.test.ts
// le vérifie, un `...spread` écrasant en silence.
import { compte } from "./textes/compte";
import { interfaceTextes } from "./textes/interface";
import { nettoyage } from "./textes/nettoyage";

export const fr = { ...interfaceTextes, ...nettoyage, ...compte } as const;

export type FrKey = keyof typeof fr;

/** Une clé du dictionnaire, rien d'autre : le repli « rend la clé » masquait
 *  les fautes (une chaîne absente s'affichait brute). Les usages DYNAMIQUES
 *  construisent leur objet de clés en `as const` (voir NatureChips).
 *
 *  Une valeur peut porter DEUX formes séparées par `|` — singulier puis
 *  pluriel — choisies sur `n` (« {n} instantané conservé|{n} instantanés
 *  conservés »). Règle FRANÇAISE : le singulier vaut pour 0 comme pour 1, le
 *  pluriel à partir de 2. Une chaîne à DEUX comptes passe `n` pour celui qui
 *  porte l'accord et garde la forme `(s)` pour l'autre. */
export function t(key: FrKey, vars?: Record<string, string | number>): string {
  const brut: string = fr[key];
  const formes = brut.split("|");
  // `n` absent sur une clé à deux formes : le singulier, qui est le repli le
  // moins faux — jamais un « {n} » laissé à l'écran.
  const nombre = typeof vars?.n === "number" ? vars.n : Number(vars?.n ?? 1);
  let s = formes.length === 2 ? (Math.abs(nombre) >= 2 ? formes[1]! : formes[0]!) : brut;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
