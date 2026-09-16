import type { RaindropItem } from "../../shared/types";

export function MosaicTile({ r, onOpen }: { r: RaindropItem; onOpen(): void }) {
  return (
    <button type="button" className="flex flex-col overflow-hidden rounded border border-app-border text-left" onClick={onOpen}>
      {/* alt="" : le titre est juste en dessous, l'image est décorative. */}
      {r.cover ? <img src={r.cover} alt="" className="h-28 w-full object-cover" /> : <div className="grid h-28 w-full place-items-center bg-app-panel text-2xl">{r.title[0] ?? "?"}</div>}
      <span className="truncate px-2 py-1 text-sm">{r.title}</span>
      <span className="truncate px-2 pb-1 text-xs text-app-muted">{r.domain}</span>
    </button>
  );
}
