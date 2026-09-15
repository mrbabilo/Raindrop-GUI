import { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../../shared/errors.js";
import type { SidecarDeps } from "../deps.js";

export function highlightsRoutes(deps: SidecarDeps): Hono {
  const app = new Hono();

  // Lecture seule en Phase 1 côté front ; l'écriture reste exposée (tool présent)
  app.get("/:raindropId", async (c) => {
    const out = await deps.mcp("get_highlights", { raindrop_id: Number(c.req.param("raindropId")) });
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(out.data);
  });

  app.post("/manage", async (c) => {
    const body = z.object({
      operation: z.enum(["create", "update", "delete"]),
      raindrop_id: z.number().int().optional(),
      highlight_id: z.number().int().optional(),
      text: z.string().optional(),
      note: z.string().optional(),
      color: z.string().optional(),
    }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", z.prettifyError(body.error));
    const out = await deps.mcp("manage_highlight", body.data);
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(out.data);
  });

  return app;
}
