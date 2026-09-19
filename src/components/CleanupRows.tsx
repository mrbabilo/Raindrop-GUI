import { useState } from "react";
import { t } from "../i18n/fr";
import { CarreCollection } from "../design/Signaux";
// Le patron « ligne activable » a quitté ce fichier le 2026-09-19 : la vue
// Tags en a eu besoin à son tour (LigneActivable.tsx).
import { ActionLigne, ErreurLigne, Ligne } from "./LigneActivable";
import { useUpdateRaindrop, useUnrestore, useDeleteCollection } from "../hooks/useMutations";
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
  return (
    <Ligne etat="dead">
      {onToggle !== undefined && (
        <input
          type="checkbox"
          tabIndex={-1}
          className="shrink-0"
          aria-label={r.title}
          checked={selected ?? false}
          onChange={onToggle}
        />
      )}
      <CarreCollection collectionId={r.collectionId} titre={collectionRacine} />
      <span className="min-w-[8rem] flex-1 truncate font-medium">{r.title}</span>
      <span className="url shrink-0 text-[11px] text-app-muted">{r.url}</span>
      {r.reason && <span className="shrink-0 text-xs text-app-broken">{r.reason}</span>}
      <ActionLigne el="a" className="btn shrink-0" href={`https://web.archive.org/web/*/${r.url}`} target="_blank" rel="noreferrer">
        {t("cleanup.wayback")}
      </ActionLigne>
    </Ligne>
  );
}

// Redirection : ancienne et nouvelle URL côte à côte en chasse fixe (§7 —
// les comparer caractère par caractère est le travail). « Remplacer par
// l'URL finale » PATCH {url} seul (le sidecar refuse url + autres champs et
// le route en REST direct — trap `update_raindrop` v1.3.1) ; la ligne
// remplacée quitte la vue, le scan la rattrapera.
export function RedirectRow({ r, collectionRacine }: { r: LinkEnrichi; collectionRacine?: string }) {
  const update = useUpdateRaindrop(r.raindropId);
  const [remplace, setRemplace] = useState(false);
  if (remplace) return null;
  return (
    <Ligne etat="redirect">
      <CarreCollection collectionId={r.collectionId} titre={collectionRacine} />
      <span className="min-w-[6rem] flex-1 truncate font-medium">{r.title}</span>
      <span className="url shrink-0 text-[11px] text-app-muted">{r.url}</span>
      <span aria-hidden="true" className="shrink-0 text-app-muted">→</span>
      <span className="url shrink-0 text-[11px]">{r.finalUrl}</span>
      <span className="shrink-0 text-xs text-app-muted">
        {t(r.redirectKind === "temporary" ? "cleanup.redirect-temporary" : "cleanup.redirect-permanent")}
      </span>
      <ActionLigne
        disabled={update.isPending}
        onClick={() => {
          if (r.finalUrl) update.mutate({ url: r.finalUrl }, { onSuccess: () => setRemplace(true) });
        }}
      >
        {t("cleanup.replace-url")}
      </ActionLigne>
      {update.isError && <ErreurLigne message={String(update.error?.message ?? "")} />}
    </Ligne>
  );
}

// Doublons : un groupe = une grappe posée sur surface panel (§9 — la
// hiérarchie vient du niveau de surface), ses items portent le double trait
// vertical de l'état doublon (§5). Le carré de chaque item reste résolu par
// SA collection (§4 — la couleur appartient à la racine de CHACUN). Le tri
// se joue à vue : chasse fixe (§7).
export function DuplicateGroupCard({ g, titreRacine }: { g: DuplicateGroup; titreRacine: (id: number) => string | undefined }) {
  return (
    <div className="rounded-[11px] bg-app-panel">
      {g.items.map((item) => (
        <Ligne key={item.id} etat="duplicate">
          <CarreCollection collectionId={item.collectionId} titre={titreRacine(item.collectionId)} />
          <span className="min-w-[8rem] flex-1 truncate font-medium">{item.title}</span>
          <span className="url shrink-0 text-[11px] text-app-muted">{item.url}</span>
        </Ligne>
      ))}
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
    <Ligne etat={null}>
      <CarreCollection collectionId={r.collectionId} />
      <span className="min-w-[8rem] flex-1 truncate font-medium">{r.title}</span>
      <span className="url shrink-0 text-[11px] text-app-muted">{r.url}</span>
      <ActionLigne disabled={unrestore.isPending} onClick={restaurer}>
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

// Collection vide : suppression individuelle (DELETE /api/collections/:id) —
// la suppression en masse est l'action niveau 2 de la Revue (T15).
export function EmptyCollectionRow({ c }: { c: Collection }) {
  const suppr = useDeleteCollection();
  return (
    <Ligne etat={null}>
      <CarreCollection collectionId={c.id} titre={c.title} />
      <span className="min-w-[8rem] flex-1 truncate font-medium">{c.title}</span>
      <ActionLigne disabled={suppr.isPending} onClick={() => suppr.mutate(c.id)}>
        {t("cleanup.delete-collection")}
      </ActionLigne>
      {suppr.isError && <ErreurLigne message={String(suppr.error?.message ?? "")} />}
    </Ligne>
  );
}
