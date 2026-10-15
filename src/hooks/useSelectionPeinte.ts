import { useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

type SessionPeinture = {
  cible: boolean;
  visitees: WeakSet<EventTarget>;
  effacerClics: Set<() => void>;
  appliquerDepart(): void;
  aPeint: boolean;
};

let session: SessionPeinture | null = null;

function terminer() {
  const finie = session;
  session = null;
  document.removeEventListener("pointerup", terminer);
  document.removeEventListener("pointercancel", terminer);
  // Le clic synthétique du navigateur suit pointerup dans la même tâche. Les
  // cases visitées l'ignorent jusque-là, puis retrouvent leur clic clavier et
  // leur clic ordinaire dès la tâche suivante.
  if (finie) setTimeout(() => finie.effacerClics.forEach((effacer) => effacer()), 0);
}

/**
 * Peint un même état sur les cases traversées bouton principal maintenu.
 * La cible vient de la première case : décochée → cocher, cochée → décocher.
 * Un simple survol ne fait rien et Maj-clic reste disponible pour les plages.
 */
export function useSelectionPeinte({ checked, disabled = false, onToggle }: {
  checked: boolean;
  disabled?: boolean;
  onToggle(plage?: boolean): void;
}) {
  const ignorerClic = useRef(false);
  const effacerClic = () => { ignorerClic.current = false; };
  const appliquer = (element: EventTarget, cible: boolean) => {
    if (disabled || checked === cible) return;
    ignorerClic.current = true;
    session?.effacerClics.add(effacerClic);
    session?.visitees.add(element);
    onToggle(false);
  };

  return {
    onPointerDown(e: ReactPointerEvent<HTMLInputElement>) {
      // La ligne porte aussi le glisser-déposer du signet : le geste de la
      // case lui appartient entièrement, même quand il devient une peinture.
      e.stopPropagation();
      if (disabled || (e.button ?? 0) !== 0 || (e.pointerType && e.pointerType !== "mouse") || e.shiftKey) return;
      terminer();
      const element = e.currentTarget;
      const cible = !checked;
      session = {
        cible,
        visitees: new WeakSet(),
        effacerClics: new Set(),
        appliquerDepart: () => appliquer(element, cible),
        aPeint: false,
      };
      document.addEventListener("pointerup", terminer);
      document.addEventListener("pointercancel", terminer);
    },
    onPointerEnter(e: ReactPointerEvent<HTMLInputElement>) {
      if (!session || disabled || ((e.buttons ?? 1) & 1) === 0 || session.visitees.has(e.currentTarget)) return;
      e.stopPropagation();
      if (!session.aPeint) {
        session.aPeint = true;
        session.appliquerDepart();
      }
      appliquer(e.currentTarget, session.cible);
    },
    onClick(e: ReactMouseEvent<HTMLInputElement>) {
      e.stopPropagation();
      if (ignorerClic.current) {
        e.preventDefault();
        ignorerClic.current = false;
        return;
      }
      onToggle(e.shiftKey);
    },
  };
}
