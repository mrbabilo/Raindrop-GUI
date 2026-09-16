import { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../../shared/errors.js";
import type { SidecarDeps } from "../deps.js";

const manageBody = z.object({
  operation: z.enum(["rename", "merge", "delete"]),
  tags: z.array(z.string()).min(1),
  new_name: z.string().min(1).optional(),
  collection_id: z.number().int().optional(),
}).refine((b) => b.operation === "delete" || b.new_name != null, {
  message: "new_name requis pour rename/merge",
});

export function tagsRoutes(deps: SidecarDeps): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    const collectionId = c.req.query("collection_id");
    const args = collectionId ? { collection_id: Number(collectionId) } : {};
    const out = await deps.mcp("get_tags", args);
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    // Réponse MCP réelle de get_tags : tableau nu de {_id, count} (vérifié par
    // sonde le 2026-09-16), jamais {items: [...]}. Pas de lecture tolérante :
    // autre chose qu'un tableau échoue bruyamment.
    if (!Array.isArray(out.data)) {
      return apiError(c, "RAINDROP_API", "get_tags: réponse MCP inattendue — tableau attendu", "get_tags");
    }
    const raw = out.data as { _id: string; count: number }[];
    // format brut Raindrop {_id, count} → DTO Tag {name, count}
    return c.json({ items: raw.map((t) => ({ name: t._id, count: t.count })) });
  });

  app.post("/manage", async (c) => {
    const body = manageBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", z.prettifyError(body.error));
    const out = await deps.mcp("manage_tags", body.data);
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(out.data);
  });

  return app;
}
