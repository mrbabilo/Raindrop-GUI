import { useEffect, useRef, useState } from "react";
import { t } from "../i18n/fr";
import { useAppState } from "../state/appState";
import { NatureChips } from "./NatureChips";
import { PanneauFiltres, actifs } from "./PanneauFiltres";
import { Icone } from "../design/icones";

// Champs : classe .input de styles.css (28 px, rayon 7, 13 px — DESIGN.md
// §7-§8). Commandes en icône seule : .btn, carré, le nom accessible venant
// de l'aria-label (§9 — sans lui l'épure fabrique une dette d'a11y).
const commande = "btn px-0 w-[28px] justify-center";

export function TopBar() {
  const { view, patchList } = useAppState();
  const isList = view.kind === "list";
  const [draft, setDraft] = useState(isList ? (view.search ?? "") : "");
  // DESIGN.md §11 : la rangée de puces de nature apparaît au focus du champ
  // de recherche et reste visible tant qu'une nature est active, même après
  // le blur (sinon désactiver le filtre exigerait de re-focaliser).
  const [focused, setFocused] = useState(false);
  // §9 : le panneau des filtres rares est replié par défaut — PanneauFiltres
  // décide seul de rester déplié tant qu'un de ses filtres est actif.
  const [reglages, setReglages] = useState(false);
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

  const enMosaique = view.viewMode === "mosaic";

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
        {/* §9 : bouton-état — le contrôle nomme son tri courant. Toujours un
            <select> natif : sur macOS il s'ouvre en menu, et le clavier,
            Échap et VoiceOver viennent avec. */}
        <span className="etat">
          <select aria-label={t("filter.sort")} value={view.sort ?? "-created"} onChange={(e) => patchList({ sort: e.target.value })}>
            <option value="-created">{t("sort.created-desc")}</option>
            <option value="created">{t("sort.created-asc")}</option>
            <option value="title">{t("sort.title-asc")}</option>
            <option value="-title">{t("sort.title-desc")}</option>
            <option value="domain">{t("sort.domain-asc")}</option>
          </select>
          <Icone nom="chevron" />
        </span>
        <button
          type="button"
          aria-label={t("filter.advanced")}
          aria-expanded={reglages || actifs(view)}
          aria-controls="panneau-filtres"
          className={commande}
          onClick={() => setReglages((v) => !v)}
        >
          <Icone nom="reglages" />
        </button>
        {/* §9 : un geste, un contrôle. L'icône montre le mode VERS LEQUEL on
            bascule, et son nom accessible le dit — pas d'aria-pressed, ce
            n'est plus un état à deux boutons mais une action nommée. */}
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            aria-label={enMosaique ? t("view.showList") : t("view.showMosaic")}
            className={commande}
            onClick={() => patchList({ viewMode: enMosaique ? "list" : "mosaic" })}
          >
            <Icone nom={enMosaique ? "liste" : "mosaique"} />
          </button>
        </div>
      </div>
      <NatureChips focused={focused} />
      <PanneauFiltres ouvert={reglages} />
    </div>
  );
}
