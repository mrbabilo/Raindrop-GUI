import { useState, type ReactNode } from "react";
import { t } from "../i18n/fr";
import { CarreCollection, filetEtat, type EtatLien } from "../design/Signaux";
import { useUpdateRaindrop, useUnrestore, useDeleteCollection } from "../hooks/useMutations";
import { useCollections } from "../hooks/useStaticData";
import type { Collection, DuplicateGroup, LinkCheckResult, RaindropItem } from "../../shared/types";
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
export function Ligne({ etat, children }: { etat: EtatLien | null; children: ReactNode }) {
  const filet = filetEtat(etat);
  return (
    <div className={"flex min-h-9 items-center gap-2 overflow-hidden border-b border-app-border px-3 " + (filet ? "filet " + filet : "")}>
      {children}
    </div>
  );
}

// Erreur d'action inline (pattern T8/R12P-1) : ce qui s'est passé, jamais
// silencieux — brouillon et ligne restent en place.
export function ErreurLigne({ message }: { message: string }) {
  return (
    <p role="alert" className="text-xs text-app-broken">
      {t("state.error", { message })}
    </p>
  );
}

// Lien mort : filet --broken, raison brute du scan (dns, http_404…), et la
// piste de secours buku §12 — la Wayback Machine en simple <a> externe.
export function DeadRow({ r, collectionRacine }: { r: LinkEnrichi; collectionRacine?: string }) {
  return (
    <Ligne etat="dead">
      <CarreCollection collectionId={r.collectionId} titre={collectionRacine} />
      <span className="min-w-[8rem] flex-1 truncate font-medium">{r.title}</span>
      <span className="url shrink-0 text-[11px] text-app-muted">{r.url}</span>
      {r.reason && <span className="shrink-0 text-xs text-app-broken">{r.reason}</span>}
      <a className="btn shrink-0" href={`https://web.archive.org/web/*/${r.url}`} target="_blank" rel="noreferrer">
        {t("cleanup.wayback")}
      </a>
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
      <button
        type="button"
        className="btn shrink-0"
        disabled={update.isPending}
        onClick={() => {
          if (r.finalUrl) update.mutate({ url: r.finalUrl }, { onSuccess: () => setRemplace(true) });
        }}
      >
        {t("cleanup.replace-url")}
      </button>
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
      <button type="button" className="btn shrink-0" disabled={unrestore.isPending} onClick={restaurer}>
        {t("cleanup.restore")}
      </button>
      {origineInconnue && (
        <>
          <span className="shrink-0 text-xs text-app-broken">{t("cleanup.unknown-origin")}</span>
          <select
            aria-label={t("bulk.destination")}
            className="input w-32 shrink-0"
            value={dest}
            onChange={(e) => setDest(e.target.value)}
          >
            <option value="">— {t("bulk.move")} —</option>
            {collections.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.title}
              </option>
            ))}
          </select>
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
      <button type="button" className="btn shrink-0" disabled={suppr.isPending} onClick={() => suppr.mutate(c.id)}>
        {t("cleanup.delete-collection")}
      </button>
      {suppr.isError && <ErreurLigne message={String(suppr.error?.message ?? "")} />}
    </Ligne>
  );
}
