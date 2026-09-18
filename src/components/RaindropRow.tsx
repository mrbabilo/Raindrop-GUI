import { t } from "../i18n/fr";
import type { RaindropItem } from "../../shared/types";
import { Glyphe } from "../design/glyphes";
import { Etoile } from "../design/Etoile";
import { CarreCollection, PiluleEtiquette, filetEtat, type EtatLien } from "../design/Signaux";

const dateFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

// DESIGN.md §8 : la ligne de liste fait 36 px — « titre + étiquettes +
// domaine », ~22 visibles. Tout tient donc sur UNE ligne : deux lignes de
// texte ne respecteraient pas l'interligne 1,5 de §7 dans 36 px. L'extrait
// n'est pas de la liste (il n'est pas dans l'énumération de §8) : il vit dans
// la fiche, où l'interface a le droit de respirer (§1).
//
// `min-h-9` et non une hauteur fixe : la hauteur reste MESURÉE par le
// virtualiseur (measureElement, R7P), pas décrétée — quand la Task 13 ajoutera
// l'URL finale d'une redirection sous le domaine, la mécanique suit déjà.
//
// Quatre signaux au plus (§2) : carré de collection, pilules d'étiquettes,
// glyphe de nature, et — seulement en cas de problème — le filet d'état.
export function RaindropRow(props: {
  r: RaindropItem;
  selected: boolean;
  isDetail: boolean;
  // Titre de la collection RACINE (§4 : la couleur appartient à la racine,
  // les descendantes en héritent). Résolu par ListPane, qui a l'arbre.
  collectionRacine?: string;
  // Diagnostic de l'analyse locale (§5.1). Aucune donnée d'analyse n'atteint
  // encore le front : absent = sain = aucun filet, jusqu'aux Tasks 12-13.
  etat?: EtatLien | null;
  // Handlers du geste de déplacement (useDragBookmark) : ils portent AUSSI
  // le clic d'ouverture, qui ne se joue que si le geste est resté un clic.
  poignee: {
    onPointerDown(e: { clientX: number; clientY: number; button?: number }): void;
    onClick(): void;
  };
  onToggle(): void;
  onTag(name: string): void;
  /** Déclare la ligne comme arrêt de navigation de sa zone (useRovingFocus).
   *  La liste principale ne s'en sert pas : son enveloppe virtualisée porte
   *  déjà le focus, et son index doit survivre au démontage de la ligne. */
  navigable?: boolean;
  /** Une archive LOCALE existe pour ce signet (spec sélection §4.1). À ne pas
   *  confondre avec `r.cache` : celle-là vit sur les serveurs de Raindrop et
   *  peut disparaître avec le compte — c'est justement ce dont l'archive
   *  locale protège. */
  archive?: boolean;
}) {
  const { r } = props;
  const etat = filetEtat(props.etat);
  return (
    <div
      data-testid={`row-${r.id}`}
      {...(props.navigable === true ? { "data-nav": true, tabIndex: -1 } : {})}
      className={
        "flex min-h-9 cursor-pointer items-center gap-2 overflow-hidden border-b border-app-border px-3 " +
        (props.isDetail ? "bg-app-panel " : "") +
        (etat ? "filet " + etat : "")
      }
      {...props.poignee}
    >
      {/* stopPropagation : cocher ne doit pas ouvrir le détail.
          `tabIndex={-1}` : c'est la LIGNE qui est l'arrêt de tabulation, pas
          ses contrôles — mesuré au navigateur, vingt-neuf lignes montées
          faisaient cent vingt-six arrêts à elles seules. La case reste
          cliquable, et la barre d'espace la coche depuis la ligne active. */}
      <input type="checkbox" tabIndex={-1} aria-label={t("list.select", { title: r.title })} checked={props.selected} onClick={(e) => e.stopPropagation()} onChange={props.onToggle} />
      <CarreCollection collectionId={r.collectionId} titre={props.collectionRacine} />
      <span className="min-w-[8rem] flex-1 truncate font-medium">{r.title}</span>
      {r.important && <span role="img" className="shrink-0 text-app-muted" aria-label={t("detail.favorite")}><Etoile /></span>}
      {props.archive === true && (
        <span className="shrink-0 rounded border border-app-border px-1 text-[10px] uppercase tracking-wide text-app-muted">
          {t("marque.archive")}
        </span>
      )}
      {/* Les étiquettes ne prennent jamais plus du tiers de la ligne : dans un
          outil de diagnostic on identifie un lien par son titre, et une
          poignée d'étiquettes ne doit pas le réduire à sa largeur minimale.
          Au-delà, elles sont rognées — la ligne ne grandit pas. */}
      <div className="flex min-w-0 max-w-[33%] shrink items-center gap-1 overflow-hidden">
        {r.tags.map((tag) => (
          <PiluleEtiquette key={tag} nom={tag} onClick={() => props.onTag(tag)} />
        ))}
      </div>
      {/* §2.1 : le glyphe se place AVANT le domaine, dans le même filet de
          texte secondaire, et partage sa couleur — pas un badge, une lettre
          de plus. §7 : le domaine en chasse fixe (.url), et rien d'autre. */}
      <span className="flex shrink-0 items-center gap-1 text-app-muted">
        <Glyphe type={r.type} />
        <span className="url text-[11px]">{r.domain}</span>
      </span>
      <span className="shrink-0 text-xs text-app-muted">{dateFr(r.created)}</span>
    </div>
  );
}
