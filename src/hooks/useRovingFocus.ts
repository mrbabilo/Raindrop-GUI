import { useCallback, useEffect, type RefObject } from "react";

// Roving tabindex : une ZONE ne prend qu'un seul arrêt de tabulation, et les
// flèches y circulent. Sans cela, la barre latérale en compte plus de deux
// cent cinquante — une par étiquette — et atteindre la liste au clavier
// demande de les traverser toutes.
//
// Les éléments navigables se déclarent par `data-nav` plutôt que par une
// liste passée en props : la barre latérale déplie et replie ses groupes,
// et la liste des éléments change à chaque rendu.
const SELECTEUR = "[data-nav]";

export interface RovingOptions {
  /** Flèches horizontales : déplier/replier un arbre, par exemple. */
  surHorizontale?(element: HTMLElement, direction: "droite" | "gauche"): void;
  /** Échap : remonter d'un niveau et rendre le focus à l'écran. */
  surEchap?(): void;
  /**
   * Zone en GRILLE (la mosaïque) : ↑↓ sautent d'une rangée entière et ←→
   * d'une case. Sur une grille, descendre d'un élément mènerait à la case
   * d'à côté, pas à celle du dessous.
   *
   * Compté à la demande et non passé en nombre : la mosaïque se remplit en
   * `auto-fill`, ses colonnes changent avec la largeur de la fenêtre.
   */
  colonnes?(): number;
}

export function useRovingFocus(
  zone: RefObject<HTMLElement | null>,
  options: RovingOptions = {},
) {
  const elements = useCallback(
    (): HTMLElement[] => [...(zone.current?.querySelectorAll<HTMLElement>(SELECTEUR) ?? [])],
    [zone],
  );

  // Un seul arrêt de tabulation à la fois. Recalculé à chaque rendu : un
  // groupe qui se déplie ajoute des éléments, et ils naîtraient tous
  // tabulables sans cette remise à plat.
  useEffect(() => {
    const els = elements();
    if (els.length === 0) return;
    const dejaActif = els.find((el) => el.tabIndex === 0);
    const actif = dejaActif ?? els[0]!;
    for (const el of els) el.tabIndex = el === actif ? 0 : -1;
  });

  const deplacer = (vers: HTMLElement | undefined) => {
    if (vers === undefined) return;
    for (const el of elements()) el.tabIndex = el === vers ? 0 : -1;
    vers.focus();
  };

  const surTouche = (e: React.KeyboardEvent) => {
    const els = elements();
    const courant = document.activeElement as HTMLElement | null;
    const i = courant === null ? -1 : els.indexOf(courant);
    if (i === -1) return; // le focus est ailleurs : ce n'est pas notre affaire

    // Sur une grille, un cran vertical vaut une rangée entière.
    const pas = options.colonnes === undefined ? 1 : Math.max(1, options.colonnes());
    if (e.key === "ArrowDown") { e.preventDefault(); deplacer(els[Math.min(i + pas, els.length - 1)]); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); deplacer(els[Math.max(i - pas, 0)]); return; }
    if (e.key === "Home") { e.preventDefault(); deplacer(els[0]); return; }
    if (e.key === "End") { e.preventDefault(); deplacer(els[els.length - 1]); return; }
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      // En grille, elles déplacent d'une case.
      if (options.colonnes !== undefined) {
        e.preventDefault();
        deplacer(els[e.key === "ArrowRight" ? i + 1 : i - 1]);
        return;
      }
      // Sinon, consommées seulement si la zone en fait quelque chose : sur
      // une liste plate, les flèches horizontales appartiennent au texte.
      if (options.surHorizontale === undefined) return;
      e.preventDefault();
      options.surHorizontale(els[i]!, e.key === "ArrowRight" ? "droite" : "gauche");
      return;
    }
    if (e.key === "Escape" && options.surEchap !== undefined) {
      e.preventDefault();
      options.surEchap();
    }
  };

  return { surTouche, deplacer, elements };
}
