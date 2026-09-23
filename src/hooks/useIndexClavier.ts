import { useEffect, useRef, useState, type RefObject } from "react";

// Navigation clavier d'une liste VIRTUALISÉE. Là où `useRovingFocus` suit
// l'ordre du DOM, celle-ci suit un INDEX : la ligne active est démontée dès
// qu'elle sort du champ, et un hook qui s'appuie sur la présence des
// éléments perdrait le focus au premier défilement.
//
// L'ordre compte : on déplace l'index, on demande le défilement, et on ne
// focalise qu'APRÈS — quand la ligne est remontée. Focaliser d'abord, c'est
// focaliser un élément qui n'existe pas encore.

export interface IndexClavierOptions {
  /** Nombre de lignes de la liste. */
  nombre: number;
  /** Zone défilante qui contient les lignes (`[data-index]`). */
  zone: RefObject<HTMLElement | null>;
  /** Amène la ligne dans le champ — `virtualizer.scrollToIndex`. */
  defilerVers(index: number): void;
  surEntree?(index: number): void;
  surEspace?(index: number): void;
}

export function useIndexClavier({
  nombre, zone, defilerVers, surEntree, surEspace,
}: IndexClavierOptions) {
  const [actif, setActif] = useState<number | null>(null);
  // Le survol de la souris déplace aussi la ligne active — « un seul état de
  // pointeur » — mais il ne doit PAS voler le focus ni faire défiler la
  // liste : passer la souris au-dessus est un geste sans intention.
  const clavier = useRef(false);
  // La liste peut rétrécir SOUS l'index (ListPane reste monté d'une
  // collection à l'autre ; la Revue filtre par recherche) : un index hors
  // liste ne désigne plus rien — sans cette borne, aucune ligne ne portait
  // l'arrêt de tabulation et la liste sortait du parcours clavier.
  const valide = actif !== null && actif < nombre ? actif : null;

  useEffect(() => {
    if (actif === null) return;
    if (!clavier.current) return;
    defilerVers(actif);
    // Une frame plus tard : le virtualiseur a monté la ligne d'ici là.
    const id = requestAnimationFrame(() => {
      zone.current?.querySelector<HTMLElement>(`[data-index="${actif}"]`)?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [actif]);

  const surTouche = (e: React.KeyboardEvent) => {
    if (nombre === 0) return;
    clavier.current = true;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActif((i) => Math.min((i ?? -1) + 1, nombre - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActif((i) => Math.max(Math.min(i ?? 1, nombre) - 1, 0));
      return;
    }
    if (e.key === "Home") { e.preventDefault(); setActif(0); return; }
    if (e.key === "End") { e.preventDefault(); setActif(nombre - 1); return; }
    if (e.key === " " && valide !== null && surEspace !== undefined) {
      e.preventDefault();
      surEspace(valide);
      return;
    }
    if (e.key === "Enter" && valide !== null && surEntree !== undefined) {
      e.preventDefault();
      surEntree(valide);
      return;
    }
    // « Échap remonte d'un niveau et rend le focus » : la liste rend la main
    // sans perdre où l'on en était.
    if (e.key === "Escape") {
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur();
    }
  };

  /** À étaler sur la ligne d'index `i` — un seul arrêt de tabulation. */
  const ligne = (i: number) => ({
    "data-index": i,
    tabIndex: (valide ?? 0) === i ? 0 : -1,
    // L'index suit le focus RÉEL : tabuler dans la liste, ou cliquer une
    // ligne, pose le point de départ des flèches. Sans cela, la première
    // flèche vers le bas rejoue l'entrée au lieu d'avancer.
    onFocus: () => { clavier.current = true; setActif(i); },
    // « La ligne active suit aussi le survol souris » : un seul état de
    // pointeur, pas une ligne survolée d'un côté et une ligne active de
    // l'autre. Le survol pose l'index sans prendre le focus.
    onMouseEnter: () => { clavier.current = false; setActif(i); },
  });

  /** Avance d'une ligne — « après une action, le focus passe à la suivante ». */
  const avancer = () => {
    clavier.current = true;
    setActif((i) => (i === null ? 0 : Math.min(i + 1, nombre - 1)));
  };

  return { actif, setActif, surTouche, ligne, avancer };
}
