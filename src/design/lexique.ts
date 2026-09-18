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
  "éducation",
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
  // Neuvième thématique, ajoutée sur mesure : une bibliothèque d'enseignant
  // range des dizaines d'étiquettes (école, collège, exercices, annales, svt,
  // maths…) qu'aucune des huit autres ne décrit sans la trahir — et la règle
  // du §3 est que la teinte vient de ce qu'un mot SIGNIFIE.
  // 90 tombe entre `maison` (62) et `méthode` (120) : 28° de part et d'autre,
  // contre 37 pour l'écart le plus serré jusqu'ici. C'est le prix d'une
  // neuvième teinte sur un cercle déjà occupé, et il est dit plutôt que tu.
  éducation: 90,
};

// Mots-clés du tableau §3, à l'identique. Le nom de la thématique est ajouté
// à sa propre liste au moment de l'indexation (« création » désigne la
// thématique création).
const MOTS: Record<Thematique, readonly string[]> = {
  technique: [
    "code", "dev", "informatique", "python", "rust", "linux", "mac", "api", "serveur", "git", "test",
    "wordpress", "css", "html", "javascript", "php", "plugin", "seo", "open source", "windows", "android",
    "réseau", "nas", "freebox", "hébergeur", "auto hébergement", "émulateur", "os", "mobile", "smartphone",
    "cloud", "backup", "base de données", "arduino", "scratch", "micro:bit", "robotique", "homebrew", "kodi",
    "divi", "markdown", "accessibilité", "numérique", "automatisation", "opendata", "géolocalisation",
    "confidentialité", "rgpd", "ia", "prompt", "midjourney", "éditeur", "site", "wiki", "visio", "mod",
    "internet", "techno", "google", "excel", "calibre", "itunes",
    "mail", "youtube", "pinterest", "cryptographie", "traducteur", "décodage", "cookie", "scraper",
  ],
  création: [
    "design", "webdesign", "typographie", "graphisme", "couleur", "art", "photo", "ui", "ux",
    "image", "illustration", "animation", "3d", "fonte", "thème", "inspiration", "artiste", "papertoy",
    "générateur", "générateur images", "sprite", "dessin", "photoshop",
  ],
  argent: [
    "achat", "finance", "banque", "budget", "prix", "vente", "boutique", "comparer",
    "wishlist", "occasion", "bon plan", "gratuit", "e commerce", "auto entrepreneur", "facturation",
    "entreprise", "emploi", "stage", "prêt", "location", "retraite", "comparateur",
    "assurance", "programme fidélité",
  ],
  maison: [
    "maison", "cuisine", "recette", "bricolage", "jardin", "déco", "matériel",
    "électroménager", "copropriété", "logement", "alimentation", "famille", "ressourcerie",
  ],
  santé: [
    "santé", "médecine", "sport", "urgent", "important", "sécurité",
    "psychologie", "psychiatrie", "bipolarité", "handicap", "dys", "hpi", "environnement",
  ],
  lieux: [
    "voyage", "carte", "ville", "pays", "transport", "hôtel", "restaurant",
    "pyrénées", "béarn", "occitanie", "france", "sortie", "voiture",
  ],
  culture: [
    "lecture", "livre", "article", "veille", "musique", "film", "podcast", "presse",
    "vidéo", "cinéma", "série", "manga", "anime", "bd", "théâtre", "conteur", "conte", "mythe",
    "imaginaire", "science fiction", "pop culture", "musique trad", "guitare", "piano", "partition",
    "parole", "mao", "audio", "radio", "tv", "magazine", "média", "blog", "humour", "histoire",
    "écriture", "dictionnaire", "occitan", "basque", "clown", "scénario", "streaming", "information",
    "jeu", "jeu vidéo", "jeu de rôle", "jeu de société", "rimworld", "walkthrough", "astronomie",
    "association", "politique", "droit législation", "réseau social", "creative commons", "ours",
    "chanson", "playlist", "exposition", "histoire des arts",
  ],
  méthode: [
    "outil", "service", "application", "productivité", "référence", "guide", "archive",
    "outil en ligne", "ressource", "appli", "annuaire", "recherche", "mindmapping", "notion",
    "bureautique", "calculatrice", "astuce", "dépannage", "maintenance", "optimisation",
    "collaboratif", "interactif", "idée", "bookmarking", "tuto", "administration", "rendez vous",
    "agenda", "simulateur",
  ],
  éducation: [
    "école", "école primaire", "collège", "lycée", "cours", "formation", "exercice", "math",
    "svt", "physique chimie", "histoire géographie", "français", "anglais", "géométrie", "annale",
    "brevet", "serious game", "générateur exercices", "gestion classe", "manuel", "jeune",
    "dactylographie", "chronologie", "vocabulaire", "science", "physique", "chimie", "quiz",
    "espagnol", "concours", "grammaire", "conjugaison", "synonyme", "correcteur", "orthographe",
  ],
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

/**
 * Le pluriel français, retiré du DERNIER mot : « livres » → « livre »,
 * « jeux de rôle » → « jeu de rôle »… et « jeux » → « jeu ».
 *
 * Ce n'est PAS une entorse au §3 (« la teinte vient de ce qu'un mot
 * signifie ») : un pluriel signifie exactement ce que signifie son singulier.
 * C'est de l'orthographe, comme les accents que `normalise` retire déjà.
 *
 * Borné à trois lettres pour ne pas amputer un mot court dont le `s` ou le
 * `x` appartient au radical.
 */
function singulier(n: string): string {
  // CHAQUE mot, pas un seul : le français accorde tout le groupe — « jeux
  // vidéos » et « bons plans » portent la marque deux fois, et n'en retirer
  // qu'une ne retrouve ni « jeu vidéo » ni « bon plan ».
  const dé = (m: string) => (m.length > 3 && /[sx]$/.test(m) ? m.slice(0, -1) : m);
  return n.split(" ").map(dé).join(" ");
}

// `null` hors lexique — un résultat attendu, pas un défaut (§3).
export function thematique(mot: string | null | undefined): Thematique | null {
  if (!mot) return null;
  const n = normalise(mot);
  if (!n) return null;
  const s = singulier(n);
  return (
    INDEX.get(n) ??
    INDEX.get(colle(n)) ??
    INDEX.get(s) ??
    INDEX.get(colle(s)) ??
    null
  );
}

// La teinte oklch H, et rien d'autre.
export function teinte(t: Thematique | null): number | null {
  return t === null ? null : TEINTES[t];
}
