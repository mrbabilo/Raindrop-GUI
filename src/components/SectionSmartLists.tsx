import { useState } from "react";
import { t } from "../i18n/fr";
import { useAppState } from "../state/appState";
import { useSmartLists, useRenommerSmartList, useSupprimerSmartList } from "../hooks/useSmartLists";
import { vueVersView } from "../lib/smartlists";
import { Icone } from "../design/icones";
import { nomIcone } from "../design/nomIcone";

// Mêmes jetons que les entrées de la Sidebar (28 px, §8) : une smart list
// se lit comme une vue fixe — la surface porte la sélection, jamais une
// teinte (§9). Définies ICI et non importées de Sidebar.tsx : un import
// remonterait en cycle (Sidebar rend cette section).
const item = "flex min-w-0 flex-1 items-center gap-2 text-left rounded px-2 py-1 leading-5 hover:bg-app-hover cursor-pointer";
const selected = " bg-app-sel font-medium";

// Les commandes sont RÉVÉLÉES au survol, jamais posées (§9 « révélé, pas
// posé ») : absolues, elles ne réservent aucune place au repos ; opacité 0
// mais PRÉSENTES au parcours de tabulation — pointer-events coupé au repos,
// `focus-within` les révèle aussi au clavier.
const commandes =
  "absolute right-0 flex items-center bg-app opacity-0 pointer-events-none " +
  "group-hover:opacity-100 group-hover:pointer-events-auto " +
  "group-focus-within:opacity-100 group-focus-within:pointer-events-auto";

export function SectionSmartLists() {
  const { view, go, forgetSmartList } = useAppState();
  const smartlists = useSmartLists();
  const renommer = useRenommerSmartList();
  const supprimer = useSupprimerSmartList();
  const [edition, setEdition] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // §9 « masqué si nul » : pas d'entrées, pas de titre — SAUF en échec,
  // où la section dit son état (spec §6, comme les autres requêtes).
  const items = smartlists.data ?? [];
  if (!smartlists.isError && items.length === 0) return null;

  return (
    <section>
      <h2 className="px-2 text-xs font-medium text-app-muted">{t("smartlist.section")}</h2>
      {smartlists.isError && (
        <p className="px-2 text-xs text-app-muted">{t("smartlist.indisponible")}</p>
      )}
      {items.map((sl) =>
        edition === sl.id ? (
          <input
            key={sl.id}
            aria-label={t("smartlist.renameField")}
            className="input w-full"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim() !== "") {
                renommer.mutate({ id: sl.id, label: draft.trim() });
                setEdition(null);
              }
              if (e.key === "Escape") setEdition(null);
            }}
          />
        ) : (
          <div key={sl.id} className="group relative flex items-center">
            <button
              data-nav
              className={item + (view.kind === "list" && view.smartlistId === sl.id ? selected : "")}
              onClick={() => go(vueVersView(sl))}
            >
              <span className="min-w-0 flex-1 truncate">{sl.label}</span>
            </button>
            <span className={commandes}>
              <button
                type="button"
                className="btn btn-icone"
                {...nomIcone(t("smartlist.renameAria", { name: sl.label }))}
                onClick={() => {
                  setDraft(sl.label);
                  setEdition(sl.id);
                }}
              >
                <Icone nom="crayon" />
              </button>
              {/* Sans frappe de confirmation (spec §5) : une smart list se
                  recrée en trois clics — la frappe SUPPRIMER reste aux gestes
                  irréversibles. */}
              <button
                type="button"
                className="btn btn-icone"
                {...nomIcone(t("smartlist.deleteAria", { name: sl.label }))}
                onClick={() => {
                  supprimer.mutate(sl.id);
                  forgetSmartList(sl.id); // no-op si la vue ouverte n'est pas celle-ci
                }}
              >
                <Icone nom="croix" />
              </button>
            </span>
          </div>
        ),
      )}
    </section>
  );
}
