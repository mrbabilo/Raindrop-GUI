import { useEffect, useRef, useState } from "react";
import { t } from "../i18n/fr";
import { Icone } from "../design/icones";
import { api } from "../lib/api";
import {
  dureeEstimee,
  formatterOctets,
  useJobsEnVol,
  type ResultatArchivage,
} from "../hooks/useBackup";
import { annuler, suivreJob } from "../lib/suiviSauvegarde";

/** La borne du sidecar (`POST /api/backup/archive`). Tenue ICI comme un refus
 *  explicite : découper en lots derrière le dos de l'utilisateur
 *  réintroduirait le « tout archiver » que la spec écarte (§0.3). */
export const BORNE_ARCHIVE = 500;

export interface ItemArchivable {
  id: number;
  cache?: { status: string; size?: number } | null;
}

export interface PorteeArchive {
  /** Ce qui partira réellement au sidecar. */
  ids: number[];
  /** Déjà archivés : écartés du job, et COMPTÉS — leur archive existe déjà. */
  deja: number;
  /** Sans copie permanente : rien à archiver, et comptés — une action qui
   *  « réussit » sur des signets sans copie serait un mensonge. */
  sansCopie: number;
  /** Somme des tailles connues, en octets. */
  volume: number;
  /** Au moins un item dont la vue d'origine ignore l'état de la copie (les
   *  liens morts viennent de l'analyse, qui ne porte pas `cache`). */
  copiesInconnues: boolean;
}

/**
 * Ce que l'archivage va vraiment faire, à partir de la sélection et de ce qui
 * est déjà archivé. Pure : c'est le cœur testable de la branche.
 *
 * Un item dont on IGNORE l'état de la copie part quand même — le sidecar
 * tranchera et comptera son échec individuellement ; l'exclure d'office
 * empêcherait d'archiver depuis les liens morts, qui est le cas où l'archive
 * vaut le plus.
 */
export function porteeArchive(items: ItemArchivable[], archives: Set<number>): PorteeArchive {
  const restants = items.filter((i) => !archives.has(i.id));
  const candidats = restants.filter((i) => i.cache === undefined || i.cache?.status === "ready");
  return {
    ids: candidats.map((i) => i.id),
    deja: items.length - restants.length,
    sansCopie: restants.length - candidats.length,
    volume: candidats.reduce((n, i) => n + (i.cache?.size ?? 0), 0),
    copiesInconnues: items.some((i) => i.cache === undefined),
  };
}

/** Ce que l'action fera, annoncé AVANT de la lancer : un archivage peut
 *  écrire des gigaoctets et tenir des dizaines de minutes. */
export function AnnonceArchive({ portee }: { portee: PorteeArchive }) {
  const trop = portee.ids.length > BORNE_ARCHIVE;
  return (
    <p className="px-4 text-xs text-app-muted">
      {t("review.archive.annonce", {
        n: portee.ids.length,
        deja: portee.deja,
        sans: portee.sansCopie,
      })}
      {portee.volume > 0 && (
        <>
          {" "}
          {t("review.archive.volume", {
            volume: formatterOctets(portee.volume),
            duree: dureeEstimee(portee.ids.length),
          })}
        </>
      )}
      {portee.copiesInconnues && <span className="block">{t("review.archive.inconnu")}</span>}
      {trop && (
        <span role="alert" className="block text-app-broken">
          {t("review.archive.borne", { n: portee.ids.length, borne: BORNE_ARCHIVE })}
        </span>
      )}
    </p>
  );
}

/**
 * Le vol d'archivage dans la Revue. L'archivage est un JOB (202 + SSE), là où
 * les autres actions de la Revue sont des mutations : il faut donc le suivre,
 * pas l'attendre.
 *
 * Ré-attachement : un archivage DÉJÀ en vol est adopté au lieu d'en lancer un
 * second — la route le refuserait de toute façon, autant lui donner son
 * suivi. La décision attend que la liste des jobs soit connue : décider sur
 * `undefined` reviendrait à poster en aveugle.
 */
export function ArchiveJob({
  ids,
  onTermine,
  onErreur,
}: {
  ids: number[];
  onTermine: (r: ResultatArchivage) => void;
  onErreur: (message: string) => void;
}) {
  const jobs = useJobsEnVol();
  const [jobIdLocal, setJobIdLocal] = useState<string | undefined>(undefined);
  const decide = useRef(false);
  const rendu = useRef(false);
  const vol = suivreJob("archive", jobIdLocal);

  useEffect(() => {
    if (decide.current || jobs.data === undefined) return;
    decide.current = true;
    // Déjà en vol : `suivreJob` l'adopte, rien à poster.
    if (jobs.data.some((j) => j.type === "archive")) return;
    api
      .send<{ jobId: string }>("POST", "/api/backup/archive", { ids })
      .then((r) => setJobIdLocal(r.jobId))
      .catch((e: unknown) => onErreur(e instanceof Error ? e.message : String(e)));
  }, [jobs.data, ids, onErreur]);

  const fin = vol?.fin;
  useEffect(() => {
    if (fin?.kind !== "done" || rendu.current) return;
    rendu.current = true;
    onTermine(fin.resultat as ResultatArchivage);
  }, [fin, onTermine]);

  if (vol === null) return <p className="px-4 text-sm">{t("review.archive.lancement")}</p>;
  if (fin?.kind === "cancelled") {
    return <p className="px-4 text-sm">{t("review.archive.annule")}</p>;
  }
  if (fin?.kind === "error") {
    return (
      <p role="alert" className="px-4 text-sm text-app-broken">
        {t("state.error", { message: fin.message })}
      </p>
    );
  }
  if (fin?.kind === "done") {
    const r = fin.resultat as ResultatArchivage;
    const reussis = r.faits - r.echecs.length;
    return (
      <p className="px-4 text-sm">
        {t("review.archive.termine", { reussis, echoues: r.echecs.length })}
        {r.echecs.length > 0 && (
          <span className="block text-xs text-app-muted">
            {r.echecs.slice(0, 3).map((e) => e.raison).join(" · ")}
            {r.echecs.length > 3 ? " …" : ""}
          </span>
        )}
        {/* Non TENTÉS, et non « échoués » : l'archivage s'est arrêté au
            budget avant de les atteindre. Les ranger avec les échecs ferait
            croire à une panne là où il n'y a qu'une place à faire. */}
        {r.nonTentes > 0 && r.raisonArret !== undefined && (
          <span className="block text-xs text-app-muted">
            {t("review.archive.arret", { n: r.nonTentes, raison: r.raisonArret })}
          </span>
        )}
      </p>
    );
  }

  return (
    <p className="flex items-center gap-2 px-4 text-sm" aria-live="polite">
      <span>
        {t("review.archive.envol", {
          done: vol.done.toLocaleString("fr-FR"),
          total: vol.total.toLocaleString("fr-FR"),
        })}
      </span>
      <button type="button" className="btn btn-icone" aria-label={t("sauvegarde.annuler")} onClick={() => void annuler(vol.jobId)}>
        <Icone nom="croix" />
      </button>
    </p>
  );
}
