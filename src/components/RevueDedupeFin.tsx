import { t } from "../i18n/fr";
import type { ResultatDedupe } from "../hooks/useAnalysis";

/** Le terme d'un job dedupe portant un DÉFICIT : la Revue tient (R8P-1), le
 *  résumé nomme ce qui a marché et ce qui n'a pas marché. Un terme propre ne
 *  passe jamais ici — la Revue repart toute seule, comme elle l'a toujours
 *  fait. Extrait de ReviewPage (frontière naturelle : le pied de page du
 *  terme), dont le fichier touchait le plafond dur de 400 lignes. */
export function RevueDedupeFin({ r }: { r: ResultatDedupe }) {
  const raisons = (es: { raison: string }[]) =>
    es.slice(0, 3).map((e) => e.raison).join(" · ") + (es.length > 3 ? " …" : "");
  return (
    <footer className="flex flex-col gap-1 border-t border-app-border bg-app-panel px-4 py-3 text-sm">
      <p>{t("review.dedupe.termine", { n: r.corbeille, etiquettes: r.etiquettesAjoutees })}</p>
      {/* Un échec individuel est un diagnostic : seul rouge légitime (§6). */}
      {r.echecs.length > 0 && (
        <p role="alert" className="text-xs text-app-broken">
          {t("review.dedupe.echec", { n: r.echecs.length, raisons: raisons(r.echecs) })}
        </p>
      )}
      {/* Corbeillées QUAND MÊME : le geste a réussi, le déficit d'étiquettes
          est une information — ni un rouge, ni un silence. */}
      {r.nonFusionnees.length > 0 && (
        <p className="text-xs text-app-muted">
          {t("review.dedupe.nonFusionnees", { n: r.nonFusionnees.length, raisons: raisons(r.nonFusionnees) })}
        </p>
      )}
      {/* La seule issue est le « Retour » du haut, déverrouillé dès la fin —
          un seul point d'entrée par geste (§9). */}
    </footer>
  );
}
