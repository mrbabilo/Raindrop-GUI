import { useEffect, useRef } from "react";
import { t } from "../i18n/fr";
import { FICHE } from "../lib/panneaux";

/** Un pas de clavier : assez pour voir bouger, assez fin pour viser. */
const PAS = 16;

/**
 * Le bord gauche de la fiche, qu'on tire pour la redimensionner — audit
 * d'ergonomie du 2026-09-24 (320 px fixes). Un séparateur ARIA : les
 * flèches le déplacent aussi, le double-clic rend la largeur d'origine.
 * Posé en absolu sur le bord de la colonne, hors du flux de la grille.
 */
export function PoigneeFiche({ largeur, regler }: { largeur: number; regler: (px: number) => void }) {
  // Le geste vit hors du rendu, comme le glisser-déposer : un rendu par
  // pixel ne doit pas le recréer.
  const geste = useRef<{ x: number; depart: number } | null>(null);
  const reglerRef = useRef(regler);
  reglerRef.current = regler;
  useEffect(() => {
    // Le bord part à GAUCHE quand la fiche s'élargit : la largeur croît
    // quand le pointeur recule.
    const bouge = (e: MouseEvent) => {
      const g = geste.current;
      if (g !== null) reglerRef.current(g.depart + (g.x - e.clientX));
    };
    const fin = () => { geste.current = null; };
    window.addEventListener("pointermove", bouge);
    window.addEventListener("pointerup", fin);
    window.addEventListener("pointercancel", fin);
    return () => {
      window.removeEventListener("pointermove", bouge);
      window.removeEventListener("pointerup", fin);
      window.removeEventListener("pointercancel", fin);
    };
  }, []);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t("detail.largeur")}
      aria-valuenow={largeur}
      aria-valuemin={FICHE.min}
      aria-valuemax={FICHE.max}
      tabIndex={0}
      className="absolute inset-y-0 left-0 z-10 w-1.5 -translate-x-1/2 cursor-col-resize select-none hover:bg-app-border"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault(); // pas de sélection de texte au passage
        geste.current = { x: e.clientX, depart: largeur };
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") { e.preventDefault(); regler(largeur + PAS); }
        if (e.key === "ArrowRight") { e.preventDefault(); regler(largeur - PAS); }
      }}
      onDoubleClick={() => regler(FICHE.defaut)}
    />
  );
}
