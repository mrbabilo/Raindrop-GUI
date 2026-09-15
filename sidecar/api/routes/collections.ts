import { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../../shared/errors.js";
import type { SidecarDeps } from "../deps.js";
import { toCollection } from "../mappers.js";
import type { RawCollection } from "../mappers.js";

const createBody = z.object({
  title: z.string().min(1),
  public: z.boolean().optional(),
  parent_id: z.number().int().optional(),
  view: z.enum(["list", "simple", "grid", "masonry"]).optional(),
});
const updateBody = createBody.partial().extend({ id: z.number().int() }).partial().omit({ id: true });

// Adaptation brief : le fake (Task 3) sérialise les collections en camelCase
// (`parentId: number|null`) alors que l'API Raindrop réelle renvoie `parent:{$id}`
// (forme attendue par RawCollection/toCollection). On tolère les deux — no-op
// pour la vraie forme — sinon le test du brief (child.parentId === 101) échoue.
type RawCollectionCompat = RawCollection & { parentId?: number | null };
const toCol = (raw: RawCollectionCompat): ReturnType<typeof toCollection> =>
  toCollection(raw.parent || raw.parentId == null ? raw : { ...raw, parent: { $id: raw.parentId } });

export function collectionsRoutes(deps: SidecarDeps): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    const [root, children] = await Promise.all([
      deps.mcp("get_collections", {}),
      deps.mcp("get_child_collections", {}),
    ]);
    if (!root.ok) return apiError(c, root.code, root.message, root.tool);
    if (!children.ok) return apiError(c, children.code, children.message, children.tool);
    const items = [
      ...(root.data as { items: RawCollectionCompat[] }).items,
      ...(children.data as { items: RawCollectionCompat[] }).items,
    ].map(toCol);
    return c.json({ items });
  });

  app.get("/:id", async (c) => {
    const out = await deps.mcp("get_collection", { id: Number(c.req.param("id")) });
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(toCol(out.data as RawCollectionCompat));
  });

  app.post("/", async (c) => {
    const body = createBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", z.prettifyError(body.error));
    const out = await deps.mcp("create_collection", body.data);
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(toCol(out.data as RawCollectionCompat), 201);
  });

  app.patch("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const body = updateBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", z.prettifyError(body.error));
    const out = await deps.mcp("update_collection", { id, ...body.data });
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(toCol(out.data as RawCollectionCompat));
  });

  app.delete("/:id", async (c) => {
    const out = await deps.mcp("delete_collection", { id: Number(c.req.param("id")) });
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json({ deleted: true });
  });

  // cleanup_collections : mapping du confirm MCP sur la gravité niveau 2 (spec §4.2)
  app.post("/cleanup", async (c) => {
    const body = z.object({ confirm: z.boolean() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", "confirm: boolean requis");
    const out = await deps.mcp("cleanup_collections", { confirm: body.data.confirm });
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(out.data);
  });

  return app;
}
