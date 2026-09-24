import type { View } from "../state/appState";

// La dernière vue de BIBLIOTHÈQUE (liste ou collection) ouverte, rouverte au
// lancement — audit d'ergonomie du 2026-09-24 : chaque lancement repartait
// de « Tous ». Une Revue ou une lecture ne se rouvre jamais (une action en
// suspens, un contenu à retélécharger) : seul un LIEU se retient. Lecture
// défensive champ par champ — une valeur altérée retombe sur « Tous » plutôt
// que d'ouvrir une vue que le reste de l'app ne sait pas lire.
const CLE = "raindrop-gui-derniere-vue";

type Lieu = Extract<View, { kind: "list" | "collection" }>;

const texte = (v: unknown): v is string => typeof v === "string";

export function lireDerniereVue(): Lieu | null {
  try {
    const b = JSON.parse(localStorage.getItem(CLE) ?? "null") as Record<string, unknown> | null;
    if (b === null || typeof b !== "object" || typeof b.collectionId !== "number" || !texte(b.label)) return null;
    if (b.kind === "collection") return { kind: "collection", collectionId: b.collectionId, label: b.label };
    if (b.kind !== "list") return null;
    const lieu: Lieu = { kind: "list", collectionId: b.collectionId, label: b.label };
    if (b.notag === true) lieu.notag = true;
    if (Array.isArray(b.tags) && b.tags.every(texte)) lieu.tags = b.tags;
    if (b.viewMode === "list" || b.viewMode === "mosaic") lieu.viewMode = b.viewMode;
    for (const k of ["search", "sort", "domain", "media", "createdStart", "createdEnd", "smartlistId"] as const) {
      if (texte(b[k])) lieu[k] = b[k];
    }
    return lieu;
  } catch {
    return null;
  }
}

export function ecrireDerniereVue(v: View): void {
  if (v.kind !== "list" && v.kind !== "collection") return;
  try {
    localStorage.setItem(CLE, JSON.stringify(v));
  } catch {
    /* stockage indisponible : on repartira de « Tous » */
  }
}
