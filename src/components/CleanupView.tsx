import { useRef, useState } from "react";
import { t } from "../i18n/fr";
import { EtatListe } from "./EtatListe";
import { useRovingFocus } from "../hooks/useRovingFocus";
import { ChargePlus } from "./ChargePlus";
import { useAppState } from "../state/appState";
import { useAnalysisStatus, useStartScan } from "../hooks/useAnalysis";
import { useRaindrops } from "../hooks/useRaindrops";
import { useCollections } from "../hooks/useStaticData";
import { collectionsVides, triPourSuppression, chaineDe } from "../lib/arbre";
import { Icone } from "../design/icones";
import { EmptyCollectionRow, TrashRow } from "./CleanupRows";
import { ActionLigne, Ligne } from "./LigneActivable";
import { Entete, LABELS, type CleanupType } from "./EnteteCleanup";
import { ResultatsLiens } from "./ResultatsLiens";
import { Doublons } from "./ResultatsDoublons";

// Task 13 — les vues de traitement joignables depuis le dashboard (T12) :
// un composant à branch par `type`. Les jetons et classes viennent de
// styles.css ; DESIGN.md §8-§10 fait foi. Les branches lourdes vivent chez
// elles (`ResultatsLiens`, `ResultatsDoublons` — même frontière que le
// plafond de 400 a imposée au 2026-09-20) ; ici ne restent que les trois
// listes raindrops et l'agencement.

// Non-taggés : liste raindrops standard (notag=true), au PATRON « ligne
// activable » comme toutes les vues — un arrêt de tabulation par CASE de
// cette liste en faisait des centaines, et la fiche était inatteignable au
// clavier. Le clic de la LIGNE ouvre la fiche (où l'étiquette se corrige) ;
// au clavier, le titre en est le bouton.
function NonTaggues() {
  const { selectedRaindropId, selectRaindrop, selectedIds, toggleSelect, go } = useAppState();
  const retourTableau = { label: t("cleanup.retour"), onClick: () => go({ kind: "cleanup" }) };
  const [etiquettes, setEtiquettes] = useState("");
  const q = useRaindrops({ collectionId: 0, notag: true });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const selectionnes = items.filter((r) => selectedIds.has(r.id));
  // Le garde porte la liste PARSÉE, calculée UNE fois et lue par le bouton
  // ET le handler (même règle que le BulkBar) : « , , » est truthy mais
  // parse vide — le bulk update qui en résulterait effacerait toutes les
  // étiquettes des items sélectionnés.
  const etiquettesParses = etiquettes.split(",").map((s) => s.trim()).filter(Boolean);
  const versRevue = () =>
    selectionnes.map((i) => ({ id: i.id, url: i.url, title: i.title, collectionId: i.collectionId }));
  const etiqueter = () => {
    if (etiquettesParses.length === 0 || selectionnes.length === 0) return;
    go({
      kind: "review",
      items: versRevue(),
      action: { op: "tag", tags: etiquettesParses },
      sourceLabel: LABELS.untagged,
      returnView: { kind: "cleanupView", type: "untagged" },
    });
  };
  return (
    <>
      <Entete
        label={LABELS.untagged}
        retour={retourTableau}
        count={q.data?.pages[0]?.count}
        action={
          <span className="flex items-center gap-2">
            <input
              aria-label={t("bulk.tagField")}
              className="input w-40"
              placeholder={t("bulk.tagPlaceholder")}
              value={etiquettes}
              onChange={(e) => setEtiquettes(e.target.value)}
            />
            <button
              type="button"
              className="btn"
              disabled={selectionnes.length === 0}
              onClick={() =>
                go({
                  kind: "review",
                  items: versRevue(),
                  action: { op: "trash" },
                  sourceLabel: LABELS.untagged,
                  returnView: { kind: "cleanupView", type: "untagged" },
                })
              }
            >
              <Icone nom="corbeille" className="inline align-[-2px] mr-1" />
              {t("cleanup.corbeille", { n: selectionnes.length })}
            </button>
            <button
              type="button"
              className="btn"
              disabled={selectionnes.length === 0 || etiquettesParses.length === 0}
              onClick={etiqueter}
            >
              {t("cleanup.etiqueter", { n: selectionnes.length })}
            </button>
          </span>
        }
      />
      <EtatListe
        chargement={!!q.isLoading}
        erreur={q.isError ? q.error?.message : null}
        vide={items.length === 0 && !q.isLoading}
        reessayer={() => void q.refetch()}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.map((r) => (
          <Ligne
            key={r.id}
            etat={null}
            onClick={() => selectRaindrop(r.id)}
            className={
              "flex min-h-9 items-center gap-2 overflow-hidden border-b border-app-border px-3 " +
              (selectedRaindropId === r.id ? "bg-app-sel" : "hover:bg-app-hover")
            }
          >
            {/* C'est la LIGNE qui ouvre la fiche ; la case, elle, sélectionne
                pour l'étiquetage en masse — stopPropagation, sinon cocher
                ouvrirait la fiche au passage. */}
            <ActionLigne
              el="input"
              type="checkbox"
              aria-label={t("list.select", { title: r.title })}
              checked={selectedIds.has(r.id)}
              onClick={(e) => e.stopPropagation()}
              onChange={() => toggleSelect(r.id)}
            />
            {/* Au clavier, le titre est le bouton qui ouvre la fiche — le
                bubble vers la ligne rejoue selectRaindrop, même id, sans
                effet de plus. */}
            <ActionLigne
              type="button"
              className="min-w-[8rem] flex-1 truncate text-left font-medium"
              onClick={() => selectRaindrop(r.id)}
            >
              {r.title}
            </ActionLigne>
            <span className="url shrink-0 text-[11px] text-app-muted">{r.domain}</span>
          </Ligne>
        ))}
        <ChargePlus q={q} />
      </div>
    </>
  );
}

// Corbeille : « Vider la corbeille » est une action de niveau 2 — elle part
// en Revue (Task 15 exécutera), avec les items chargés comme aperçu gratuit.
function Corbeille() {
  const { go } = useAppState();
  const retourTableau = { label: t("cleanup.retour"), onClick: () => go({ kind: "cleanup" }) };
  const q = useRaindrops({ collectionId: -99 });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <Entete
        label={LABELS.trash}
        retour={retourTableau}
        count={q.data?.pages[0]?.count}
        action={
          <button
            type="button"
            className="btn"
            disabled={items.length === 0}
            onClick={() =>
              go({
                kind: "review",
                items: items.map((i) => ({ id: i.id, url: i.url, title: i.title, collectionId: i.collectionId })),
                action: { op: "empty-trash" },
                // Revue finale : le compteur de la Revue porte le total
                // SERVEUR — le vidage dépasse les pages chargées en aperçu.
                totalServer: q.data?.pages[0]?.count,
                sourceLabel: t("cleanup.trash"),
                returnView: { kind: "cleanupView", type: "trash" }, // R15P-3
              })
            }
          >
            {t("cleanup.empty-trash")}
          </button>
        }
      />
      <EtatListe
        chargement={!!q.isLoading}
        erreur={q.isError ? q.error?.message : null}
        vide={items.length === 0 && !q.isLoading}
        reessayer={() => void q.refetch()}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.map((r) => (
          <TrashRow key={r.id} r={r} />
        ))}
        <ChargePlus q={q} />
      </div>
    </>
  );
}

// Collections vides : suppression individuelle en ligne ; « Supprimer les
// collections vides » (niveau 2) part en Revue SANS items — une collection
// n'a pas la forme raindrop des items de Revue, l'action porte le sens et
// SES IDS, déjà ordonnés des feuilles vers la racine (triPourSuppression).
// JAMAIS le cleanup GLOBAL de Raindrop : sa définition du « vide » est la
// sienne, l'annonce ne coinciderait pas avec ce qui partirait.
function CollectionsVides() {
  const { go } = useAppState();
  const retourTableau = { label: t("cleanup.retour"), onClick: () => go({ kind: "cleanup" }) };
  const cols = useCollections();
  // Le helper partagé rend toute chaîne SANS AUCUN signet (verdict
  // récursif) — même définition que le compteur du tableau de bord, sinon
  // deux chiffres pour une action.
  const toutes = cols.data ?? [];
  const vides = collectionsVides(toutes);
  const idsOrdonnes = triPourSuppression(toutes, vides.map((c) => c.id));
  return (
    <>
      <Entete
        label={LABELS["empty-collections"]}
        retour={retourTableau}
        count={vides.length}
        action={
          <button
            type="button"
            className="btn"
            disabled={vides.length === 0}
            onClick={() =>
              go({
                kind: "review",
                items: [],
                action: { op: "delete-empty-collections", ids: idsOrdonnes },
                // Revue finale : les items de Revue sont vides (une collection
                // n'a pas leur forme) — le VRAI nombre est vides.length.
                totalServer: vides.length,
                sourceLabel: t("cleanup.empty-collections"),
                returnView: { kind: "cleanupView", type: "empty-collections" }, // R15P-3
              })
            }
          >
            {t("cleanup.delete-empty")}
          </button>
        }
      />
      <EtatListe
        chargement={!!cols.isLoading}
        erreur={cols.isError ? cols.error?.message : null}
        vide={vides.length === 0 && !cols.isLoading}
        reessayer={() => void cols.refetch()}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {vides.map((c) => (
          <EmptyCollectionRow
            key={c.id}
            c={c}
            // La chaîne ENTIÈRE (une « vide » peut être un parent), déjà
            // ordonnée des feuilles vers la racine — la Revue l'exécute tels
            // quels, séquentiellement.
            ids={triPourSuppression(toutes, chaineDe(toutes, c.id))}
          />
        ))}
      </div>
    </>
  );
}

export function CleanupView({ type }: { type: CleanupType }) {
  // « Jamais analysé » ≠ « rien à nettoyer ». La vue le sait par le statut, et
  // porte l'action qui corrige le manque — arriver ici depuis un compteur
  // vide sans pouvoir lancer l'analyse obligerait à repartir en arrière.
  const statut = useAnalysisStatus();
  const jamais = (quoi: "links" | "duplicates") =>
    statut.data !== undefined && statut.data[quoi].lastScan === null;
  const lienScan = useStartScan("links");
  const dupScan = useStartScan("duplicates");
  const lancerLiens = () => lienScan.mutate(undefined);
  const lancerDoublons = () => dupScan.mutate(undefined);
  // Lot a11y : la vue n'est qu'UN arrêt de tabulation. Les lignes portent
  // `data-nav` (CleanupRows.Ligne) ; Enter/F2 y entrent — leurs contrôles ne
  // sont tabulables qu'ensuite (pattern « ligne activée »). Le maillage ARIA
  // grid est réduit à grid/row : le contrat est le clavier, pas une grille
  // exhaustive — les en-têtes de vue vivent dans la section, hors rows.
  const zone = useRef<HTMLElement>(null);
  const roving = useRovingFocus(zone, {
    surEchap: () => (document.activeElement as HTMLElement | null)?.blur(),
  });
  return (
    <section
      ref={zone}
      role="grid"
      aria-label={LABELS[type]}
      onKeyDown={roving.surTouche}
      className="flex h-full min-h-0 flex-col"
    >
      {type === "dead" && <ResultatsLiens type="dead" jamaisAnalyse={jamais("links")} analyser={lancerLiens} />}
      {type === "redirect" && <ResultatsLiens type="redirect" jamaisAnalyse={jamais("links")} analyser={lancerLiens} />}
      {type === "indeterminate" && (
        <ResultatsLiens type="indeterminate" jamaisAnalyse={jamais("links")} analyser={lancerLiens} />
      )}
      {type === "duplicates" && <Doublons jamaisAnalyse={jamais("duplicates")} analyser={lancerDoublons} />}
      {type === "untagged" && <NonTaggues />}
      {type === "empty-collections" && <CollectionsVides />}
      {type === "trash" && <Corbeille />}
    </section>
  );
}
