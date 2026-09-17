import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { t } from "../i18n/fr";
import type { View } from "../state/appState";
import { useRaindrops } from "../hooks/useRaindrops";
import { useCollections } from "../hooks/useStaticData";
import { racine } from "../design/Signaux";
import { listQueryArgs } from "../hooks/listQuery";
import { useAppState } from "../state/appState";
import { useDragBookmark } from "../hooks/useDragBookmark";
import { useIndexClavier } from "../hooks/useIndexClavier";
import { useRovingFocus } from "../hooks/useRovingFocus";
import { EtatListe } from "./EtatListe";
import { RaindropRow } from "./RaindropRow";
import { MosaicTile } from "./MosaicTile";
import { BulkBar } from "./BulkBar";
import { Composer } from "./Composer";

type ListView = Extract<View, { kind: "list" }>;

export function ListPane() {
  const { view, patchList, selectedIds, toggleSelect, selectedRaindropId, selectRaindrop } = useAppState();
  // Hors vue list (Nettoyage, Tags…), la zone centrale retombe sur « Tous ».
  const q: ListView = view.kind === "list" ? view : { kind: "list", collectionId: 0, label: "" };
  // listQueryArgs (partagé avec NatureChips, R6bP-1) : la nature filtre
  // désormais réellement la liste, plus seulement l'état de la puce active.
  const query = useRaindrops(listQueryArgs(view));
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  // DESIGN.md §4 : la couleur appartient à la RACINE, les descendantes en
  // héritent. L'arbre n'est connu que d'ici — la ligne et la tuile reçoivent
  // le titre déjà résolu plutôt qu'un hook de plus dans chaque ligne
  // virtualisée. Arbre pas encore chargé : titre absent → carré gris.
  const arbre = useCollections().data ?? [];
  const titreRacine = (collectionId: number) => racine(arbre, collectionId)?.title;
  // Déplacement d'un signet vers une collection : la ligne porte la poignée,
  // la Sidebar les cibles (useDragBookmark). L'échec s'affiche sous la liste
  // plutôt que de disparaître (R8P-1).
  const drag = useDragBookmark();
  const parentRef = useRef<HTMLDivElement>(null);
  // estimateSize suit la densité §8 (36 px) : measureElement (R7P) corrige
  // ensuite chaque hauteur réelle, mais un estimate faux ferait sauter la
  // barre de défilement sur 12 000 lignes dès le premier scroll.
  const virtual = useVirtualizer({ count: items.length, getScrollElement: () => parentRef.current, estimateSize: () => 36, overscan: 10 });
  const ioRef = useRef<IntersectionObserver | null>(null);

  // Navigation clavier : la liste ne prend qu'UN arrêt de tabulation, et les
  // flèches y circulent — 12 000 lignes en feraient 12 000. La mécanique est
  // partagée avec la Revue (useIndexClavier) : toutes deux sont virtualisées,
  // et c'est le démontage des lignes qui fait la difficulté.
  const clavier = useIndexClavier({
    nombre: items.length,
    zone: parentRef,
    defilerVers: (i) => virtual.scrollToIndex(i),
    surEntree: (i) => {
      const r = items[i];
      if (r !== undefined) selectRaindrop(r.id);
    },
    // La case à cocher d'une ligne n'est plus un arrêt de tabulation : la
    // barre d'espace la remplace depuis la ligne active.
    surEspace: (i) => {
      const r = items[i];
      if (r === undefined) return;
      toggleSelect(r.id);
      // « Après une action, le focus passe à la ligne suivante » : cocher
      // une série se fait alors d'une seule main, sans alterner espace et
      // flèche.
      clavier.avancer();
    },
  });

  // La mosaïque n'est pas virtualisée et se lit en GRILLE : ↑↓ y sautent une
  // rangée, ←→ une case. Les colonnes se comptent sur la mise en page réelle
  // — `auto-fill` en pose autant que la largeur le permet.
  const mosaique = useRovingFocus(parentRef, {
    colonnes: () => {
      const tuiles = parentRef.current?.querySelectorAll<HTMLElement>("[data-nav]");
      if (tuiles === undefined || tuiles.length === 0) return 1;
      const premiere = tuiles[0]!.offsetTop;
      let n = 0;
      for (const t of tuiles) {
        if (t.offsetTop !== premiere) break;
        n++;
      }
      return n;
    },
    surEchap: () => (document.activeElement as HTMLElement | null)?.blur(),
  });

  // À vide aussi le composer reste monté : c'est LUI qui crée le premier
  // bookmark de la collection — l'état vide seul le priverait de raison d'être.
  //
  // L'échec compte ici comme un vide : sans lui, une requête en erreur
  // tombait dans cette branche et annonçait « Rien ici » — « cette collection
  // ne contient rien », quand la vérité était « je n'ai pas pu regarder ».
  if (items.length === 0 && (!query.isFetching || query.isError))
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Composer />
        <main className="grid min-h-0 flex-1 place-items-center">
          <EtatListe
            chargement={false}
            erreur={query.isError ? query.error?.message : null}
            vide
            reessayer={() => void query.refetch()}
          />
        </main>
      </div>
    );

  return (
    // Colonne : le composer (Task 10) en tête, la liste défile, le pied
    // (BulkBar, Task 9) reste posé sous elle — hors du scroll, pour ne pas
    // fausser la mesure du virtualizer.
    <div className="flex h-full min-h-0 flex-col">
      <Composer />
      <main
        ref={parentRef}
        onKeyDown={q.viewMode === "mosaic" ? mosaique.surTouche : clavier.surTouche}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {q.viewMode === "mosaic" ? (
          // §8 : la tuile fait 221 px de large — une largeur exacte, pas un
          // minmax élastique qui la ferait varier d'un écran à l'autre.
          <div className="grid grid-cols-[repeat(auto-fill,221px)] gap-3 p-3">
            {items.map((r) => <MosaicTile key={r.id} r={r} collectionRacine={titreRacine(r.collectionId)} onOpen={() => selectRaindrop(r.id)} />)}
          </div>
        ) : (
          <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
            {virtual.getVirtualItems().map((v) => {
              const r = items[v.index]!;
              return (
                // measureElement (R7P) : la hauteur reste MESURÉE, pas
                // décrétée — la ligne vise 36 px (§8) sans hauteur fixe, et
                // ce qu'ajoutera l'analyse (Task 13) sera mesuré de même ;
                // data-index est requis par virtual-core pour rattacher la
                // mesure à l'index.
                // tabIndex sur l'enveloppe et non sur la ligne : c'est elle
                // que le virtualiseur monte et démonte, et elle occupe
                // exactement la même surface. Un seul arrêt : celui de la
                // ligne active, ou la première si le clavier n'est pas
                // encore entré.
                <div
                  key={r.id}
                  {...clavier.ligne(v.index)}
                  ref={virtual.measureElement}
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${v.start}px)` }}
                >
                  <RaindropRow r={r} selected={selectedIds.has(r.id)} isDetail={selectedRaindropId === r.id}
                    collectionRacine={titreRacine(r.collectionId)}
                    poignee={drag.poignee(r.id, () => selectRaindrop(r.id), r.title)}
                    onToggle={() => toggleSelect(r.id)} onTag={(name) => patchList({ search: `#${name}` })} />
                </div>
              );
            })}
          </div>
        )}
        {query.hasNextPage && (
          // Infinite scroll : le callback ref tourne à chaque rendu — on
          // débranche l'observeur précédent avant d'en créer un (sinon N
          // rendus = N observateurs = N× fetchNextPage au même event).
          <div ref={(el) => {
            ioRef.current?.disconnect();
            if (!el) return;
            const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && query.fetchNextPage()));
            io.observe(el);
            ioRef.current = io;
          }} className="p-4 text-center text-app-muted">{query.isFetchingNextPage ? t("list.loadingMore") : ""}</div>
        )}
      </main>
      {/* R8P-1 : un déplacement raté se dit, il ne disparaît pas en silence. */}
      {drag.erreur !== null && (
        <p role="alert" className="border-t border-app-border px-3 py-2 text-xs text-app-broken">
          {t("state.error", { message: drag.erreur })}
        </p>
      )}
      {/* Invisible sans sélection (rend null) : aucune layout shift au repos. */}
      <BulkBar items={items} />
    </div>
  );
}
