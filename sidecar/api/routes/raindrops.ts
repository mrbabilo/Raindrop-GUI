import { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../../shared/errors.js";
import type { SidecarDeps } from "../deps.js";
import { toRaindropItem } from "../mappers.js";
import type { RawRaindrop } from "../mappers.js";

const searchQuery = z.object({
  collection_id: z.coerce.number().int().default(0),
  search: z.string().optional(),
  sort: z.enum(["score", "-created", "created", "-title", "title", "-domain", "domain"]).optional(),
  page: z.coerce.number().int().min(0).default(0),
  per_page: z.coerce.number().int().min(1).max(50).default(50),
  // "false" doit DÉSACTIVER le filtre — z.coerce.boolean() piége (Boolean("false")===true)
  important: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  notag: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  domain: z.string().optional(),
  media: z.enum(["link", "article", "image", "video", "document", "audio"]).optional(),
  created_start: z.string().optional(),
  created_end: z.string().optional(),
});

const createBody = z.object({
  link: z.string().url(),
  title: z.string().optional(),
  excerpt: z.string().optional(),
  note: z.string().optional(),
  tags: z.array(z.string()).optional(),
  important: z.boolean().optional(),
  collection_id: z.number().int().optional(),
});

const patchBody = z
  .object({
    url: z.string().url().optional(),
    title: z.string().optional(),
    excerpt: z.string().optional(),
    note: z.string().optional(),
    tags: z.array(z.string()).optional(),
    important: z.boolean().optional(),
    collection_id: z.number().int().optional(),
  })
  .refine((b) => !(b.url != null && Object.keys(b).length > 1), {
    message: "envoyez url seul ; les autres champs via une seconde requête",
  });

const bulkBody = z
  .object({
    operation: z.enum(["update", "move", "delete"]),
    collection_id: z.number().int(),
    ids: z.array(z.number().int()).min(1).optional(),
    to_collection_id: z.number().int().optional(),
    tags: z.array(z.string()).optional(),
    important: z.boolean().optional(),
  })
  .refine((b) => b.operation !== "move" || (b.to_collection_id != null && b.ids != null), {
    message: "move exige ids et to_collection_id",
  })
  .refine((b) => b.operation !== "delete" || b.ids != null, {
    message: "delete exige ids",
  })
  .refine((b) => b.operation !== "update" || (b.tags != null || b.important != null), {
    message: "update exige tags ou important",
  });

export function raindropsRoutes(deps: SidecarDeps): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    const q = searchQuery.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
    if (!q.success) return apiError(c, "INVALID_INPUT", z.prettifyError(q.error));
    const out = await deps.mcp("search_raindrops", q.data);
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    const raw = out.data as { count: number; items: RawRaindrop[] };
    return c.json({
      items: raw.items.map(toRaindropItem),
      count: raw.count,
      page: q.data.page,
      perPage: q.data.per_page,
    });
  });

  app.get("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return apiError(c, "INVALID_INPUT", "id invalide");
    const out = await deps.mcp("get_raindrop", { id });
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(toRaindropItem(out.data as RawRaindrop));
  });

  app.post("/", async (c) => {
    const body = createBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", z.prettifyError(body.error));
    const out = await deps.mcp("create_raindrop", body.data);
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(toRaindropItem(out.data as RawRaindrop), 201);
  });

  app.patch("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const body = patchBody.safeParse(await c.req.json().catch(() => null));
    if (!Number.isInteger(id)) return apiError(c, "INVALID_INPUT", "id invalide");
    if (!body.success) return apiError(c, "INVALID_INPUT", z.prettifyError(body.error));
    if (body.data.url != null) {
      // update_raindrop n'expose pas url (v1.3.1) → REST direct (contrainte plan)
      const out = await deps.direct.updateRaindropUrl(id, body.data.url);
      if (!out.ok) return apiError(c, out.code, out.message);
      return c.json({ urlUpdated: true, id });
    }
    const { url: _ignored, ...rest } = body.data;
    const out = await deps.mcp("update_raindrop", { id, ...rest });
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(toRaindropItem(out.data as RawRaindrop));
  });

  app.delete("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return apiError(c, "INVALID_INPUT", "id invalide");
    const out = await deps.mcp("delete_raindrop", { id });
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json({ deleted: true });
  });

  // Restauration corbeille — le MCP v1.3.1 n'expose pas unrestore → REST direct (§3.3)
  app.post("/unrestore", async (c) => {
    const body = z.object({ ids: z.array(z.number().int()).min(1) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", z.prettifyError(body.error));
    const out = await deps.direct.unrestore(body.data.ids);
    if (!out.ok) return apiError(c, out.code, out.message);
    return c.json(out.data);
  });

  app.post("/bulk", async (c) => {
    const body = bulkBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", z.prettifyError(body.error));
    const out = await deps.mcp("bulk_raindrops", body.data);
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(out.data);
  });

  return app;
}
