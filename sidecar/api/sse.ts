import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { JobHandle } from "../jobs/store.js";

/**
 * Abonne la réponse SSE aux événements du job, avec heartbeat.
 * Adaptation brief : signature étendue à `Context` (streamSSE hono l'exige ;
 * la version `{ req: { raw: Request } }` du brief ne typecheck pas).
 */
export function jobSse(job: JobHandle, c: Context): Response {
  let unsub: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  return streamSSE(c, async (stream) => {
    unsub = job.subscribe((evt) => {
      void stream.writeSSE({ event: evt.kind, data: JSON.stringify("result" in evt ? evt.result : evt) });
    });
    heartbeat = setInterval(() => {
      void stream.writeSSE({ event: "ping", data: String(Date.now()) });
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
