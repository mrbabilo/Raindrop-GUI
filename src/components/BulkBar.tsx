import { useState } from "react";
import { t } from "../i18n/fr";
import { useAppState, type View } from "../state/appState";
import { useCollections } from "../hooks/useStaticData";
import type { RaindropItem } from "../../shared/types";

// L'action portée par la vue review — dérivée de View, jamais recopiée :
// la Task 13 l'étendra (empty-trash, delete-empty-collections) sans toucher ici.
type BulkAction = Extract<View, { kind: "review" }>["action"];

// Pied de liste (visible si selectedIds.size > 0) : compteur + 3 actions qui
// construisent la vue review — Corbeille direct, Déplacer (select dest),
// Tagger (tags à virgules). Rien n'exécute ici : la Revue (Task 15) propose,
// l'utilisateur dispose. Champs : classe .input, même convention que TopBar.
export function BulkBar({ items }: { items: RaindropItem[] }) {
  const { selectedIds, go, clearSelection } = useAppState();
  const collections = useCollections();
  // R4P : `dest` est collecté puis jeté en Task 9 (l'action part sans
  // destination) — la Task 13 branchera `toCollectionId`.
  const [dest, setDest] = useState("");
  const [tags, setTags] = useState("");
  if (selectedIds.size === 0) return null;

  const selected = items.filter((i) => selectedIds.has(i.id));
  // R9P-1 : la Revue CONSOMME la sélection — go PUIS clearSelection, dans cet
  // ordre (chirurgical : le clear appartient à l'action, pas au `go` général ;
  // une navigation ordinaire garde sa sélection).
  const build = (action: BulkAction) => {
    go({
      kind: "review",
      items: selected.map((i) => ({ id: i.id, url: i.url, title: i.title, collectionId: i.collectionId })),
      action,
      sourceLabel: t("bulk.selection"),
    });
    clearSelection();
  };

  return (
    <div className="flex items-center gap-2 border-t border-app-border bg-app-panel px-3 py-2 text-sm">
      <span className="font-medium">{t("bulk.selected", { n: selectedIds.size })}</span>
      {/* §6 : le seul rouge légitime est --color-app-broken, couleur d'un
          diagnostic — le snippet du brief portait un jeton fantôme (R9P-2). */}
      <button type="button" className="rounded border border-app-broken px-2 py-1 text-app-broken" onClick={() => build({ op: "trash" })}>{t("bulk.trash")}</button>
      <select aria-label={t("bulk.destination")} className="input" value={dest} onChange={(e) => setDest(e.target.value)}>
        <option value="">— {t("bulk.move")} —</option>
        {(collections.data ?? []).map((c) => <option key={c.id} value={String(c.id)}>{c.title}</option>)}
      </select>
      <button type="button" className="rounded border border-app-border px-2 py-1 disabled:opacity-40" disabled={!dest} onClick={() => dest && build({ op: "move" })}>{t("bulk.move")}</button>
      <input aria-label={t("bulk.tag")} className="input w-40" placeholder={t("bulk.tag")} value={tags} onChange={(e) => setTags(e.target.value)} />
      <button type="button" className="rounded border border-app-border px-2 py-1 disabled:opacity-40" disabled={!tags} onClick={() => tags && build({ op: "tag" })}>{t("bulk.tag")}</button>
    </div>
  );
}
