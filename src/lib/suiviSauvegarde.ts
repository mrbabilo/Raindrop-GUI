import { useEffect, useRef, useState } from "react";
import { jobEvents } from "./sse";
import { api } from "./api";
import { useJobsEnVol, type ResultatArchivage, type ResultatSauvegarde } from "../hooks/useBackup";

/** Un job de sauvegarde ou d'archivage, vu depuis l'interface. Les trois
 *  terminaisons sont exclusives par construction : un job n'est pas à la fois
 *  terminé et annulé. */
export interface SauvegardeEnVol {
  jobId: string;
  type: TypeJob;
  done: number;
  total: number;
  label: string | null;
  fin?:
    | { kind: "done"; resultat: ResultatSauvegarde | ResultatArchivage }
    | { kind: "cancelled" }
    | { kind: "error"; message: string };
}

export type TypeJob = "backup" | "archive";

const nombre = (v: unknown, defaut: number): number => (typeof v === "number" ? v : defaut);

/**
 * Suit LE job de ce type — il n'y a qu'une file, donc au plus un en vol.
 *
 * Règle de ré-attachement (spec sélection §3) : au montage, un job qu'on n'a
 * pas lancé soi-même — celui du démarrage (§4.4), ou celui d'une Revue
 * quittée — est adopté par la liste `/api/jobs`. `jobIdLocal` (l'émetteur
 * d'un POST) prime : son job est connu avant même que la liste ne le voie.
 *
 * Un job TERMINÉ quitte la liste des jobs en vol ; son état final reste
 * pourtant affiché — sans quoi une sauvegarde réussie disparaîtrait de
 * l'écran à la seconde où elle réussit.
 */
export function suivreJob(type: TypeJob, jobIdLocal?: string): SauvegardeEnVol | null {
  const jobs = useJobsEnVol();
  const [vol, setVol] = useState<SauvegardeEnVol | null>(null);
  const suivi = useRef<string | null>(null);

  const adopte = jobs.data?.find((j) => j.type === type);
  const cible = jobIdLocal ?? adopte?.id;

  useEffect(() => {
    // Rien de neuf à suivre : on garde ce qui est à l'écran (peut-être un
    // état final, justement ce qu'il ne faut pas effacer).
    if (cible === undefined || cible === suivi.current) return;
    suivi.current = cible;
    const controle = new AbortController();
    const depart = jobs.data?.find((j) => j.id === cible);
    setVol({
      jobId: cible,
      type,
      done: depart?.progress.done ?? 0,
      total: depart?.progress.total ?? 0,
      label: depart?.progress.label ?? null,
    });

    void jobEvents(
      cible,
      {
        onEvent: (evt) => {
          setVol((precedent) => {
            // Un événement d'un job qu'on ne suit plus : ignoré.
            if (precedent === null || precedent.jobId !== cible) return precedent;
            if (evt.kind === "progress") {
              // Forme réelle du flux (sidecar/api/sse.ts) : la progression
              // vit SOUS `progress`, elle n'est pas à plat sur l'événement.
              const p = evt.progress as { done?: unknown; total?: unknown; label?: unknown } | undefined;
              return {
                ...precedent,
                done: nombre(p?.done, precedent.done),
                total: nombre(p?.total, precedent.total),
                label: typeof p?.label === "string" ? p.label : precedent.label,
              };
            }
            if (evt.kind === "done") {
              // Sur `done`, le sidecar sérialise LE RÉSULTAT, pas l'événement
              // (sse.ts : `"result" in evt ? evt.result : evt`) — ses champs
              // arrivent donc à plat, `kind` mis à part.
              const { kind: _kind, ...resultat } = evt;
              return { ...precedent, fin: { kind: "done", resultat: resultat as unknown as ResultatSauvegarde | ResultatArchivage } };
            }
            if (evt.kind === "cancelled") return { ...precedent, fin: { kind: "cancelled" } };
            if (evt.kind === "error") {
              const message = typeof evt.message === "string" && evt.message ? evt.message : "erreur sans message";
              return { ...precedent, fin: { kind: "error", message } };
            }
            return precedent;
          });
        },
        onDone: () => undefined, // la terminaison est portée par l'événement lui-même
      },
      controle.signal,
    ).catch(() => undefined); // flux coupé : l'état affiché reste le dernier connu

    return () => controle.abort();
    // `jobs.data` change à chaque sondage : le dépendre relancerait
    // l'abonnement toutes les 5 s. Seule la cible compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cible, type]);

  return vol;
}

/** Annule le job en vol. Ce qui est déjà écrit sur disque le reste — une
 *  archive écrite est une archive acquise, une sauvegarde annulée est marquée
 *  incomplète et n'est jamais comptée comme la dernière valide. */
export async function annuler(jobId: string): Promise<void> {
  await api.send("POST", `/api/jobs/${jobId}/cancel`);
}
