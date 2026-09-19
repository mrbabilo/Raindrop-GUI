// Normalisation d'URL et clé fuzzy — logique pure (spec §5.1, analyse locale).
// Consommé par duplicates.ts puis le scanner (Task 14).

const TRACKING_PREFIX = /^utm_/i;
const TRACKING_EXACT = new Set(["fbclid", "gclid", "msclkid", "ref", "ref_src"]);

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return trimmed; // imparsable : on rend l'entrée tronquée telle quelle
  }
  u.hash = "";
  const isLocal = u.hostname === "localhost" || /^127\./.test(u.hostname);
  if (u.protocol === "http:" && !isLocal) u.protocol = "https:";
  // Slash final retiré même sur la racine : l'assemblage part de `path`,
  // car u.pathname = "" est réinitialisé à "/" par WHATWG URL.
  let path = u.pathname;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (path === "/") path = "";
  const kept = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING_PREFIX.test(k) && !TRACKING_EXACT.has(k.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b));
  const search = new URLSearchParams(kept).toString();
  const out = `${u.origin}${path}${search ? `?${search}` : ""}`;
  return out;
}

/**
 * Les titres d'INTERSTITIEL — ce qu'un navigateur ou un anti-bot met comme
 * titre de page lors d'une redirection forcée. MESURÉ le 2026-09-19 sur la
 * bibliothèque réelle : 163 des 551 signets flous (16 groupes) portaient
 * « Weiterleitungshinweis » — l'avis de redirection de Google, enregistré
 * comme titre par korben.info et jeuxvideo.com. Même domaine + même titre
 * générique groupait ainsi des pages qui N'ONT RIEN en commun : un tiers du
 * flou était du bruit. Les slugs sont comparés en forme normalisée (même
 * traitement que `fuzzyKey`), en égalité ou en préfixe (les titres
 * Cloudflare se suivent d'un suffixe variable).
 */
const SLUGS_GENERIQUES = [
  "weiterleitungshinweis",
  "redirect notice",
  "redirecting",
  "just a moment",
  "attention required",
  "access denied",
  "page not found",
  "untitled",
  "loading",
];

/** Le titre ne dit RIEN de la page (interstitiel, erreur, défaut) : il ne
 *  doit jamais servir de clé de regroupement flou. */
export function estTitreGenerique(title: string): boolean {
  const slug = fuzzyKey("", title).split("|")[1] ?? "";
  if (slug === "") return true;
  return SLUGS_GENERIQUES.some((g) => slug === g || slug.startsWith(g + " "));
}

export function fuzzyKey(domain: string, title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // diacritiques combinants U+0300–U+036F
    .replace(/['’ʼ´`]/g, "") // apostrophes = contraction ("l'API" ≡ "lapi"), pas un séparateur
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return `${domain.toLowerCase()}|${slug}`;
}
