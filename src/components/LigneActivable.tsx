import {
  createContext,
  useContext,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ElementType,
  type ReactNode,
} from "react";
import { t } from "../i18n/fr";
import { filetEtat, type EtatLien } from "../design/Signaux";

//! La LIGNE ACTIVABLE : une ligne qui est l'unique arrêt de tabulation de sa
//! zone, et dont les contrôles ne s'ouvrent au clavier qu'une fois qu'on y
//! est entré.
//!
//! Extraite de `CleanupRows` le 2026-09-19, quand la vue Tags en a eu besoin à
//! son tour : une responsabilité par fichier, et le patron cesse d'appartenir
//! à une famille de vues qui n'en est plus la seule cliente.
//!
//! Le problème qu'elle résout, chiffré : la vue Tags porte 317 étiquettes
//! réelles, à quatre contrôles chacune — soit **plus de mille deux cents
//! arrêts de tabulation** pour traverser l'écran. Avec le patron, il y en a
//! UN, et les flèches circulent.

// Clavier (lot a11y) : la LIGNE est l'arrêt de tabulation de la vue
// (useRovingFocus de CleanupView), jamais ses contrôles. Enter ou F2
// « entre » dans la ligne — les contrôles deviennent tabulables et le
// premier reçoit le focus ; quitter la ligne (Échap, clic ailleurs,
// flèches) les referme. Le maillage ARIA grid est réduit volontairement à
// row : le contrat visé est le comportement clavier, pas une grille
// complète.
const ContexteLigne = createContext(false);

export function Ligne({ etat, children, balise = "div", role = "row", className = "" }: {
  etat: EtatLien | null;
  children: ReactNode;
  /** `li` pour une liste, `div` pour une grille de vues. Une `<ul>` qui
   *  porterait des `role="row"` mentirait sur sa structure. */
  balise?: "div" | "li";
  role?: string;
  /** Remplace la géométrie par défaut quand la zone a la sienne (la vue Tags
   *  suit la densité « entrée de navigation », 28 px — DESIGN.md §8). */
  className?: string;
}) {
  const [active, setActive] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const filet = filetEtat(etat);
  const Balise = balise as "div";
  return (
    <Balise
      ref={ref}
      role={role}
      data-nav
      tabIndex={-1} // le roving de la vue décide (0 pour la première, -1 pour les autres)
      onBlur={(e) => {
        // Le focus quitte la ligne → désarmer. Le passage ligne → contrôle
        // interne est un focus DANS la ligne : rien ne bouge.
        if (!ref.current?.contains(e.relatedTarget as Node | null)) setActive(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "F2") {
          e.preventDefault();
          setActive(true);
          // Le focus programmatique ignore le tabIndex=-1 momentané : React
          // propage l'état après coup, et le contrôle reste focusé.
          ref.current?.querySelector<HTMLElement>("button, a, select, input")?.focus();
          return;
        }
        // Échap quand la ligne est activée : la REFERMER et rendre le focus
        // À LA LIGNE. Sans ce stop, le roving de la vue blurrait vers body —
        // le focus se perdait au lieu de remonter d'un niveau.
        if (e.key === "Escape" && active) {
          e.preventDefault();
          e.stopPropagation();
          setActive(false);
          ref.current?.focus();
        }
      }}
      className={
        (className || "flex min-h-9 items-center gap-2 overflow-hidden border-b border-app-border px-3 ") +
        (filet ? "filet " + filet : "")
      }
    >
      <ContexteLigne.Provider value={active}>{children}</ContexteLigne.Provider>
    </Balise>
  );
}

/**
 * Un contrôle interne d'une ligne : hors de Tab tant que la ligne n'est pas
 * activée (Enter/F2), tabulable ensuite. Le clic reste toujours possible.
 *
 * Typé sur la balise plutôt que sur `Record<string, unknown>` : ce dernier
 * rendait `any` chaque paramètre de gestionnaire — un `onChange(e)` sans type,
 * donc sans garde-fou, dans un fichier que le typecheck couvre pourtant.
 */
type BaliseAction = "button" | "a" | "select" | "input";

export function ActionLigne<T extends BaliseAction = "button">(
  { el, ...props }: { el?: T } & ComponentPropsWithoutRef<T>,
) {
  const active = useContext(ContexteLigne);
  const Tag = (el ?? "button") as ElementType;
  return <Tag tabIndex={active ? 0 : -1} {...props} />;
}

// Erreur d'action inline (pattern T8/R12P-1) : ce qui s'est passé, jamais
// silencieux — brouillon et ligne restent en place.
export function ErreurLigne({ message }: { message: string }) {
  return (
    <p role="alert" className="text-xs text-app-broken">
      {t("state.error", { message })}
    </p>
  );
}

