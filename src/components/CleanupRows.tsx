import { useState } from "react";
import { t } from "../i18n/fr";
import { Icone } from "../design/icones";
import { CarreCollection } from "../design/Signaux";
// Le patron « ligne activable » a quitté ce fichier le 2026-09-19 : la vue
// Tags en a eu besoin à son tour (LigneActivable.tsx).
import { ActionLigne, ErreurLigne, Ligne } from "./LigneActivable";
import { choisirGarde, copiesDe } from "../lib/doublons";
import { useUpdateRaindrop, useUnrestore } from "../hooks/useMutations";
import { useAppState } from "../state/appState";
import { useCollections } from "../hooks/useStaticData";
import type { Collection, DuplicateGroup, RaindropItem } from "../../shared/types";
import type { LinksResultsPage } from "../hooks/useAnalysis";

// Lignes des vues de traitement (Task 13) — découpées de CleanupView aux
// frontières naturelles (convention ≤ 300 lignes) : chaque type de ligne est
// une responsabilité, la vue ne fait que l'agencer.

// Item d'une page de résultats « links » : le LinkCheckResult du scan enrichi
// par le sidecar (titre + collection, sidecar/api/routes/analysis.ts enrich()).
export type LinkEnrichi = LinksResultsPage["items"][number];

// DESIGN.md §8 : ligne de liste 36 px, gap, filet d'état en bord de ligne
// (§5 — la forme distingue autant que la couleur). Mêmes classes que
// RaindropRow pour que les six vues respirent comme la liste principale.
//
// TOUTE ligne qui représente un signet OUVRIT sa fiche au clic — une ligne
// ressemble partout à la même chose, en rendre la moitié inerte fait douter
// de l'autre. Les contrôles internes (ActionLigne) stopPropagent : cocher,
// restaurer ou remplacer n'ouvre jamais en prime.
//
// Lien mort : filet --broken, raison brute du scan (dns, http_404…), et la
// piste de secours buku §12 — la Wayback Machine en simple <a> externe.
export function DeadRow({
  r,
  collectionRacine,
  selected,
  onToggle,
}: {
  r: LinkEnrichi;
  collectionRacine?: string;
  /** Sélection multiple — présente seulement quand la vue en propose une
   *  (l'archivage des copies, spec sélection §4.2). La case porte
   *  `tabIndex={-1}` : c'est la LIGNE qui est l'arrêt de tabulation, comme
   *  partout dans les vues de traitement. */
  selected?: boolean;
  onToggle?: () => void;
}) {
  const { selectRaindrop, selectedRaindropId } = useAppState();
  return (
    <Ligne
      etat="dead"
      sel={selectedRaindropId === r.raindropId}
      onClick={() => selectRaindrop(r.raindropId)}
    >
      {onToggle !== undefined && (
        <input
          type="checkbox"
          tabIndex={-1}
          className="shrink-0"
          aria-label={r.title}
          checked={selected ?? false}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggle}
        />
      )}
      <CarreCollection collectionId={r.collectionId} titre={collectionRacine} />
      <span className="min-w-[8rem] max-w-[40%] flex-1 truncate font-medium">{r.title}</span>
      <span className="url min-w-0 flex-1 truncate text-[11px] text-app-muted">{r.url}</span>
      {r.orphelin && <span className="shrink-0 text-xs text-app-muted">{t("cleanup.orphelin")}</span>}
      {r.reason && <span className="shrink-0 text-xs text-app-broken">{r.reason}</span>}
      <ActionLigne el="a" className="btn shrink-0" href={`https://web.archive.org/web/*/${r.url}`} target="_blank" rel="noreferrer">
        {t("cleanup.wayback")}
      </ActionLigne>
    </Ligne>
  );
}

// Redirection : les DEUX URLs pleine largeur, chacune sur SA ligne tronquée
// (le comparé caractère par caractère est le travail, §7) — en ligne, deux
// `shrink-0` poussaient le bouton hors du cadre dès qu'une adresse était
// longue : « invisible ou coupé » (constaté en réel le 2026-09-22). Le
// bouton vit HORS de la colonne tronquée : il ne peut plus en sortir.
// « Remplacer » n'existe que s'il y a UNE URL finale à mettre : un verdict
// transport reclassé (pas de finale) n'offrait un bouton dont le clic
// sortait en silence.
export function RedirectRow({ r, collectionRacine, onRemplace }: {
  r: LinkEnrichi;
  collectionRacine?: string;
  /** Remonte le succès à la VUE (ResultatsLiens) : l'état de remplacement ne
   *  peut pas vivre ici — la pagination démonte la ligne, et la ligne
   *  remplacée reviendrait de l'aller-retour de page. */
  onRemplace?: (id: number) => void;
}) {
  const update = useUpdateRaindrop(r.raindropId);
  const [remplace, setRemplace] = useState(false);
  const { selectRaindrop, selectedRaindropId } = useAppState();
  if (remplace) return null;
  const finale = r.finalUrl;
  return (
    <Ligne
      etat="redirect"
      sel={selectedRaindropId === r.raindropId}
      onClick={() => selectRaindrop(r.raindropId)}
    >
      <CarreCollection collectionId={r.collectionId} titre={collectionRacine} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
          {r.redirectKind !== null && (
            <span className="shrink-0 text-xs text-app-muted">
              {t(r.redirectKind === "temporary" ? "cleanup.redirect-temporary" : "cleanup.redirect-permanent")}
            </span>
          )}
          {r.orphelin && <span className="shrink-0 text-xs text-app-muted">{t("cleanup.orphelin")}</span>}
        </span>
        <span className="url min-w-0 truncate text-[11px] text-app-muted">{r.url}</span>
        {finale && (
          <span className="flex min-w-0 items-center gap-1">
            <span aria-hidden="true" className="shrink-0 text-app-muted">→</span>
            <span className="url min-w-0 truncate text-[11px]">{finale}</span>
          </span>
        )}
        {update.isError && <ErreurLigne message={String(update.error?.message ?? "")} />}
      </div>
      {/* Vraie redirection seulement (→ 2xx) : la finale d'un indéterminé
          est souvent un login ou un mur payant (401/403) — audit 09-23. */}
      {finale && r.status === "redirect" && (
        <ActionLigne
          className="btn shrink-0"
          disabled={update.isPending}
          onClick={() =>
            update.mutate({ url: finale }, {
              onSuccess: () => {
                setRemplace(true);
                onRemplace?.(r.raindropId);
              },
            })
          }
        >
          {t("cleanup.replace-url")}
        </ActionLigne>
      )}
    </Ligne>
  );
}

// Doublons : un groupe = une grappe posée sur surface panel (§9 — la
// hiérarchie vient du niveau de surface), ses items portent le double trait
// vertical de l'état doublon (§5). Le carré de chaque item reste résolu par
// SA collection (§4 — la couleur appartient à la racine de CHACUN). Le tri
// se joue à vue : chasse fixe (§7).
export function DuplicateGroupCard({ g, titreRacine, cochees, basculer, definir, surRevue }: {
  g: DuplicateGroup;
  titreRacine: (id: number) => string | undefined;
  /** Les cochés de CE groupe. L'état vit dans la VUE, pas dans la carte :
   *  « mettre TOUS les sélectionnés à la corbeille » doit pouvoir rassembler
   *  plusieurs groupes en une seule Revue. */
  cochees: Set<number>;
  basculer(id: number): void;
  definir(ids: number[]): void;
  surRevue: (copies: { id: number; url: string; title: string; collectionId: number; dedupeGarde: { id: number; title: string } }[]) => void;
}) {
  // LA GARDE : le dernier exemplaire non coché se verrouille — un groupe ne
  // perd jamais son dernier représentant.
  const dernierRestant = g.items.length - cochees.size === 1;
  const { selectRaindrop, selectedRaindropId } = useAppState();
  const garderMeilleur = () => {
    const garde = choisirGarde(g.items);
    definir(copiesDe(g.items, garde.id).map((c) => c.id));
  };
  const envoyer = () => {
    const dernier = g.items.find((i) => cochees.has(i.id) === false);
    // Défense : la vue intersecte les cochés avec le vivant (CleanupView
    // `cocheesDe`), donc ce cas ne survient plus par les données — s'il
    // survenait, on ne part PAS sans gardé désigné (un `!` ici serait un
    // crash de rendu, et il n'y a aucun ErrorBoundary).
    if (!dernier) return;
    surRevue(
      g.items
        .filter((i) => cochees.has(i.id))
        .map((i) => ({ id: i.id, url: i.url, title: i.title, collectionId: i.collectionId, dedupeGarde: { id: dernier.id, title: dernier.title } })),
    );
    definir([]);
  };
  return (
    <div className="rounded-[11px] bg-app-panel">
      {g.items.map((item) => {
        // Le dernier restant se verrouille ; un item DÉJÀ coché reste
        // décochable — la garde porte sur ce qui RESTERA, pas sur le geste.
        const verrouille = dernierRestant && !cochees.has(item.id);
        return (
          <Ligne
            key={item.id}
            etat="duplicate"
            sel={selectedRaindropId === item.id}
            onClick={() => selectRaindrop(item.id)}
          >
            <ActionLigne
              el="input"
              type="checkbox"
              aria-label={t("cleanup.dupCoche", { title: item.title })}
              checked={cochees.has(item.id)}
              disabled={verrouille}
              onChange={() => basculer(item.id)}
            />
            <CarreCollection collectionId={item.collectionId} titre={titreRacine(item.collectionId)} />
            <span className="min-w-[8rem] flex-1 truncate font-medium">{item.title}</span>
            <span className="url shrink-0 text-[11px] text-app-muted">{item.url}</span>
          </Ligne>
        );
      })}
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-app-muted">
        {/* La règle est dite en une ligne (§10) : qui reste, et pourquoi. */}
        <span>{t("cleanup.dupRegle", { titre: choisirGarde(g.items).title })}</span>
        <span className="ml-auto flex items-center gap-2">
          <ActionLigne type="button" className="btn" onClick={garderMeilleur}>
            {t("cleanup.dupMeilleur")}
          </ActionLigne>
          <ActionLigne
            type="button"
            className="btn"
            disabled={cochees.size === 0}
            onClick={envoyer}
          >
            {t("cleanup.dupCorbeille", { n: cochees.size })}
          </ActionLigne>
        </span>
      </div>
    </div>
  );
}

// Corbeille : l'item trashed porte collectionId -99 (carré gris — l'origine
// n'est pas dans la liste, la corbeille Raindrop ne la garde pas, spec §4.2).
// « Restaurer » appelle POST /unrestore sans destination : le sidecar rend
// chacun à son origine mémorisée ; un id sans origine revient dans `unknown`
// SANS être restauré — le front inspecte la réponse (§4.2, plan Task 8) et
// demande alors UNE DESTINATION (sélecteur) avant de rappeler ; l'item reste
// en liste tant que rien n'a abouti, rien n'est tu.
export function TrashRow({ r }: { r: RaindropItem }) {
  const unrestore = useUnrestore();
  const collections = useCollections().data ?? [];
  const { selectRaindrop, selectedRaindropId } = useAppState();
  const [dest, setDest] = useState("");
  const [origineInconnue, setOrigineInconnue] = useState(false);
  const restaurer = () =>
    unrestore.mutate(
      dest === "" ? { ids: [r.id] } : { ids: [r.id], toCollectionId: Number(dest) },
      {
        onSuccess: (res) => setOrigineInconnue((res.unknown ?? []).includes(r.id)),
      },
    );
  return (
    <Ligne etat={null} sel={selectedRaindropId === r.id} onClick={() => selectRaindrop(r.id)}>
      <CarreCollection collectionId={r.collectionId} />
      <span className="min-w-[8rem] flex-1 truncate font-medium">{r.title}</span>
      <span className="url shrink-0 text-[11px] text-app-muted">{r.url}</span>
      <ActionLigne className="btn shrink-0" disabled={unrestore.isPending} onClick={restaurer}>
        <Icone nom="restaurer" className="inline align-[-2px] mr-1" />
        {t("cleanup.restore")}
      </ActionLigne>
      {origineInconnue && (
        <>
          <span className="shrink-0 text-xs text-app-broken">{t("cleanup.unknown-origin")}</span>
          <ActionLigne el="select" aria-label={t("bulk.destination")} className="input w-32 shrink-0" value={dest} onChange={(e: { target: { value: string } }) => setDest(e.target.value)}>
            <option value="">{t("bulk.chooseCollection")}</option>
            {collections.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.title}
              </option>
            ))}
          </ActionLigne>
        </>
      )}
      {unrestore.isError && <ErreurLigne message={String(unrestore.error?.message ?? "")} />}
    </Ligne>
  );
}

// Collection vide : la suppression INDIVIDUELLE est IRRÉVERSIBLE (DOMAINE.md
// niveau 2 — « supprimer des collections ») : elle part en Revue, où la
// frappe SUPPRIMER la porte. Le DELETE direct au clic n'avait AUCUN garde.
// `ids` : la CHAÎNE entière, déjà ordonnée feuilles d'abord par l'appelant
// (chaineDe + triPourSuppression) — une collection « vide » peut être un
// parent, et son DELETE à lui seul emporterait ou déracinerait les enfants.
export function EmptyCollectionRow({ c, ids }: { c: Collection; ids: number[] }) {
  const { go } = useAppState();
  return (
    <Ligne etat={null}>
      <CarreCollection collectionId={c.id} titre={c.title} />
      <span className="min-w-[8rem] flex-1 truncate font-medium">{c.title}</span>
      <ActionLigne
        className="btn shrink-0"
        onClick={() =>
          go({
            kind: "review",
            items: [],
            action: { op: "delete-collections", ids },
            // Une collection n'a pas la forme raindrop des items de Revue —
            // le VRAI nombre est celui de la chaîne.
            totalServer: ids.length,
            sourceLabel: c.title,
            returnView: { kind: "cleanupView", type: "empty-collections" },
          })
        }
      >
        {t("cleanup.delete-collection")}
      </ActionLigne>
    </Ligne>
  );
}
