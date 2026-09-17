import { useCallback, useState } from "react";
import { t } from "../i18n/fr";
import type { RaindropItem } from "../../shared/types";
import { useAppState } from "../state/appState";
import { useCollections } from "../hooks/useStaticData";
import { useDragBookmark } from "../hooks/useDragBookmark";
import { useRaindrops } from "../hooks/useRaindrops";
import { CarreCollection } from "../design/Signaux";
import { RaindropRow } from "./RaindropRow";
import { SectionCollection } from "./SectionCollection";
import { BulkBar } from "./BulkBar";

// Vue d'une collection PARENTE (DESIGN.md, design validé 2026-09-17) : ses
// signets directs, puis une section par sous-collection. Les contrôles sont
// en tête et UNIQUES — rien n'est dupliqué par section, contrairement à
// Raindrop.
//
// Écart assumé au design, arbitré avec l'utilisateur : chaque section ne
// charge que sa PREMIÈRE page et propose « Voir les N ». « Tout déplié » au
// sens plein demanderait onze requêtes espacées de 550 ms sur une collection
// à dix enfants, et garderait des milliers de lignes hors virtualiseur.
export function CollectionView() {
  const { view, go, selectedIds, toggleSelect, selectRaindrop, patchList } = useAppState();
  const arbre = useCollections().data ?? [];
  const drag = useDragBookmark();
  // Les items de chaque section, pour la barre d'actions en masse : sans
  // eux, cocher une ligne d'une section n'aurait aucun effet.
  const [parSection, setParSection] = useState<Record<number, RaindropItem[]>>({});

  const collectionId = view.kind === "collection" ? view.collectionId : 0;
  const parent = arbre.find((c) => c.id === collectionId);
  const enfants = arbre.filter((c) => c.parentId === collectionId);

  const directs = useRaindrops({ collectionId });
  const itemsDirects = directs.data?.pages[0]?.items ?? [];
  const totalDirects = directs.data?.pages[0]?.count ?? 0;

  // UNE fonction pour toutes les sections, stable d'un rendu à l'autre :
  // une closure par section serait recréée à chaque passe et relancerait
  // l'effet qui la consomme, en boucle.
  const recevoir = useCallback(
    (id: number, items: RaindropItem[]) => setParSection((m) => ({ ...m, [id]: items })),
    [],
  );
  const ouvrirListe = (id: number, label: string) => go({ kind: "list", collectionId: id, label });
  const filtrerTag = (name: string) => go({ kind: "list", collectionId: 0, label: `#${name}`, search: `#${name}` });
  const poignee = (r: RaindropItem) => drag.poignee(r.id, () => selectRaindrop(r.id), r.title);
  const tous = [...itemsDirects, ...Object.values(parSection).flat()];

  if (parent === undefined)
    return <main className="grid h-full place-items-center text-app-muted">{t("state.loading")}</main>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Contrôles globaux en tête, uniques : le titre de la collection, sa
          teinte et son compte total. §9 « masqué si nul » pour le compte. */}
      <header className="flex items-center gap-2 border-b border-app-border px-3 py-2">
        <CarreCollection collectionId={parent.id} titre={parent.title} />
        <h1 className="font-medium">{parent.title}</h1>
        {totalDirects > 0 && <span className="text-xs text-app-muted">{totalDirects}</span>}
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        {itemsDirects.map((r) => (
          <RaindropRow
            key={r.id}
            r={r}
            selected={selectedIds.has(r.id)}
            isDetail={false}
            collectionRacine={parent.title}
            poignee={poignee(r)}
            onToggle={() => toggleSelect(r.id)}
            onTag={filtrerTag}
          />
        ))}
        {totalDirects > itemsDirects.length && (
          <button type="button" className="w-full px-3 py-1 text-left text-xs text-app-muted hover:bg-app-hover" onClick={() => ouvrirListe(parent.id, parent.title)}>
            {t("collection.seeAll", { n: totalDirects })}
          </button>
        )}
        {enfants.map((ch) => (
          <SectionCollection
            key={ch.id}
            collection={ch}
            poignee={poignee}
            selection={selectedIds}
            detailId={null}
            onToggle={toggleSelect}
            onTag={filtrerTag}
            onVoirTout={() => ouvrirListe(ch.id, ch.title)}
            onCharges={recevoir}
          />
        ))}
        {directs.isError && (
          <p role="alert" className="px-3 py-2 text-xs text-app-broken">
            {t("state.error", { message: directs.error.message })}
          </p>
        )}
      </main>
      {drag.erreur !== null && (
        <p role="alert" className="border-t border-app-border px-3 py-2 text-xs text-app-broken">
          {t("state.error", { message: drag.erreur })}
        </p>
      )}
      <BulkBar items={tous} />
    </div>
  );
}
