import { useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "../i18n/fr";
import { Icone } from "../design/icones";
import type { Collection } from "../../shared/types";

// Un parent et ses enfants dans la sidebar. DESIGN.md §9 « révélé, pas
// posé » : l'arbre s'explore au pointeur — survoler un parent le déplie,
// le quitter le replie. Le repli est DIFFÉRÉ : sans délai, traverser la
// sidebar pour atteindre le bas ferait clignoter chaque groupe au passage.
const REPLI_MS = 250;

/** Ce que la ligne du parent expose : les flèches horizontales (→ déplie,
 *  ← replie) et le clic, qui ÉPINGLE. */
export interface PliageClavier {
  deplie: boolean;
  pliable: boolean;
  /** Pose un état explicite — les flèches du clavier. */
  basculer(ouvrir: boolean): void;
  /**
   * Le geste du clic : **épingle** le groupe ouvert, et le referme au clic
   * suivant. Il ne part PAS de l'état affiché : survolé, un groupe est déjà
   * ouvert, et basculer depuis cet état ferait refermer au premier clic
   * alors qu'on vient de demander à le garder ouvert.
   */
  basculerEpingle(): void;
}
// Pendant un déplacement, le dépliage attend : on traverse des parents pour
// atteindre sa cible, on ne veut pas les ouvrir tous en chemin.
const DEPLI_DRAG_MS = 500;

export function GroupeCollection({
  parent, enfants, contientLaVue, enDeplacement, children,
}: {
  parent: Collection;
  enfants: Collection[];
  /** La vue courante est ce parent ou l'un de ses enfants. */
  contientLaVue: boolean;
  enDeplacement: boolean;
  /** Rendu des lignes : le parent, puis chaque enfant. */
  children(deplie: boolean, chevron: ReactNode, pliage: PliageClavier): ReactNode;
}) {
  // Deux sources, et l'une prime : le survol ouvre, le chevron TRANCHE.
  // Sans cette priorité, replier au chevron rouvrirait aussitôt — le
  // pointeur est encore sur le groupe qu'on vient de fermer.
  const [ouvert, setOuvert] = useState(false);
  const [force, setForce] = useState<boolean | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const annuler = () => {
    if (minuteur.current !== null) clearTimeout(minuteur.current);
    minuteur.current = null;
  };
  useEffect(() => annuler, []);

  // Un parent sans enfant n'a rien à déplier : ni chevron, ni survol actif
  // (§9, « masqué si nul »).
  const pliable = enfants.length > 0;
  // La vue courante garde son groupe ouvert : sans cela, cliquer un enfant
  // replierait le groupe d'où l'on vient et ferait perdre le contexte. Un
  // repli explicite (force === false) l'emporte quand même : l'utilisateur
  // a le dernier mot sur ce qu'il veut voir.
  const deplie = pliable && (force ?? (ouvert || contientLaVue));

  const entrer = () => {
    if (!pliable) return;
    annuler();
    if (enDeplacement) minuteur.current = setTimeout(() => setOuvert(true), DEPLI_DRAG_MS);
    else setOuvert(true);
  };
  const sortir = () => {
    if (!pliable) return;
    annuler();
    minuteur.current = setTimeout(() => {
      setOuvert(false);
      // Quitter le groupe rend la main au survol : un repli forcé ne vaut
      // que tant qu'on est dessus, un dépliage épinglé survit à la sortie.
      //
      // Sauf pour le groupe qui PORTE la vue : là, `contientLaVue` le
      // rouvrirait aussitôt, et la fermeture qu'on vient de demander serait
      // défaite en quittant la ligne. Son repli tient donc jusqu'au clic
      // suivant.
      setForce((f) => (f === false && !contientLaVue ? null : f));
    }, REPLI_MS);
  };

  const chevron = pliable ? (
    // Le survol n'existe pas au clavier : ce bouton est le SEUL accès au
    // pliage pour qui n'a pas de souris — l'équivalent accessible du survol,
    // pas son doublon. Révélé au survol du groupe, ou posé s'il est déplié.
    <button
      type="button"
      // Hors du parcours de tabulation : →/← plient depuis la ligne du
      // parent, et quinze chevrons invisibles feraient quinze arrêts de
      // plus avant d'atteindre la liste. Il reste cliquable, et son
      // `aria-expanded` continue d'annoncer l'état du groupe.
      tabIndex={-1}
      aria-expanded={deplie}
      aria-label={t(deplie ? "nav.collapse" : "nav.expand", { title: parent.title })}
      className={
        "shrink-0 rounded p-0.5 text-app-muted hover:bg-app-hover " +
        (deplie ? "" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")
      }
      onClick={(e) => {
        e.stopPropagation(); // plier n'est pas naviguer
        // Même règle que le clic sur la collection : on épingle, puis on
        // referme. Partir de `deplie` refermerait un groupe que le survol
        // vient d'ouvrir, au clic même qui demandait de le retenir.
        setForce(force !== true);
      }}
    >
      <Icone nom={deplie ? "chevronBas" : "chevronDroit"} />
    </button>
  ) : null;

  return (
    <div className="group" onPointerEnter={entrer} onPointerLeave={sortir}>
      {children(deplie, chevron, {
        deplie,
        pliable,
        basculer: (ouvrir) => setForce(ouvrir),
        basculerEpingle: () => setForce(force !== true),
      })}
    </div>
  );
}
