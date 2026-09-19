import { useEffect, useRef, useState } from "react";
import { t } from "../i18n/fr";
import { estimerSecondes, formaterDuree, FENETRE_MS, type Echantillon } from "../lib/eta";

/**
 * La barre d'un job, et le temps qu'il reste.
 *
 * **Une barre PAR SEGMENT, jamais une barre globale.** La spec de sélection §3
 * avait écarté la barre pour trois faits mesurés : des segments sans total
 * qui la feraient geler, un rejeu de balayage qui ramène le numérateur à zéro,
 * et l'incrémental qui pose `done === total` avant la fusion. Ces faits tiennent
 * toujours — une barre globale mentirait encore. Ce qui change, c'est qu'elle
 * ne prétend plus mesurer LE JOB : elle mesure l'étape en cours, que la phrase
 * au-dessus d'elle nomme. Repartir à zéro en changeant d'étape n'est alors plus
 * un mensonge, c'est l'information.
 *
 * `cle` identifie l'étape (son libellé). Elle change → tout repart : la barre
 * comme les échantillons de débit. Sans cela, l'estimation d'une étape
 * contaminerait la suivante, qui n'a ni le même travail ni le même rythme.
 *
 * Total inconnu ou nul : AUCUNE barre. Une barre sans dénominateur est soit
 * figée, soit inventée.
 */
export function BarreProgression({ done, total, cle }: { done: number; total: number; cle?: string | null }) {
  const echantillons = useRef<Echantillon[]>([]);
  const cleVue = useRef<string | null | undefined>(cle);
  const [eta, setEta] = useState<number | null>(null);

  useEffect(() => {
    const maintenant = Date.now();
    // Changement d'étape, ou numérateur qui RECULE (le rejeu du balayage) :
    // le débit d'avant ne dit plus rien de ce qui vient.
    const dernier = echantillons.current[echantillons.current.length - 1];
    if (cleVue.current !== cle || (dernier !== undefined && done < dernier.done)) {
      cleVue.current = cle;
      echantillons.current = [];
    }
    if (dernier === undefined || done !== dernier.done) {
      echantillons.current.push({ t: maintenant, done });
    }
    // Fenêtre glissante : un job qui accélère ou ralentit doit se voir.
    echantillons.current = echantillons.current.filter((e) => maintenant - e.t <= FENETRE_MS);
    setEta(estimerSecondes(echantillons.current, total));
  }, [done, total, cle]);

  if (total <= 0) return null;
  const part = Math.min(100, Math.max(0, (done / total) * 100));
  return (
    <div className="flex items-center gap-2">
      {/* `progressbar` plutôt qu'un `<progress>` natif : sa barre interne ne
          se style pas de façon portable, et la géométrie est celle du système
          (DESIGN.md §7). Les attributs ARIA portent le même contrat. */}
      <div
        role="progressbar"
        aria-valuenow={Math.round(part)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("progress.label")}
        className="h-1 flex-1 overflow-hidden rounded-full bg-app-sel"
      >
        <div className="h-full rounded-full bg-app-muted transition-[width] duration-300" style={{ width: `${part}%` }} />
      </div>
      {/* Le temps restant n'apparaît QUE lorsqu'il vaut quelque chose : une
          estimation calculée sur deux points collés sauterait de plusieurs
          minutes à chaque rendu, et se lirait pourtant comme une promesse. */}
      {eta !== null && (
        <span className="shrink-0 text-xs tabular-nums text-app-muted">
          {t("eta.restant", { n: Math.round(eta / 60) || 1, duree: formaterDuree(eta) })}
        </span>
      )}
    </div>
  );
}
