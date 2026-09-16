import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { t } from "../i18n/fr";
import type { View } from "../state/appState";
import { useRaindrops } from "../hooks/useRaindrops";
import { useCollections } from "../hooks/useStaticData";
import { racine } from "../design/Signaux";
import { listQueryArgs } from "../hooks/listQuery";
import { useAppState } from "../state/appState";
import { RaindropRow } from "./RaindropRow";
import { MosaicTile } from "./MosaicTile";
import { BulkBar } from "./BulkBar";

type ListView = Extract<View, { kind: "list" }>;

export function ListPane() {
  const { view, patchList, selectedIds, toggleSelect, selectedRaindropId, selectRaindrop } = useAppState();
  // Hors vue list (Nettoyage, Tags…), la zone centrale retombe sur « Tous ».
  const q: ListView = view.kind === "list" ? view : { kind: "list", collectionId: 0, label: "" };
  // listQueryArgs (partagé avec NatureChips, R6bP-1) : la nature filtre
  // désormais réellement la liste, plus seulement l'état de la puce active.
  const query = useRaindrops(listQueryArgs(view));
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  // DESIGN.md §4 : la couleur appartient à la RACINE, les descendantes en
  // héritent. L'arbre n'est connu que d'ici — la ligne et la tuile reçoivent
  // le titre déjà résolu plutôt qu'un hook de plus dans chaque ligne
  // virtualisée. Arbre pas encore chargé : titre absent → carré gris.
  const arbre = useCollections().data ?? [];
  const titreRacine = (collectionId: number) => racine(arbre, collectionId)?.title;
  const parentRef = useRef<HTMLDivElement>(null);
  // estimateSize suit la densité §8 (36 px) : measureElement (R7P) corrige
  // ensuite chaque hauteur réelle, mais un estimate faux ferait sauter la
  // barre de défilement sur 12 000 lignes dès le premier scroll.
  const virtual = useVirtualizer({ count: items.length, getScrollElement: () => parentRef.current, estimateSize: () => 36, overscan: 10 });
  const ioRef = useRef<IntersectionObserver | null>(null);

  if (items.length === 0 && !query.isFetching) return <main className="grid place-items-center p-4 text-app-muted">{t("state.empty")}</main>;

  return (
    // Colonne : la liste défile, le pied (BulkBar, Task 9) reste posé sous
    // elle — hors du scroll, pour ne pas fausser la mesure du virtualizer.
    <div className="flex h-full min-h-0 flex-col">
      <main ref={parentRef} className="min-h-0 flex-1 overflow-y-auto">
        {q.viewMode === "mosaic" ? (
          // §8 : la tuile fait 221 px de large — une largeur exacte, pas un
          // minmax élastique qui la ferait varier d'un écran à l'autre.
          <div className="grid grid-cols-[repeat(auto-fill,221px)] gap-3 p-3">
            {items.map((r) => <MosaicTile key={r.id} r={r} collectionRacine={titreRacine(r.collectionId)} onOpen={() => selectRaindrop(r.id)} />)}
          </div>
        ) : (
          <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
            {virtual.getVirtualItems().map((v) => {
              const r = items[v.index]!;
              return (
                // measureElement (R7P) : la hauteur reste MESURÉE, pas
                // décrétée — la ligne vise 36 px (§8) sans hauteur fixe, et
                // ce qu'ajoutera l'analyse (Task 13) sera mesuré de même ;
                // data-index est requis par virtual-core pour rattacher la
                // mesure à l'index.
                <div key={r.id} data-index={v.index} ref={virtual.measureElement} style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${v.start}px)` }}>
                  <RaindropRow r={r} selected={selectedIds.has(r.id)} isDetail={selectedRaindropId === r.id}
                    collectionRacine={titreRacine(r.collectionId)}
                    onOpen={() => selectRaindrop(r.id)} onToggle={() => toggleSelect(r.id)} onTag={(name) => patchList({ search: `#${name}` })} />
                </div>
              );
            })}
          </div>
        )}
        {query.hasNextPage && (
          // Infinite scroll : le callback ref tourne à chaque rendu — on
          // débranche l'observeur précédent avant d'en créer un (sinon N
          // rendus = N observateurs = N× fetchNextPage au même event).
          <div ref={(el) => {
            ioRef.current?.disconnect();
            if (!el) return;
            const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && query.fetchNextPage()));
            io.observe(el);
            ioRef.current = io;
          }} className="p-4 text-center text-app-muted">{query.isFetchingNextPage ? t("list.loadingMore") : ""}</div>
        )}
      </main>
      {/* Invisible sans sélection (rend null) : aucune layout shift au repos. */}
      <BulkBar items={items} />
    </div>
  );
}
