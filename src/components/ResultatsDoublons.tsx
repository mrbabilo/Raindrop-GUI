//! La vue Doublons du Nettoyage.
//!
//! Extraites de `CleanupView` le 2026-09-20 : les corrections du lot (garde
//! réconciliée avec les données, corbeille globale) l'avaient poussée vers le
//! plafond de 400 lignes — cible 300. Frontière naturelle, même précédent
//! que `ResultatsLiens` : cette branche ne touche rien au reste du
//! Nettoyage, qui l'agence depuis `CleanupView`.

import { useState } from "react";
import { t } from "../i18n/fr";
import { EtatListe } from "./EtatListe";
import { useAppState } from "../state/appState";
import { useDuplicateGroups } from "../hooks/useAnalysis";
import { useCollections } from "../hooks/useStaticData";
import { racine } from "../lib/arbre";
import { pairesCertaines } from "../lib/doublons";
import { Icone } from "../design/icones";
import type { DuplicateGroup } from "../../shared/types";
import { DuplicateGroupCard } from "./CleanupRows";
import { Entete, LABELS } from "./EnteteCleanup";

// Les trois catégories restent séparées (DOMAINE.md — jamais fusionnées),
// chaque section étiquetée, les groupes en grappes.
const KINDS = ["exact", "normalized", "fuzzy"] as const;
const DUP_LABELS: Record<DuplicateGroup["kind"], string> = {
  exact: t("cleanup.dup-exact"),
  normalized: t("cleanup.dup-normalized"),
  fuzzy: t("cleanup.dup-fuzzy"),
};

// Un groupe de N signets ne rend RETIRABLES que N−1 d'entre eux : on en garde
// toujours un. C'est le seul nombre qui dit ce qu'on gagne à nettoyer, et il
// n'apparaissait nulle part.
const signetsDe = (gs: DuplicateGroup[]) => gs.reduce((n, g) => n + g.items.length, 0);
const retirablesDe = (gs: DuplicateGroup[]) => signetsDe(gs) - gs.length;

// `jamaisAnalyse` à `null` : statut non reçu — même contrat que ResultatsLiens.
export function Doublons({ jamaisAnalyse, analyser, analyseEnCours }: {
  jamaisAnalyse?: boolean | null;
  analyser?: () => void;
  analyseEnCours?: boolean;
}) {
  const q = useDuplicateGroups();
  const { go } = useAppState();
  const retourTableau = { label: t("cleanup.retour"), onClick: () => go({ kind: "cleanup" }) };
  // La sélection vit dans la VUE, indexée par groupe : la corbeille globale
  // rassemble plusieurs groupes en une seule Revue, et la garde se calcule
  // par groupe au moment du geste.
  const [coches, setCoches] = useState<Record<string, Set<number>>>({});
  // Les cochés survivent aux données : un refetch de scan (ou l'élagage
  // d'après-corbeille) change les items d'un groupe à clé inchangée PENDANT
  // que la vue est montée. On ne lit que l'intersection avec le groupe
  // VIVANT — sinon des cochés fantômes gonflent `cochees.size`, la carte
  // verrouille des cases libres, et le gardé disparu laisse un groupe
  // entièrement coché sans exemplaire à garder.
  // Index = catégorie + clé : la clé EXACTE (URL brute) et la clé NORMALISÉE
  // (normalizeUrl) coïncident pour une URL déjà normalisée — indexés par la
  // seule clé, les cochés d'un groupe se perdaient dans l'autre, et la
  // corbeille globale ne voyait que le premier (audit du 2026-09-23).
  const cleDe = (g: DuplicateGroup) => `${g.kind}:${g.key}`;
  const cocheesDe = (g: DuplicateGroup) => {
    const retenues = coches[cleDe(g)];
    if (!retenues) return new Set<number>();
    return new Set([...retenues].filter((id) => g.items.some((i) => i.id === id)));
  };
  const basculer = (g: DuplicateGroup, id: number) =>
    setCoches((c) => {
      const courantes = new Set(c[cleDe(g)] ?? []);
      if (courantes.has(id)) courantes.delete(id);
      else courantes.add(id);
      return { ...c, [cleDe(g)]: courantes };
    });
  const definir = (g: DuplicateGroup, ids: number[]) =>
    setCoches((c) => ({ ...c, [cleDe(g)]: new Set(ids) }));
  const surRevue = (copies: { id: number; url: string; title: string; collectionId: number; dedupeGarde: { id: number; title: string } }[]) => {
    go({
      kind: "review",
      items: copies,
      action: { op: "dedupe" },
      sourceLabel: LABELS.duplicates,
      returnView: { kind: "cleanupView", type: "duplicates" },
    });
  };
  const arbre = useCollections().data ?? [];
  const titreRacine = (id: number) => racine(arbre, id)?.title;
  const data = q.data;
  const groupes = data ? KINDS.flatMap((k) => data[k]) : [];
  // Le tri GLOBAL est borné aux catégories certaines (exact, normalisé) :
  // même domaine + même titre flou n'est pas une certitude — la pollution au
  // titre d'interstitiel (« Weiterleitungshinweis », 163 signets réels) vient
  // de le démontrer. Le flou, lui, se trie groupe par groupe.
  const paires = pairesCertaines(data ?? { exact: [], normalized: [], fuzzy: [] });
  const triables = paires.flatMap((p) => p.copies.map((c) => ({ ...c, dedupeGarde: { id: p.garde.id, title: p.garde.title } })));
  // La corbeille GLOBALE de la sélection : des copies cochées dans plusieurs
  // groupes partent en UNE Revue, chacune vers son gardé. La garde — un
  // exemplaire non coché par groupe — est structurelle : c'est elle qui
  // désigne le gardé au moment du geste.
  const selectionGlobale = Object.entries(coches).flatMap(([cle]) => {
    const g = groupes.find((x) => cleDe(x) === cle);
    if (!g) return [];
    const cochees = cocheesDe(g);
    if (cochees.size === 0) return [];
    // Pas de gardé = tout le groupe vivant est coché : rien ne part — on ne
    // désigne jamais un gardé à la place de l'utilisateur, et un `!` ici
    // serait un crash de rendu (écran blanc, aucun ErrorBoundary).
    const garde = g.items.find((i) => !cochees.has(i.id));
    if (!garde) return [];
    return g.items.filter((i) => cochees.has(i.id)).map((i) => ({ ...i, dedupeGarde: { id: garde.id, title: garde.title } }));
  });
  return (
    <>
      {/* Le chip compte les GROUPES ; le détail par catégorie dit les signets
          concernés et les copies retirables. « 414 » seul se lisait
          « 414 signets en double » — la mesure réelle donne 414 groupes pour
          1 032 signets, dont 618 retirables. */}
      <Entete
        label={LABELS.duplicates}
        retour={retourTableau}
        count={jamaisAnalyse === true || jamaisAnalyse === null ? undefined : groupes.length}
        action={
          <span className="flex items-center gap-2">
            {selectionGlobale.length > 0 && (
              <button type="button" className="btn" onClick={() => surRevue(selectionGlobale)}>
                <Icone nom="corbeille" className="inline align-[-2px] mr-1" />
                {t("cleanup.selectionCorbeille", { n: selectionGlobale.length })}
              </button>
            )}
            {triables.length > 0 && (
              <button type="button" className="btn" onClick={() => surRevue(triables)}>
                {t("cleanup.trierDoublons", { n: triables.length })}
              </button>
            )}
          </span>
        }
      />
      <EtatListe
        chargement={!!q.isLoading || (jamaisAnalyse === null && groupes.length === 0)}
        erreur={q.isError ? q.error?.message : null}
        vide={groupes.length === 0 && !q.isLoading}
        reessayer={() => void q.refetch()}
        jamaisAnalyse={jamaisAnalyse === true && groupes.length === 0}
        analyseEnCours={analyseEnCours === true}
        {...(analyser ? { analyser } : {})}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {KINDS.map((kind) => {
          const gs = data?.[kind] ?? [];
          if (gs.length === 0) return null;
          return (
            <section key={kind} aria-label={DUP_LABELS[kind]} className="flex flex-col gap-2">
              <h2 className="text-sm font-medium">
                {DUP_LABELS[kind]} ({gs.length})
                <span className="ml-2 text-xs font-normal text-app-muted">
                  {t("cleanup.dupDetail", { n: retirablesDe(gs), items: signetsDe(gs), retirables: retirablesDe(gs) })}
                </span>
              </h2>
              {gs.map((g) => (
                <DuplicateGroupCard
                  key={g.key}
                  g={g}
                  titreRacine={titreRacine}
                  cochees={cocheesDe(g)}
                  basculer={(id) => basculer(g, id)}
                  definir={(ids) => definir(g, ids)}
                  surRevue={surRevue}
                />
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}
