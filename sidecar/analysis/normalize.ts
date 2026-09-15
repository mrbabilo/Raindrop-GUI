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
