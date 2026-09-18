import { useState } from "react";
import { t } from "../i18n/fr";
import { useAppState, type View } from "../state/appState";
import type { RaindropItem } from "../../shared/types";

// L'action portée par la vue review — dérivée de View, jamais recopiée :
// R15P-4 l'a étendue (move porte sa destination, tag ses étiquettes).
type BulkAction = Extract<View, { kind: "review" }>["action"];

// Pied de liste (visible si selectedIds.size > 0) : compteur + les actions
// qui construisent la vue review. Rien n'exécute ici : la Revue (Task 15)
// propose, l'utilisateur dispose.
//
// « Déplacer » et son sélecteur de collection ont été RETIRÉS : le
// glisser-déposer d'un signet vers une collection fait le même geste, à la
// souris, et ces deux contrôles coûtaient la moitié de la largeur d'une barre
// qui vit dans une colonne rétrécie par les panneaux latéraux.
export function BulkBar({ items }: { items: RaindropItem[] }) {
  const { view, selectedIds, go, clearSelection } = useAppState();
  const [tags, setTags] = useState("");
  if (selectedIds.size === 0) return null;

  const selected = items.filter((i) => selectedIds.has(i.id));
  // R9P-1 : la Revue CONSOMME la sélection — go PUIS clearSelection, dans cet
  // ordre (chirurgical : le clear appartient à l'action, pas au `go` général ;
  // une navigation ordinaire garde sa sélection).
  // R15P-3 : la vue list courante voyage en returnView — App en déduit le
  // retour après exécution de la Revue.
  const build = (action: BulkAction) => {
    go({
      kind: "review",
      // `cache` embarqué : la Revue s'en sert pour compter ce qui a vraiment
      // une copie permanente à archiver (spec sélection §4.2). La liste le
      // connaît — il arrive gratuitement dans la réponse de liste.
      items: selected.map((i) => ({
        id: i.id,
        url: i.url,
        title: i.title,
        collectionId: i.collectionId,
        cache: i.cache,
      })),
      action,
      sourceLabel: t("bulk.selection"),
      returnView: view,
    });
    clearSelection();
  };

  return (
    // `flex-wrap` : la barre vit dans la colonne centrale, dont la largeur
    // dépend des deux panneaux latéraux. Sans repli, ses derniers contrôles
    // sortaient de la colonne et se faisaient rogner — invisibles, donc
    // inatteignables.
    <div className="flex flex-wrap items-center gap-2 border-t border-app-border bg-app-panel px-3 py-2 text-sm">
      {/* R15P-2 : compteur honnête — seuls les items de la page embarqués
          dans la Revue sont comptés (selectedIds peut déborder la page). */}
      <span className="font-medium">{t("bulk.selected", { n: selected.length })}</span>
      {/* §6 : le seul rouge légitime est --color-app-broken, couleur d'un
          diagnostic — le snippet du brief portait un jeton fantôme (R9P-2). */}
      <button type="button" className="rounded border border-app-broken px-2 py-1 text-app-broken" onClick={() => build({ op: "trash" })}>{t("bulk.trash")}</button>
      {/* L'archive est la seule action qui n'écrit RIEN chez Raindrop : elle
          copie en local ce qui existe déjà côté serveur. */}
      <button type="button" className="rounded border border-app-border px-2 py-1" onClick={() => build({ op: "archive" })}>
        {t("bulk.archive")}
      </button>
      <input aria-label={t("bulk.tagField")} className="input w-40" placeholder={t("bulk.tagPlaceholder")} value={tags} onChange={(e) => setTags(e.target.value)} />
      {/* Revue finale : le garde porte la liste PARSÉE, pas la chaîne brute —
          « , , » est truthy mais parse vide, et le bulk update qui en
          résulterait effacerait toutes les étiquettes des items sélectionnés. */}
      <button
        type="button"
        className="rounded border border-app-border px-2 py-1 disabled:opacity-40"
        disabled={tags.split(",").map((s) => s.trim()).filter(Boolean).length === 0}
        onClick={() => {
          const parsed = tags.split(",").map((s) => s.trim()).filter(Boolean);
          if (parsed.length > 0) build({ op: "tag", tags: parsed });
        }}
      >
        {t("bulk.tag")}
      </button>
    </div>
  );
}
