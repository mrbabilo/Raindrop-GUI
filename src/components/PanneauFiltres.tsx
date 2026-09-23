import { useEffect, useState } from "react";
import { t } from "../i18n/fr";
import { Icone } from "../design/icones";
import { useAppState } from "../state/appState";

// DESIGN.md §9 « révélé, pas posé » : domaine et dates servent rarement —
// posés en permanence, ils alignaient sept contrôles de même poids dans la
// TopBar (le grief de §11). Ils vivent ici, dépliés par l'icône de réglages.
// Même précédent que NatureChips : le panneau lit la vue lui-même, TopBar ne
// lui passe que la révélation.

// Les filtres du panneau — un seul endroit les nomme, et « Effacer » comme
// « y a-t-il quelque chose à effacer » s'en déduisent.
//
// `tags` n'y est PAS, et c'est voulu : les étiquettes retenues ont leur propre
// rangée, toujours visible, avec son propre retrait (EtiquettesRetenues). Les
// ajouter ici aurait deux effets, tous deux faux — « Effacer les filtres »
// retirerait des étiquettes qu'il ne montre pas, et un tableau VIDE étant
// truthy, `tags: []` déplierait le panneau en permanence sur rien.
const CHAMPS = ["domain", "createdStart", "createdEnd"] as const;

export function actifs(view: ReturnType<typeof useAppState>["view"]): boolean {
  return view.kind === "list" && CHAMPS.some((k) => view[k]);
}

export function PanneauFiltres({ ouvert }: { ouvert: boolean }) {
  const { view, patchList } = useAppState();
  // Le DOMAINE se tape : appliqué à chaque frappe, il changeait la clé de
  // requête à chaque caractère — une requête par frappe dans la file à
  // 550 ms, et « Rien ici » à chaque préfixe (`domain:youtube` → 0 sans
  // erreur, CLAUDE.md). Brouillon local, posé après une pause de 300 ms
  // comme la recherche — jamais re-posé s'il égale la vue (le patch efface
  // `smartlistId`, leçon de la TopBar). Un brouillon en attente compte comme
  // un filtre actif : replier pendant la pause ne cache pas la saisie
  // (audit du 2026-09-23). Les dates, elles, se posent d'un geste.
  const domaineVue = view.kind === "list" ? view.domain : undefined;
  const [domaine, setDomaine] = useState(domaineVue ?? "");
  useEffect(() => setDomaine(domaineVue ?? ""), [domaineVue]);
  useEffect(() => {
    if ((domaine || undefined) === domaineVue) return;
    const id = setTimeout(() => patchList({ domain: domaine || undefined }), 300);
    return () => clearTimeout(id);
  }, [domaine, domaineVue]);
  if (view.kind !== "list") return null;
  // Un filtre posé ne peut pas devenir invisible : sans cette persistance,
  // replier le panneau laisserait un filtre actif que plus rien ne retire
  // (même contrat qu'en §11 pour une puce de nature active).
  const actif = actifs(view) || domaine !== "";
  if (!ouvert && !actif) return null;

  const effacer = () => {
    setDomaine("");
    patchList({ domain: undefined, createdStart: undefined, createdEnd: undefined });
  };

  return (
    <div id="panneau-filtres" className="flex items-center gap-2 px-3 pb-2">
      <input
        aria-label={t("filter.domain")}
        className="input w-32"
        placeholder={t("filter.domainPlaceholder")}
        value={domaine}
        onChange={(e) => setDomaine(e.target.value)}
      />
      <input
        aria-label={t("filter.from")}
        type="date"
        className="input"
        value={view.createdStart ?? ""}
        onChange={(e) => patchList({ createdStart: e.target.value || undefined })}
      />
      <input
        aria-label={t("filter.to")}
        type="date"
        className="input"
        value={view.createdEnd ?? ""}
        onChange={(e) => patchList({ createdEnd: e.target.value || undefined })}
      />
      {/* §9 « masqué si nul » : rien à effacer, pas de commande — et c'est
          elle qui rend le repli possible quand un filtre est posé. */}
      {actif && (
        <button type="button" className="btn btn-icone" aria-label={t("filter.clear")} onClick={effacer}>
          <Icone nom="croix" />
        </button>
      )}
    </div>
  );
}
