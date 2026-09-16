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
    // Réponse MCP réelle de get_highlights : tableau nu (getHighlights finit par
    // ok(data.items) dans le code compilé épinglé 1.3.1), jamais {items: [...]}.
    // Pas de lecture tolérante : autre chose qu'un tableau échoue bruyamment.
    if (!Array.isArray(out.data)) {
      return apiError(c, "RAINDROP_API", "get_highlights: réponse MCP inattendue — tableau attendu", "get_highlights");
    }
    const raw = out.data as { _id: number; text: string; note: string; color: string }[];
    // Enveloppe {items} pour le front ; items transmis tels quels (_id compris,
    // la conversion _id→id reste côté front, Task 8).
    return c.json({ items: raw });
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
