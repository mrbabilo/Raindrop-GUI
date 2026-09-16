// DESIGN.md §3 — la symbolique des couleurs.
//
// « La teinte vient de ce qu'un mot SIGNIFIE, jamais de son orthographe. »
// Un lexique range chaque étiquette et chaque collection dans une thématique ;
// un mot absent en sort GRIS, délibérément — le gris désigne une étiquette à
// classer et se corrige en étendant ce fichier. Aucune teinte de repli, jamais
// de couleur tirée au hasard : elle cacherait la lacune.
//
// Le lexique est en français, destiné à grandir, et vit dans un seul fichier
// sans aucune configuration utilisateur (§3).

// Les huit thématiques du tableau §3. La neuvième ligne du tableau (« hors
// lexique ») n'est pas une thématique : c'est `null`, rendu en chroma 0.
export const THEMATIQUES = [
  "technique",
  "création",
  "argent",
  "maison",
  "santé",
  "lieux",
  "culture",
  "méthode",
] as const;

export type Thematique = (typeof THEMATIQUES)[number];

// Seule la TEINTE varie d'une thématique à l'autre. Clarté et chroma sont
// posés une fois pour toutes dans styles.css (--app-tag-l/-c, --app-icon-l/-c)
// : aucune thématique ne crie plus fort qu'une autre (§3). Ce module n'expose
// donc ni L ni C — il n'y a rien à exposer.
const TEINTES: Record<Thematique, number> = {
  technique: 250,
  création: 300,
  argent: 150,
  maison: 62,
  santé: 25,
  lieux: 195,
  culture: 345,
  méthode: 120,
};

// Mots-clés du tableau §3, à l'identique. Le nom de la thématique est ajouté
// à sa propre liste au moment de l'indexation (« création » désigne la
// thématique création).
const MOTS: Record<Thematique, readonly string[]> = {
  technique: ["code", "dev", "informatique", "python", "rust", "linux", "mac", "api", "serveur", "git", "test"],
  création: ["design", "webdesign", "typographie", "graphisme", "couleur", "art", "photo", "ui", "ux"],
  argent: ["achat", "finance", "banque", "budget", "prix", "vente", "boutique", "comparer"],
  maison: ["maison", "cuisine", "recette", "bricolage", "jardin", "déco", "matériel"],
  santé: ["santé", "médecine", "sport", "urgent", "important", "sécurité"],
  lieux: ["voyage", "carte", "ville", "pays", "transport", "hôtel", "restaurant"],
  culture: ["lecture", "livre", "article", "veille", "musique", "film", "podcast", "presse"],
  méthode: ["outil", "service", "application", "productivité", "référence", "guide", "archive"],
};

// Minuscules, accents retirés, `-`/`_` → espace, espaces réduits.
// Les clés du lexique passent par la MÊME fonction : sans cela « hotel » ne
// retrouverait jamais le mot-clé « hôtel ».
function normalise(mot: string): string {
  return mot
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Forme recollée : « typo graphie » → « typographie », « web design » →
// « webdesign ». C'est le seul repli — pas de recherche mot à mot, qui
// classerait « test de restaurant » en technique sur son premier mot.
const colle = (n: string) => n.replaceAll(" ", "");

const INDEX = new Map<string, Thematique>();
for (const t of THEMATIQUES) {
  for (const mot of [t, ...MOTS[t]]) {
    const n = normalise(mot);
    if (!INDEX.has(n)) INDEX.set(n, t);
    if (!INDEX.has(colle(n))) INDEX.set(colle(n), t);
  }
}

// `null` hors lexique — un résultat attendu, pas un défaut (§3).
export function thematique(mot: string | null | undefined): Thematique | null {
  if (!mot) return null;
  const n = normalise(mot);
  if (!n) return null;
  return INDEX.get(n) ?? INDEX.get(colle(n)) ?? null;
}

// La teinte oklch H, et rien d'autre.
export function teinte(t: Thematique | null): number | null {
  return t === null ? null : TEINTES[t];
}
