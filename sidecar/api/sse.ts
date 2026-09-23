import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { JobEvent, JobHandle } from "../jobs/store.js";

/**
 * Abonne la réponse SSE aux événements du job, avec heartbeat.
 * Adaptation brief : signature étendue à `Context` (streamSSE hono l'exige ;
 * la version `{ req: { raw: Request } }` du brief ne typecheck pas).
 *
 * `resultat` : lit le résultat d'un job DÉJÀ terminé (audit du 2026-09-23).
 * Le front fait `POST` puis `GET /events` : un job court a pu émettre son
 * terme entre les deux, et `subscribe` ne rejoue rien — le flux se fermait
 * sans `done`/`error`, la promesse de suivi du front ne se réglait jamais.
 */
export function jobSse(job: JobHandle, c: Context, resultat: () => unknown = () => undefined): Response {
  let unsub: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  return streamSSE(c, async (stream) => {
    const envoyer = (evt: JobEvent) => {
      // writeSSE rejette si le client s'est déconnecté : ne jamais laisser
      // devenir un rejet non géré (crash Node).
      void stream
        .writeSSE({ event: evt.kind, data: JSON.stringify("result" in evt ? evt.result : evt) })
        .catch(() => undefined);
    };
    unsub = job.subscribe(envoyer);
    // Terme ANTÉRIEUR à l'abonnement : rejoué depuis l'état. Abonnement et
    // lecture sont synchrones — aucun terme ne peut sortir deux fois.
    const snap = job.snapshot();
    if (snap.status === "done") envoyer({ kind: "done", result: resultat() });
    else if (snap.status === "error") envoyer({ kind: "error", message: snap.error ?? "" });
    else if (snap.status === "cancelled") envoyer({ kind: "cancelled" });
    heartbeat = setInterval(() => {
      void stream.writeSSE({ event: "ping", data: String(Date.now()) }).catch(() => undefined);
    }, 15_000);
    // libérer à la déconnexion du client
    c.req.raw.signal.addEventListener("abort", () => {
      unsub?.();
      if (heartbeat) clearInterval(heartbeat);
    });
    // maintenir la stream ouverte tant que le job vit
    while (true) {
      await stream.sleep(1000);
      if (job.snapshot().status !== "running") break;
    }
    unsub?.();
    if (heartbeat) clearInterval(heartbeat);
  });
}
