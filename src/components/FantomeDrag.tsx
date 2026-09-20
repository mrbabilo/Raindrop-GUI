import { useEffect, useRef } from "react";
import { useDrag } from "../state/drag";

// Ce qui suit le curseur pendant un déplacement. Sans lui, tirer un signet
// ne se voit pas : la sidebar s'allume sous le pointeur mais rien ne dit ce
// qu'on transporte.
//
// La position ne passe PAS par l'état React : elle change à chaque pixel, et
// un rendu par pixel ferait ramer une liste de 12 000 lignes. Le fantôme
// s'abonne lui-même aux mouvements et se déplace par `transform`, que le
// navigateur compose sans recalculer la mise en page.
//
// DESIGN.md §6 : surface `work`, pas de teinte — ce n'est pas un état, c'est
// un objet en transit. §9 : le mouvement répond à une action, celle-ci.
export function FantomeDrag() {
  const { ids, libelle } = useDrag();
  const ref = useRef<HTMLDivElement>(null);
  const actif = ids !== null;

  // NB : la garde `user-select: none` vit DANS le geste (useDragBookmark,
  // au pointerdown) — posée ici, au rendu du fantôme, elle arrivait quelques
  // frames trop tard et laissait les zones traversées s'amorcer.

  useEffect(() => {
    if (!actif) return;
    const suivre = (e: MouseEvent) => {
      const el = ref.current;
      if (el === null) return;
      // Décalé sous-droite du curseur : posé dessus, il masquerait la cible
      // que l'on vise.
      el.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 10}px)`;
    };
    window.addEventListener("pointermove", suivre);
    return () => window.removeEventListener("pointermove", suivre);
  }, [actif]);

  if (!actif) return null;

  return (
    <div
      ref={ref}
      data-testid="fantome-drag"
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-50 max-w-[16rem] truncate rounded-[7px] bg-app-panel px-2 py-1 text-xs text-app-muted"
    >
      {libelle}
    </div>
  );
}
