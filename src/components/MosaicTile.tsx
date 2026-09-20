import type { RaindropItem } from "../../shared/types";
import { Glyphe } from "../design/glyphes";
import { filetEtat, variablesTeinte, type EtatLien } from "../design/Signaux";

// DESIGN.md §8 : tuile de 221 px MINIMUM, vignette au ratio 221:118 (elle
// grandit avec la tuile — la grille étire les colonnes pour remplir le
// panneau), titre sur deux lignes. §9 : rayon 9–11 px pour une tuile, et pas
// d'ombre — la hiérarchie vient de la surface. §4 : la vignette reprend la
// teinte de la collection. §5 : en mosaïque, la marque d'état COIFFE la
// vignette (elle ne la borde pas).
export function MosaicTile({
  r,
  onOpen,
  collectionRacine,
  etat,
  isDetail,
}: {
  r: RaindropItem;
  onOpen(): void;
  collectionRacine?: string;
  etat?: EtatLien | null;
  /** La fiche de CE signet est ouverte : surface `sel` (§6), comme la ligne
   *  de liste — sinon la vignette cliquée ne se distingue pas des autres. */
  isDetail?: boolean;
}) {
  const marque = filetEtat(etat);
  return (
    <button
      type="button"
      data-nav
      data-testid={`tile-${r.id}`}
      className={"flex w-full flex-col overflow-hidden rounded-[9px] border border-app-border text-left" + (isDetail ? " bg-app-sel" : "")}
      onClick={onOpen}
    >
      {marque && <div className={"coiffe " + marque} data-testid={`coiffe-${r.id}`} />}
      {/* Le lavis thématique est sous la vignette : il tient lieu d'image
          quand `cover` est absent, « jamais une case vide » (§4). */}
      {/* Pas de centrage sur la vignette elle-même : un `place-items-center`
          dimensionnerait l'image sur son intrinsèque au lieu des 118 px.
          C'est l'initiale de repli qui se centre, dans son propre bloc. */}
      <div className="wash aspect-[221/118] w-full overflow-hidden" style={variablesTeinte(collectionRacine)}>
        {/* alt="" : le titre est juste en dessous, l'image est décorative. */}
        {r.cover
          ? <img src={r.cover} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          : <span className="grid h-full w-full place-items-center text-2xl">{r.title[0] ?? "?"}</span>}
      </div>
      <span className="line-clamp-2 px-2 pt-1 text-[13px] leading-tight">{r.title}</span>
      <span className="flex items-center gap-1 px-2 pb-1 pt-0.5 text-app-muted">
        <Glyphe type={r.type} />
        <span className="url truncate text-[11px]">{r.domain}</span>
      </span>
    </button>
  );
}
