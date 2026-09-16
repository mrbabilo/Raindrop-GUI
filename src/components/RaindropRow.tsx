import { t } from "../i18n/fr";
import type { RaindropItem } from "../../shared/types";

const dateFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

export function RaindropRow(props: {
  r: RaindropItem; selected: boolean; isDetail: boolean;
  onOpen(): void; onToggle(): void; onTag(name: string): void;
}) {
  const { r } = props;
  return (
    <div data-testid={`row-${r.id}`} className={"flex cursor-pointer items-start gap-2 border-b border-app-border px-3 py-2 " + (props.isDetail ? "bg-app-panel" : "")} onClick={props.onOpen}>
      {/* stopPropagation : cocher ne doit pas ouvrir le détail. */}
      <input type="checkbox" aria-label={t("list.select", { title: r.title })} checked={props.selected} onClick={(e) => e.stopPropagation()} onChange={props.onToggle} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-medium">{r.title}</span>
          {/* Domaine et date dans leurs propres nœuds texte : les requêtes
              RTL ne lisent que les nœuds texte directs (cf. Sidebar). */}
          <span className="shrink-0 text-xs text-app-muted">
            <span>{r.domain}</span> · <span>{dateFr(r.created)}</span>
          </span>
          {r.important && <span aria-label={t("detail.favorite")}>★</span>}
        </div>
        {r.excerpt && <p className="truncate text-sm text-app-muted">{r.excerpt}</p>}
        {/* Pas de text-app-accent (jeton inexistant — DESIGN.md §6 : pas
            d'accent de marque) : la surface du jeton suffit. */}
        <div className="flex gap-1">
          {r.tags.map((tag) => (
            <button key={tag} type="button" className="rounded bg-app-panel px-1 text-xs" onClick={(e) => { e.stopPropagation(); props.onTag(tag); }}>#{tag}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
