import { useEffect, useRef, useState } from "react";
import { t } from "../i18n/fr";
import { useAppState } from "../state/appState";
import { NatureChips } from "./NatureChips";

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
  // DESIGN.md §11 : la rangée de puces de nature apparaît au focus du champ
  // de recherche et reste visible tant qu'une nature est active, même après
  // le blur (sinon désactiver le filtre exigerait de re-focaliser).
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
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
    <div ref={containerRef} className="border-b border-app-border">
      <div className="flex items-center gap-2 px-3 py-2">
        <input
          className="input w-64"
          placeholder={t("search.placeholder")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            // Cliquer une puce déplace le focus de l'input vers le bouton :
            // relatedTarget reste dans le même conteneur, on ne masque pas
            // la rangée sous le clic (sinon le clic n'atteint jamais le
            // bouton — DESIGN.md §11 « disparaît au blur si aucune n'est
            // active », pas « au blur tout court »).
            if (containerRef.current?.contains(e.relatedTarget as Node | null)) return;
            setFocused(false);
          }}
        />
        <select aria-label={t("filter.sort")} className="input" value={view.sort ?? "-created"} onChange={(e) => patchList({ sort: e.target.value })}>
          <option value="-created">{t("sort.created-desc")}</option>
          <option value="created">{t("sort.created-asc")}</option>
          <option value="title">{t("sort.title-asc")}</option>
          <option value="-title">{t("sort.title-desc")}</option>
          <option value="domain">{t("sort.domain-asc")}</option>
        </select>
        <input aria-label={t("filter.domain")} className="input w-32" placeholder={t("filter.domainPlaceholder")} value={view.domain ?? ""} onChange={(e) => patchList({ domain: e.target.value || undefined })} />
        <input aria-label={t("filter.from")} type="date" className="input" value={view.createdStart ?? ""} onChange={(e) => patchList({ createdStart: e.target.value || undefined })} />
        <input aria-label={t("filter.to")} type="date" className="input" value={view.createdEnd ?? ""} onChange={(e) => patchList({ createdEnd: e.target.value || undefined })} />
        <div className="ml-auto flex gap-1">
          <button type="button" aria-pressed={view.viewMode !== "mosaic"} className={toggle + (view.viewMode !== "mosaic" ? toggleOn : "")} onClick={() => patchList({ viewMode: "list" })}>{t("view.list")}</button>
          <button type="button" aria-pressed={view.viewMode === "mosaic"} className={toggle + (view.viewMode === "mosaic" ? toggleOn : "")} onClick={() => patchList({ viewMode: "mosaic" })}>{t("view.mosaic")}</button>
        </div>
      </div>
      <NatureChips focused={focused} />
    </div>
  );
}
