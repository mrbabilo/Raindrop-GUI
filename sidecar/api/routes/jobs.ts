import { Hono } from "hono";
import { apiError } from "../../../shared/errors.js";
import type { SidecarDeps } from "../deps.js";
import { jobSse } from "../sse.js";

export function jobsRoutes(deps: SidecarDeps): Hono {
  const app = new Hono();

  // Les jobs EN VOL (spec sélection §3 : un job qu'on n'a pas lancé doit se
  // voir — le boot §4.4 ou une Revue quittée peuvent en porter un). Le
  // terminé se lit par /:id ; la liste ne montre que ce qui peut être suivi.
  // AVANT /:id : chez Hono, "/:id" capturerait "".
  app.get("/", (c) => c.json(deps.jobs.list().filter((j) => j.status === "running")));

  app.get("/:id", (c) => {
    const snap = deps.jobs.get(c.req.param("id"));
    if (!snap) return apiError(c, "INVALID_INPUT", "job inconnu");
    return c.json(snap);
  });

  app.get("/:id/events", (c) => {
    const snap = deps.jobs.get(c.req.param("id"));
    if (!snap) return apiError(c, "INVALID_INPUT", "job inconnu");
    const job = deps.jobs.getHandle(c.req.param("id"));
    if (!job) return apiError(c, "INVALID_INPUT", "job inconnu");
    return jobSse(job, c);
  });

  app.post("/:id/cancel", (c) => {
    const job = deps.jobs.getHandle(c.req.param("id"));
    if (!job) return apiError(c, "INVALID_INPUT", "job inconnu");
    job.cancel();
    return c.json({ cancelled: true });
  });

  return app;
}
