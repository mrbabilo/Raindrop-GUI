import { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../../shared/errors.js";
import type { SidecarDeps } from "../deps.js";

export function maintenanceRoutes(deps: SidecarDeps): Hono {
  const app = new Hono();

  app.post("/empty-trash", async (c) => {
    const body = z.object({ confirm: z.literal(true) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", "confirm:true requis");
    const out = await deps.mcp("empty_trash", { confirm: true });
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    // Toute origine mémorisée pointe désormais vers un id qui n'existe plus :
    // les garder ne ferait que faire grossir le fichier à jamais. Purge
    // APRÈS le succès du vidage (sinon une origine serait perde pour un
    // raindrop encore en corbeille).
    await deps.origins.purge();
    return c.json(out.data);
  });

  return app;
}
