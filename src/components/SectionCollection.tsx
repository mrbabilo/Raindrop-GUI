import { useEffect } from "react";
import { t } from "../i18n/fr";
import type { Collection, RaindropItem } from "../../shared/types";
import { useRaindrops } from "../hooks/useRaindrops";
import { CarreCollection } from "../design/Signaux";
import { RaindropRow } from "./RaindropRow";

// Une section de la vue collection parente : l'intertitre d'une
// sous-collection, puis ses premiers signets.
//
// DESIGN.md §8 : l'intertitre fait 28 px (leading-5 + py-1, comme une entrée
// de navigation), les lignes 36 px comme partout ailleurs.
//
// Ne charge QUE la première page. « Tout déplier » au sens plein ferait,
// sur une collection à dix enfants, onze requêtes espacées de 550 ms et
// plusieurs milliers de lignes hors virtualiseur : six secondes avant que la
// vue finisse de se peindre. Le compte exact est dans l'intertitre, et
// « Voir les N » mène à la collection entière.
export function SectionCollection({
  collection, poignee, selection, onToggle, onTag, onVoirTout, onCharges,
}: {
  collection: Collection;
  poignee(r: RaindropItem): { onPointerDown(e: { clientX: number; clientY: number; button?: number }): void; onClick(): void };
  selection: Set<number>;
  detailId: number | null;
  onToggle(id: number): void;
  onTag(name: string): void;
  onVoirTout(): void;
  /** Remonte les items chargés : la barre d'actions en masse les consomme.
   *  Porte l'id en argument plutôt que de le capturer : une closure par
   *  section serait neuve à chaque rendu du parent, et relancerait l'effet
   *  en boucle. */
  onCharges(collectionId: number, items: RaindropItem[]): void;
}) {
  const query = useRaindrops({ collectionId: collection.id });
  const items = query.data?.pages[0]?.items ?? [];
  const total = query.data?.pages[0]?.count ?? collection.count;
  // Dans un EFFET, jamais pendant le rendu : remonter au parent en plein
  // rendu le ferait se rendre à son tour, en boucle.
  //
  // La dépendance est une clé de VALEUR, pas une référence. `items` est un
  // tableau neuf à chaque passe, et `query.data` peut l'être aussi dès qu'une
  // couche transforme la réponse : dépendre de l'une ou de l'autre rouvre la
  // boucle que l'effet est censé fermer. Les identifiants, eux, ne changent
  // que si le contenu change.
  const cle = items.map((i) => i.id).join(",");
  useEffect(() => {
    onCharges(collection.id, items);
  }, [cle, collection.id, onCharges]);

  return (
    <section aria-label={collection.title}>
      {/* §8 : 28 px. §4 : le carré porte la teinte de la racine. §6 : la
          surface `work` le distingue des lignes, sans bordure — sur le même
          fond qu'elles, l'intertitre se lisait comme un signet de plus.
          Collant : en défilant une section de cinquante lignes, on perd
          sinon le nom de la collection qu'on est en train de lire. */}
      <h2 className="sticky top-0 z-10 flex items-center gap-2 bg-app-panel px-3 py-1 text-xs font-medium leading-5 text-app-muted">
        <CarreCollection collectionId={collection.id} titre={collection.title} />
        <span>{collection.title}</span>
        {total > 0 && <span className="font-normal">{total}</span>}
      </h2>
      {items.map((r) => (
        <RaindropRow
          key={r.id}
          r={r}
          selected={selection.has(r.id)}
          isDetail={false}
          collectionRacine={collection.title}
          navigable
          poignee={poignee(r)}
          onToggle={() => onToggle(r.id)}
          onTag={onTag}
        />
      ))}
      {/* §9 « masqué si nul » : rien de plus à voir, pas de commande. */}
      {total > items.length && (
        // `data-nav` : « Voir les N » est dans le flux des flèches, à sa
        // place — au bas de sa section. Laissé dehors, il gardait son propre
        // arrêt de tabulation, et huit sections en faisaient huit.
        <button type="button" data-nav className="w-full px-3 py-1 text-left text-xs text-app-muted hover:bg-app-hover" onClick={onVoirTout}>
          {t("collection.seeAll", { n: total })}
        </button>
      )}
      {query.isLoading && <p className="px-3 py-1 text-xs text-app-muted">{t("state.loading")}</p>}
      {query.isError && (
        <p role="alert" className="px-3 py-1 text-xs text-app-broken">
          {t("state.error", { message: query.error.message })}
        </p>
      )}
    </section>
  );
}
