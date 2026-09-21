// La chaîne de lecture côté front (spec lecture §3, amendée 2026-09-21) :
// le HTML archivé est servi par le sidecar, le CONTENU est extrait ICI —
// DOMParser natif du webview, zéro dépendance, et JAMAIS d'innerHTML : la
// whitelist ci-dessous est reconstruite en arbre par la vue (createElement).
import { getConnection } from "./connection";
import { ApiError } from "./api";
import type { ErrorCode } from "../../shared/errors";

export interface ContenuCharge {
  html: string;
  /** ISO du mtime du fichier d'archive (en-tête `X-Archive-Date`) — la
   *  fraîcheur de ce qu'on lit (spec lecture §3). NULL si l'en-tête manque :
   *  une absence ne devient jamais une date inventée. */
  dateArchive: string | null;
}

async function erreurDe(reponse: Response): Promise<ApiError> {
  let code: ErrorCode = "RAINDROP_API";
  let message = `http ${reponse.status}`;
  try {
    const j = (await reponse.json()) as { error?: { code?: ErrorCode; message?: string } };
    if (j.error?.code) code = j.error.code;
    if (j.error?.message) message = j.error.message;
  } catch { /* corps non JSON */ }
  return new ApiError(code, reponse.status, message);
}

/** Le HTML archivé, DÉCOMPRIMÉ par le sidecar en flux. `api.get` ne va pas :
 *  il parse du JSON et jette les en-têtes — ici le corps est du HTML et la
 *  date de l'archive vit dans `X-Archive-Date`. */
export async function chargerContenu(id: number): Promise<ContenuCharge> {
  const { baseUrl, token } = getConnection();
  const reponse = await fetch(`${baseUrl}/api/backup/archives/${id}/content`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(70_000),
  });
  if (!reponse.ok) throw await erreurDe(reponse);
  return { html: await reponse.text(), dateArchive: reponse.headers.get("X-Archive-Date") };
}

// ─── Extraction en blocs filtrés (whitelist, jamais d'innerHTML) ────────────

export type Segment = { texte: string; gras?: boolean; italique?: boolean; lien?: string };

export type Bloc =
  | { balise: "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "li" | "blockquote" | "pre"; segments: Segment[] }
  | { balise: "img"; src: string; alt: string };

const BLOCS_NIVEAU = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "pre"]);
const SRC_PERMIS = /^(https?:\/\/|data:image\/)/;

/** Les inlines whitelistés d'un bloc, dans l'ordre du document. Les espaces
 *  de source sont normalisés (hors `pre`, traité en texte brut avant). */
function segmentsDe(el: Element): Segment[] {
  const out: Segment[] = [];
  const pousser = (texte: string, base: Partial<Segment>) => {
    const net = texte.replace(/\s+/g, " ").trim();
    if (net) out.push({ texte: net, ...base });
  };
  const marche = (noeud: Node, base: Partial<Segment>) => {
    for (const enfant of noeud.childNodes) {
      if (enfant.nodeType === 3) pousser(enfant.textContent ?? "", base);
      else if (enfant.nodeType === 1) {
        const e = enfant as Element;
        const balise = e.tagName.toLowerCase();
        if (balise === "strong" || balise === "b") marche(e, { ...base, gras: true });
        else if (balise === "em" || balise === "i") marche(e, { ...base, italique: true });
        else if (balise === "a") {
          const href = e.getAttribute("href") ?? "";
          if (/^https?:\/\//.test(href)) marche(e, { ...base, lien: href });
          else marche(e, base);
        } else if (balise === "br") pousser(" ", base);
        else if (balise === "img") continue; // les images sortent en blocs propres, au niveau bloc
        else marche(e, base);
      }
    }
  };
  marche(el, {});
  return out;
}

function plusLargeConteneur(doc: Document): Element | null {
  let meilleur: Element | null = null;
  let longueur = 0;
  for (const c of doc.querySelectorAll("div, section")) {
    const l = c.textContent?.length ?? 0;
    if (l > longueur) {
      meilleur = c;
      longueur = l;
    }
  }
  return meilleur;
}

/**
 * L'extraction (spec lecture §3, amendée) : `<article>`, puis
 * `[role=main]`, puis `<main>`, puis le div/section au `textContent` le plus
 * long, puis le corps. Production : les blocs whitelistés dans l'ordre du
 * document, leurs inlines en segments typés, les images en blocs propres
 * (src `http(s)` ou `data:image` seulement). `pre` garde son texte BRUT.
 * Extraction vide → [] : l'état est NOMMÉ par la vue (spec §5).
 */
export function extraireBlocs(html: string): Bloc[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const racine =
    doc.querySelector("article") ??
    doc.querySelector('[role="main"]') ??
    doc.querySelector("main") ??
    plusLargeConteneur(doc) ??
    doc.body;
  if (!racine) return [];
  const out: Bloc[] = [];
  const marche = (parent: Element) => {
    for (const enfant of Array.from(parent.children)) {
      const balise = enfant.tagName.toLowerCase();
      if (balise === "img") {
        const src = enfant.getAttribute("src") ?? "";
        if (SRC_PERMIS.test(src)) {
          out.push({ balise: "img", src, alt: enfant.getAttribute("alt") ?? "" });
        }
        continue;
      }
      if (BLOCS_NIVEAU.has(balise)) {
        if (balise === "pre") {
          const texte = enfant.textContent ?? "";
          if (texte.trim()) out.push({ balise: "pre", segments: [{ texte }] });
          continue;
        }
        const segments = segmentsDe(enfant);
        if (segments.length > 0) {
          out.push({ balise: balise as "p", segments });
        }
        continue;
      }
      // Conteneur : les images internes sortent d'abord, puis on descend.
      for (const img of enfant.querySelectorAll("img")) {
        const src = img.getAttribute("src") ?? "";
        if (SRC_PERMIS.test(src)) {
          out.push({ balise: "img", src, alt: img.getAttribute("alt") ?? "" });
        }
      }
      marche(enfant);
    }
  };
  marche(racine);
  return out;
}
