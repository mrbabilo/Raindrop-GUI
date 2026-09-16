import type { CSSProperties } from "react";
import { thematique, teinte } from "./lexique";
import type { Collection, LinkStatus } from "../../shared/types";

// DESIGN.md §2 — les signaux colorés, distingués par la FORME : carré arrondi
// pour un contenant, pilule pour une thématique, filet pour un diagnostic.
// La couleur ne fait jamais seule la différence.
//
// Les classes .coll-icon / .tag / .filet-* vivent dans styles.css ; ce module
// ne fait que leur poser les deux variables qu'elles attendent.

// --h : teinte oklch de la thématique. --sat : 0 hors lexique (§3).
// Un mot hors lexique doit quand même recevoir un --h NUMÉRIQUE : sans
// valeur, `oklch(L C var(--h))` est invalide et le jeton perd tout son fond
// au lieu de virer au gris. Le chroma étant multiplié par --sat = 0, la
// teinte posée n'a aucun effet visible.
export function variablesTeinte(mot: string | null | undefined): CSSProperties {
  const h = teinte(thematique(mot));
  return { "--h": String(h ?? 0), "--sat": h === null ? "0" : "1" } as CSSProperties;
}

// §4 : « La collection racine porte la couleur de sa thématique ; ses
// descendantes en héritent. » Remonter parentId jusqu'à la racine — pur,
// donc testable sans React, et sans hook dans une ligne virtualisée.
// Une boucle de parents (donnée corrompue) est bornée par la longueur de la
// liste : on ne remonte jamais plus de `collections.length` fois.
export function racine(collections: Collection[], id: number): Collection | undefined {
  let courant = collections.find((c) => c.id === id);
  for (let i = 0; courant?.parentId != null && i < collections.length; i++) {
    const parent = collections.find((c) => c.id === courant!.parentId);
    if (!parent) break;
    courant = parent;
  }
  return courant;
}

// §4 : l'icône de Raindrop (`cover`) n'est pas encore exposée par le sidecar
// (voir l'avertissement de DESIGN.md §4) — d'ici là, un dossier teinté de la
// thématique, « jamais une case vide ».
function Dossier() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round">
      <path d="M2.4 5.1a1 1 0 0 1 1-1h2.7l1.5 1.7h5a1 1 0 0 1 1 1v5.1a1 1 0 0 1-1 1h-9.2a1 1 0 0 1-1-1z" />
    </svg>
  );
}

// `titre` est celui de la collection RACINE (§4) : l'appelant l'a résolu, la
// famille se lit sans avoir lu les titres. Absent (arbre pas encore chargé,
// collection inconnue) : gris, jamais un repli coloré.
export function CarreCollection({ collectionId, titre }: { collectionId: number; titre?: string }) {
  return (
    <span className="coll-icon" style={variablesTeinte(titre)} title={titre} data-testid={`coll-${collectionId}`}>
      <Dossier />
    </span>
  );
}

// §2 : pilule 18 px en liste, 21 px en détail (`.tag-detail` s'ajoute à
// `.tag`). `onClick` optionnel : cliquable dans la liste (pose le filtre),
// inerte dans la fiche — une étiquette de fiche n'est pas une commande.
export function PiluleEtiquette({
  nom,
  taille = "liste",
  onClick,
}: {
  nom: string;
  taille?: "liste" | "detail";
  onClick?: () => void;
}) {
  const className = "tag" + (taille === "detail" ? " tag-detail" : "");
  const style = variablesTeinte(nom);
  if (!onClick) return <span className={className} style={style}>{nom}</span>;
  return (
    <button
      type="button"
      className={className}
      style={style}
      // La pilule vit dans une ligne cliquable : filtrer sur une étiquette ne
      // doit pas ouvrir la fiche au passage.
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {nom}
    </button>
  );
}

// §5 — le diagnostic d'un lien. Le vocabulaire est celui de `LinkStatus`
// (shared/types.ts, analyse locale §5.1) augmenté du doublon, qui ne vient pas
// d'une vérification HTTP : les Tasks 12-13 pourront passer `result.status`
// tel quel, sans couche de traduction.
export type EtatLien = LinkStatus | "duplicate";

// Rend LE nom de classe d'état, à composer avec `filet` (liste) ou `coiffe`
// (mosaïque). Un lien sain ne porte aucune marque — c'est tout l'intérêt :
// le filet signale, il ne décore pas.
//
// Un item peut être à la fois mort et doublon : la ligne ne porte qu'un
// filet, l'appelant choisit donc quel diagnostic l'emporte.
export function filetEtat(etat: EtatLien | null | undefined): string {
  switch (etat) {
    case "dead":
      return "filet-broken";
    case "redirect":
      return "filet-moved";
    case "indeterminate":
      return "filet-unsure";
    case "duplicate":
      return "filet-duplicate";
    default:
      return "";
  }
}
