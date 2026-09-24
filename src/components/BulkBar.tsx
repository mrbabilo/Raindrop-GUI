import { useState } from "react";
import { t } from "../i18n/fr";
import { Icone } from "../design/icones";
import { useAppState, type View } from "../state/appState";
import { useUnrestore } from "../hooks/useMutations";
import { useCollections } from "../hooks/useStaticData";
import { chemin } from "../lib/arbre";
import type { CibleDepot } from "../state/drag";
import type { RaindropItem } from "../../shared/types";

// L'action portée par la vue review — dérivée de View, jamais recopiée :
// R15P-4 l'a étendue (move porte sa destination, tag ses étiquettes).
type BulkAction = Extract<View, { kind: "review" }>["action"];

// Pied de liste (visible si selectedIds.size > 0) : compteur + actions.
//
// Deux familles (spec §4.3, amendée le 2026-09-24) :
// - la corbeille et le déplacement S'EXÉCUTENT ici, par `agir` — les verbes
//   du glisser-déposer (useDragBookmark), avec leur avis et leur Annuler :
//   défaisables, ils n'ont plus besoin de l'aperçu pour être sûrs ;
// - l'étiquetage (dont Raindrop n'offre aucun retour arrière : on ne sait
//   pas qui portait déjà l'étiquette) et l'archivage passent par la Revue.
//
// « Déplacer » avait été retiré (la largeur ; « le glisser-déposer fait le
// même geste ») : déplacer plusieurs signets n'existait plus qu'à la souris
// — écart spec §115, audit d'ergonomie du 2026-09-24. `flex-wrap` absorbe
// la largeur.
export function BulkBar({ items, agir }: {
  items: RaindropItem[];
  /** Rend `true` si l'action a abouti — la sélection n'est vidée qu'alors. */
  agir: (ids: number[], cible: CibleDepot) => Promise<boolean>;
}) {
  const { view, selectedIds, go, clearSelection, toggleSelect, selectMany } = useAppState();
  const unrestore = useUnrestore();
  const arbre = useCollections().data ?? [];
  const [tags, setTags] = useState("");
  const [destination, setDestination] = useState("");
  const [enVol, setEnVol] = useState(false);
  // Le compte des corbeillés SANS origine mémorisée : non restaurés par le
  // bloc, dit tel quel — jamais confondus avec des restaurés.
  const [nonRestaures, setNonRestaures] = useState(0);
  const enCorbeille = view.kind === "list" && view.collectionId === -99;
  const selected = items.filter((i) => selectedIds.has(i.id));
  // La garde porte sur ce qui est RÉELLEMENT actionnable ici, pas sur la
  // taille de la sélection. Garder une sélection en changeant de vue est
  // voulu (R9P-1) — mais avec `selectedIds.size`, arriver dans une collection
  // qui n'en contient aucun affichait une barre « 0 sélectionnés » offrant
  // la corbeille, l'archivage et l'étiquetage sur un ensemble VIDE.
  if (selected.length === 0) return null;
  // La garde porte la liste PARSÉE, calculée UNE fois et lue par le bouton
  // ET le handler (le même motif que NonTaggues) : « , , » est truthy mais
  // parse vide — le bulk update qui en résulterait effacerait toutes les
  // étiquettes des items sélectionnés.
  const etiquettesParses = tags.split(",").map((s) => s.trim()).filter(Boolean);
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
  const executer = (cible: CibleDepot) => {
    setEnVol(true);
    void agir(selected.map((i) => i.id), cible).then((ok) => {
      setEnVol(false);
      if (!ok) return;
      setDestination("");
      clearSelection();
    });
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
      {/* Tout ce qui est CHARGÉ, en un clic — et rien de plus : la sélection
          ne s'étend pas à des signets que l'écran n'a pas montrés. */}
      {selected.length < items.length && (
        <button type="button" className="btn" onClick={() => selectMany(items.map((i) => i.id))}>
          {t("bulk.toutSelectionner", { n: items.length })}
        </button>
      )}
      {/* En vue corbeille, re-corbeiller un corbeillé n'a pas de sens : le
          verbe devient RESTAURER, exécuté là (réversible par nature — pas
          une Revue). Les items à l'origine inconnue restent en liste, la vue
          Nettoyage→Corbeille y choisit leur destination (§4.2). */}
      {enCorbeille ? (
        <>
          <button
            type="button"
            className="btn"
            disabled={unrestore.isPending}
            onClick={() =>
              unrestore.mutate(
                { ids: selected.map((i) => i.id) },
                {
                  // Les NON restaurés restent sélectionnés : vider toute la
                  // sélection démontait la barre, et le message qui les
                  // compte n'a jamais pu s'afficher (audit UX du 2026-09-23).
                  onSuccess: (res) => {
                    const inconnus = new Set(res.unknown ?? []);
                    setNonRestaures(inconnus.size);
                    if (inconnus.size === 0) clearSelection();
                    else for (const i of selected) if (!inconnus.has(i.id)) toggleSelect(i.id);
                  },
                },
              )
            }
          >
            <Icone nom="restaurer" className="inline align-[-2px] mr-1" />
            {t("bulk.restore", { n: selected.length })}
          </button>
          {nonRestaures > 0 && (
            <span className="text-xs text-app-broken">
              {t("bulk.restore.unknown", { n: nonRestaures })}
            </span>
          )}
          {/* R8P-1 : un échec se dit — la sélection reste, prête à réessayer. */}
          {unrestore.isError && (
            <span role="alert" className="text-xs text-app-broken">
              {t("state.error", { message: unrestore.error.message })}
            </span>
          )}
        </>
      ) : (
        <button type="button" className="btn border-app-broken text-app-broken" disabled={enVol} onClick={() => executer({ sorte: "corbeille" })}>
          <Icone nom="corbeille" className="inline align-[-2px] mr-1" />
          {t("bulk.trash")}
        </button>
      )}
      {/* Hors corbeille, un déplacement ; dedans, une SORTIE vers la
          destination choisie — la voie des signets sans origine connue. */}
      <select aria-label={t("bulk.destination")} className="input w-40" value={destination} onChange={(e) => setDestination(e.target.value)}>
        <option value="">{t("bulk.chooseCollection")}</option>
        <option value="-1">{t("nav.unsorted")}</option>
        {arbre.map((c) => <option key={c.id} value={String(c.id)}>{chemin(arbre, c)}</option>)}
      </select>
      <button type="button" className="btn" disabled={destination === "" || enVol} onClick={() => executer({ sorte: "collection", id: Number(destination) })}>
        {t("bulk.move")}
      </button>
      {/* L'archive est la seule action qui n'écrit RIEN chez Raindrop : elle
          copie en local ce qui existe déjà côté serveur. */}
      <button type="button" className="btn" onClick={() => build({ op: "archive" })}>
        {t("bulk.archive")}
      </button>
      <input aria-label={t("bulk.tagField")} className="input w-40" placeholder={t("bulk.tagPlaceholder")} value={tags} onChange={(e) => setTags(e.target.value)} />
      {/* Revue finale : le garde porte la liste PARSÉE, pas la chaîne brute —
          « , , » est truthy mais parse vide, et le bulk update qui en
          résulterait effacerait toutes les étiquettes des items sélectionnés. */}
      <button
        type="button"
        className="btn"
        disabled={etiquettesParses.length === 0}
        onClick={() => {
          if (etiquettesParses.length > 0) build({ op: "tag", tags: etiquettesParses });
        }}
      >
        {t("bulk.tag")}
      </button>
      {/* Il n'existait AUCUN moyen de défaire une sélection : cinquante
          signets cochés se décochaient un par un. La commande est en fin de
          barre, après les actions — elle défait, elle n'engage rien. */}
      <button type="button" className="btn ml-auto" onClick={clearSelection}>
        {t("bulk.clear")}
      </button>
    </div>
  );
}
