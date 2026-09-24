import { useEffect, type RefObject } from "react";

const FOCALISABLES = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Un dialogue MODAL garde le focus et le rend (proposition 5 de l'audit UX).
 *
 * Tab boucle entre ses contrôles : sans cela il sortait vers l'application
 * masquée par l'overlay, des arrêts de tabulation qu'on ne voit pas. À la
 * fermeture (démontage), le focus revient à ce qui l'avait avant
 * l'ouverture — sinon il tombait sur `body`, et le clavier repartait du haut.
 */
export function useDialogue(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const origine = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const surTouche = (e: KeyboardEvent) => {
      const zone = ref.current;
      if (e.key !== "Tab" || zone === null) return;
      const liste = [...zone.querySelectorAll<HTMLElement>(FOCALISABLES)];
      if (liste.length === 0) return;
      const premier = liste[0]!;
      const dernier = liste[liste.length - 1]!;
      const actif = document.activeElement;
      if (e.shiftKey && (actif === premier || !zone.contains(actif))) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && (actif === dernier || !zone.contains(actif))) {
        e.preventDefault();
        premier.focus();
      }
    };
    document.addEventListener("keydown", surTouche);
    return () => {
      document.removeEventListener("keydown", surTouche);
      if (origine?.isConnected) origine.focus();
    };
  }, [ref]);
}
