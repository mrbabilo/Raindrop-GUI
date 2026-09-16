import { useEffect, useState } from "react";
import { t } from "../i18n/fr";
import { useAppState } from "../state/appState";

// Champs : classe .input de styles.css (28 px, rayon 7, 13 px — DESIGN.md
// §7-§8). Bascule liste/mosaïque : l'état actif se marque par la surface
// (§6 sel/work), jamais par une teinte.
const toggle =
  "rounded border border-app-border px-2 py-1 text-xs cursor-pointer bg-transparent hover:bg-app-hover";
const toggleOn = " bg-app-panel font-medium";

export function TopBar() {
  const { view, patchList } = useAppState();
  const isList = view.kind === "list";
  const [draft, setDraft] = useState(isList ? (view.search ?? "") : "");
  useEffect(() => { if (isList) setDraft(view.search ?? ""); }, [isList, view.kind === "list" ? view.search : ""]);

  // Recherche debouncée (300 ms) : chaque frappe réarme le timer — la requête
  // ne part qu'après une pause de la saisie. Le reset de page est implicite :
  // patchList change la queryKey de useRaindrops.
  useEffect(() => {
    if (!isList) return;
    const id = setTimeout(() => patchList({ search: draft || undefined }), 300);
    return () => clearTimeout(id);
  }, [draft, isList]);

  if (!isList) return <div />;

  return (
    <div className="flex items-center gap-2 border-b border-app-border px-3 py-2">
      <input className="input w-64" placeholder={t("search.placeholder")} value={draft} onChange={(e) => setDraft(e.target.value)} />
      <select aria-label={t("filter.sort")} className="input" value={view.sort ?? "-created"} onChange={(e) => patchList({ sort: e.target.value })}>
        <option value="-created">{t("sort.created-desc")}</option>
        <option value="created">{t("sort.created-asc")}</option>
        <option value="title">{t("sort.title-asc")}</option>
        <option value="-title">{t("sort.title-desc")}</option>
        <option value="domain">{t("sort.domain-asc")}</option>
      </select>
      <input aria-label={t("filter.domain")} className="input w-32" placeholder={t("filter.domainPlaceholder")} value={view.domain ?? ""} onChange={(e) => patchList({ domain: e.target.value || undefined })} />
      <select aria-label={t("filter.media")} className="input" value={view.media ?? ""} onChange={(e) => patchList({ media: e.target.value || undefined })}>
        <option value="">—</option>
        <option value="article">article</option>
        <option value="image">image</option>
        <option value="video">video</option>
        <option value="document">document</option>
        <option value="audio">audio</option>
      </select>
      <input aria-label={t("filter.from")} type="date" className="input" value={view.createdStart ?? ""} onChange={(e) => patchList({ createdStart: e.target.value || undefined })} />
      <input aria-label={t("filter.to")} type="date" className="input" value={view.createdEnd ?? ""} onChange={(e) => patchList({ createdEnd: e.target.value || undefined })} />
      <div className="ml-auto flex gap-1">
        <button type="button" aria-pressed={view.viewMode !== "mosaic"} className={toggle + (view.viewMode !== "mosaic" ? toggleOn : "")} onClick={() => patchList({ viewMode: "list" })}>{t("view.list")}</button>
        <button type="button" aria-pressed={view.viewMode === "mosaic"} className={toggle + (view.viewMode === "mosaic" ? toggleOn : "")} onClick={() => patchList({ viewMode: "mosaic" })}>{t("view.mosaic")}</button>
      </div>
    </div>
  );
}
