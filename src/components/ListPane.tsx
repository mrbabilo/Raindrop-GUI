import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { t } from "../i18n/fr";
import type { View } from "../state/appState";
import { useRaindrops } from "../hooks/useRaindrops";
import { useAppState } from "../state/appState";
import { RaindropRow } from "./RaindropRow";
import { MosaicTile } from "./MosaicTile";

type ListView = Extract<View, { kind: "list" }>;

export function ListPane() {
  const { view, patchList, selectedIds, toggleSelect, selectedRaindropId, selectRaindrop } = useAppState();
  // Hors vue list (Nettoyage, Tags…), la zone centrale retombe sur « Tous ».
  const q: ListView = view.kind === "list" ? view : { kind: "list", collectionId: 0, label: "" };
  const query = useRaindrops({ collectionId: q.collectionId, search: q.search, sort: q.sort, notag: q.notag });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const parentRef = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({ count: items.length, getScrollElement: () => parentRef.current, estimateSize: () => 76, overscan: 10 });
  const ioRef = useRef<IntersectionObserver | null>(null);

  if (items.length === 0 && !query.isFetching) return <main className="grid place-items-center p-4 text-app-muted">{t("state.empty")}</main>;

  return (
    <main ref={parentRef} className="overflow-y-auto">
      {q.viewMode === "mosaic" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2 p-2">
          {items.map((r) => <MosaicTile key={r.id} r={r} onOpen={() => selectRaindrop(r.id)} />)}
        </div>
      ) : (
        <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
          {virtual.getVirtualItems().map((v) => {
            const r = items[v.index]!;
            return (
              <div key={r.id} style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${v.start}px)` }}>
                <RaindropRow r={r} selected={selectedIds.has(r.id)} isDetail={selectedRaindropId === r.id}
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
  );
}
