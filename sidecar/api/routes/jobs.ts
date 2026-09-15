import { Hono } from "hono";
import { apiError } from "../../../shared/errors.js";
import type { SidecarDeps } from "../deps.js";
import { jobSse } from "../sse.js";

export function jobsRoutes(deps: SidecarDeps): Hono {
  const app = new Hono();

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
