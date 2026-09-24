import { useEffect, useRef, useState } from "react";
import { t } from "../i18n/fr";
import { useAppState } from "../state/appState";
import { NatureChips } from "./NatureChips";
import { PanneauFiltres, actifs } from "./PanneauFiltres";
import { EtiquettesRetenues } from "./EtiquettesRetenues";
import { Icone } from "../design/icones";
import { filtreActif, serialiserVue } from "../lib/smartlists";
import { useCreerSmartList } from "../hooks/useSmartLists";
import { nomIcone } from "../design/nomIcone";

// Champs : classe .input de styles.css (28 px, rayon 7, 13 px — DESIGN.md
// §7-§8). Commandes en icône seule : .btn-icone, carrée — sa géométrie vit
// dans la feuille, pas en utilitaires (le padding de .btn gagnait contre
// `px-0` et écrasait l'icône). Le nom accessible vient de l'aria-label
// (§9 — sans lui l'épure fabrique une dette d'a11y).
const commande = "btn btn-icone";

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
  // Le formulaire inline de sauvegarde (spec §4) : ouvert par le bouton,
  // prérempli au CLIC (la vue peut changer entre le rendu et le geste).
  // Hooks AVANT le early return `!isList` — les appels conditionnels sont
  // interdits.
  const creerVue = useCreerSmartList();
  const [sauvegarde, setSauvegarde] = useState(false);
  const [nomVue, setNomVue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const poserVue = () => {
    if (view.kind !== "list" || nomVue.trim() === "") return;
    creerVue.mutate(
      { label: nomVue.trim(), vue: serialiserVue(view) },
      { onSuccess: () => { setSauvegarde(false); setNomVue(""); } },
    );
  };
  useEffect(() => { if (isList) setDraft(view.search ?? ""); }, [isList, view.kind === "list" ? view.search : ""]);

  // Recherche debouncée (300 ms) : chaque frappe réarme le timer — la requête
  // ne part qu'après une pause de la saisie. Le reset de page est implicite :
  // patchList change la queryKey de useRaindrops.
  // Une saisie ÉGALE à la vue n'est pas une saisie : sans ce garde, la
  // resynchronisation d'après navigation re-patchait la recherche courante,
  // et le patch efface `smartlistId` — la vue sauvegardée perdait son
  // surlignage 300 ms après son ouverture (audit du 2026-09-23).
  const rechercheVue = view.kind === "list" ? view.search : undefined;
  useEffect(() => {
    if (!isList || (draft || undefined) === (rechercheVue || undefined)) return;
    const id = setTimeout(() => patchList({ search: draft || undefined }), 300);
    return () => clearTimeout(id);
  }, [draft, isList, rechercheVue]);

  if (!isList) return <div />;

  const enMosaique = view.viewMode === "mosaic";

  return (
    <div ref={containerRef} className="border-b border-app-border">
      <div className="flex items-center gap-2 px-3 py-2">
        <input
          aria-label={t("search.label")}
          data-testid="recherche"
          className="input w-64"
          // La recherche porte sur la collection OUVERTE : le champ le dit —
          // ne rien trouver dans « Dev » ne veut pas dire « nulle part ».
          placeholder={view.collectionId === 0 ? t("search.placeholder") : t("search.placeholderDans", { label: view.label })}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          // Échap VIDE une recherche saisie (champ de recherche macOS) — et
          // s'arrête là : la fiche ouverte ne se referme pas avec. Champ
          // vide, Échap passe son chemin.
          onKeyDown={(e) => {
            if (e.key !== "Escape" || draft === "") return;
            e.stopPropagation();
            setDraft("");
          }}
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
          {...nomIcone(t("filter.advanced"))}
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
          {/* Sauvegarder la vue (spec §4) : le bouton n'existe qu'avec un
              filtre actif ; le tri seul ne suffit pas — filtreActif le dit. */}
          {!sauvegarde && filtreActif(view) && (
            <button
              type="button"
              {...nomIcone(t("smartlist.saveView"))}
              className={commande}
              onClick={() => {
                setNomVue((view.search?.trim() || view.tags?.[0] || "").trim());
                setSauvegarde(true);
              }}
            >
              <Icone nom="marquePage" />
            </button>
          )}
          {sauvegarde && (
            <>
              <input
                aria-label={t("smartlist.nameAria")}
                className="input w-40"
                autoFocus
                value={nomVue}
                onChange={(e) => setNomVue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") poserVue();
                  if (e.key === "Escape") {
                    setSauvegarde(false);
                    setNomVue("");
                    creerVue.reset();
                  }
                }}
              />
              <button
                type="button"
                {...nomIcone(t("smartlist.pose"))}
                className={commande}
                disabled={creerVue.isPending || nomVue.trim() === ""}
                onClick={poserVue}
              >
                <Icone nom="coche" />
              </button>
              {/* Un échec de pose se dit — il laissait le formulaire ouvert
                  sans un mot (audit UX du 2026-09-23). */}
              {creerVue.isError && (
                <span role="alert" className="self-center text-xs text-app-broken">
                  {t("state.error", { message: creerVue.error.message })}
                </span>
              )}
            </>
          )}
          <button
            type="button"
            {...nomIcone(enMosaique ? t("view.showList") : t("view.showMosaic"))}
            className={commande}
            onClick={() => patchList({ viewMode: enMosaique ? "list" : "mosaic" })}
          >
            <Icone nom={enMosaique ? "liste" : "mosaique"} />
          </button>
        </div>
      </div>
      <EtiquettesRetenues />
      <NatureChips focused={focused} />
      <PanneauFiltres ouvert={reglages} />
    </div>
  );
}
