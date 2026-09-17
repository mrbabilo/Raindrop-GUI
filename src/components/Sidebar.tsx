import { t } from "../i18n/fr";
import { useCollections, useTags } from "../hooks/useStaticData";
import { useAppState } from "../state/appState";
import { useDrag } from "../state/drag";
import { depotPermis } from "../hooks/useDragBookmark";
import { GroupeCollection } from "./GroupeCollection";

// Entrée de navigation : 28 px de haut (DESIGN.md §8 — leading-5 + py-1),
// 13 px du corps (§7). Survol et sélection par les jetons dédiés de §6
// (hover, sel) — la sélection se marque par une surface, jamais une teinte.
const item = "block w-full text-left rounded px-2 py-1 leading-5 hover:bg-app-hover cursor-pointer truncate";
const selected = " bg-app-sel font-medium";
const count = "text-xs text-app-muted";

// DESIGN.md §9 « masqué si nul » : un compteur à 0 ne s'affiche pas. Le
// fragment porte l'espace séparateur — sans lui, masquer le chiffre
// laisserait une espace pendante derrière le titre.
// Cible active d'un déplacement : la surface `sel` (§6), jamais une teinte —
// c'est la même marque que la sélection, et pour la même raison (« ceci est
// l'endroit courant »).
const cibleActive = " bg-app-sel";

const Compteur = ({ n }: { n: number }) =>
  n > 0 ? <> <span className={count}>{n}</span></> : null;

export function Sidebar() {
  const { view, go } = useAppState();
  // Pendant un déplacement, chaque collection devient une cible. Le survol se
  // signale au contexte : c'est lui que le relâchement interrogera.
  const { ids: enDeplacement, cible, survoler } = useDrag();
  // Handlers de cible, posés sur les seules entrées qui acceptent un dépôt —
  // ni la corbeille, ni « Tous », ni les marqueurs d'état (depotPermis).
  const accueil = (collectionId: number) =>
    enDeplacement === null || !depotPermis(collectionId)
      ? {}
      : {
          onPointerEnter: () => survoler(collectionId),
          onPointerLeave: () => survoler(null),
        };
  const survolee = (collectionId: number) =>
    enDeplacement !== null && cible === collectionId ? cibleActive : "";
  const collections = useCollections();
  const tags = useTags();
  const isList = (id: number) => view.kind === "list" && view.collectionId === id;
  const roots = (collections.data ?? []).filter((c) => c.parentId === null);
  const childrenOf = (id: number) => (collections.data ?? []).filter((c) => c.parentId === id);

  // Vues fixes : Tous (0), Non-lus (-2), Favoris (-3), Corbeille (-99).
  // -2/-3 sont des marqueurs front (ruling R3P) : useRaindrops les convertit
  // en requêtes ; la Sidebar n'émet que `go`.
  return (
    <nav className="flex h-full flex-col gap-3 overflow-y-auto p-2">
      <section className="flex flex-col gap-0.5">
        <button className={item + (isList(0) ? selected : "")} onClick={() => go({ kind: "list", collectionId: 0, label: t("nav.all") })}>{t("nav.all")}</button>
        <button className={item + (isList(-2) ? selected : "")} onClick={() => go({ kind: "list", collectionId: -2, label: t("nav.unread") })}>{t("nav.unread")}</button>
        <button className={item + (isList(-3) ? selected : "")} onClick={() => go({ kind: "list", collectionId: -3, label: t("nav.favorites") })}>{t("nav.favorites")}</button>
        <button className={item + (isList(-99) ? selected : "")} onClick={() => go({ kind: "list", collectionId: -99, label: t("nav.trash") })}>{t("nav.trash")}</button>
      </section>

      <button className={item + (view.kind === "cleanup" ? selected : "")} onClick={() => go({ kind: "cleanup" })}>{t("nav.cleanup")}</button>

      <section>
        <h2 className="px-2 text-xs font-medium text-app-muted">{t("nav.collections")}</h2>
        {roots.map((c) => {
          const enfants = childrenOf(c.id);
          const vueCourante =
            view.kind === "list" || view.kind === "collection" ? view.collectionId : null;
          const porteLaVue =
            vueCourante !== null &&
            (vueCourante === c.id || enfants.some((ch) => ch.id === vueCourante));
          return (
            <GroupeCollection key={c.id} parent={c} enfants={enfants} contientLaVue={porteLaVue} enDeplacement={enDeplacement !== null}>
              {(deplie, chevron) => (
                <>
                  {/* Le chevron vit DANS la ligne, devant le titre : c'est la
                      poignée du groupe, pas une commande de la barre. */}
                  <div className="flex items-center">
                    {chevron}
                    {/* Une collection QUI A des enfants ouvre la vue
                        composite ; une feuille ouvre la liste ordinaire. */}
                    <button
                      className={item + survolee(c.id)}
                      {...accueil(c.id)}
                      onClick={() =>
                        go(
                          enfants.length > 0
                            ? { kind: "collection", collectionId: c.id, label: c.title }
                            : { kind: "list", collectionId: c.id, label: c.title },
                        )
                      }
                    >
                      {c.title}<Compteur n={c.count} />
                    </button>
                  </div>
                  {deplie &&
                    enfants.map((ch) => (
                      // DESIGN.md §8 : retrait d'arbre de 14 px PAR NIVEAU, sur le
                      // padding de base de `item` (px-2 = 8 px) → 22 px au niveau 1
                      // (l'ancien pl-6, 24 px, ne suivait pas la lettre). Style
                      // inline : la valeur exacte compte, pas une classe approximative.
                      <button key={ch.id} className={item + survolee(ch.id)} {...accueil(ch.id)} style={{ paddingLeft: "22px" }} onClick={() => go({ kind: "list", collectionId: ch.id, label: ch.title })}>
                        {ch.title}<Compteur n={ch.count} />
                      </button>
                    ))}
                </>
              )}
            </GroupeCollection>
          );
        })}
      </section>

      <section>
        <h2 className="px-2 text-xs font-medium text-app-muted">{t("nav.tags")}</h2>
        {/* Nom dans son propre span : le # décoratif reste hors du texte du
            span (les requêtes RTL ne lisent que les nœuds texte directs).
            R11P-1 : la vue porte search `#tag` — listQuery lit view.search,
            pas le label ; sans lui, cliquer un tag montre « Tous » non
            filtré. */}
        {(tags.data ?? []).map((tg) => (
          <button key={tg.name} className={item} onClick={() => go({ kind: "list", collectionId: 0, label: `#${tg.name}`, search: `#${tg.name}` })}>
            #<span>{tg.name}</span><Compteur n={tg.count} />
          </button>
        ))}
      </section>
    </nav>
  );
}
