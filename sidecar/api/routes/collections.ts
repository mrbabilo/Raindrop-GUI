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

class ShapeError extends Error {
  constructor(readonly tool: string, detail: string) {
    super(`${tool}: réponse MCP inattendue — ${detail}`);
  }
}

// Adaptation test : le fake MCP (sidecar/testing/fixtures.ts) sérialise les
// collections en camelCase (`id`, `parentId: number|null`) alors que l'API
// Raindrop réelle porte `_id` et `parent:{$id}|null` (forme vérifiée par
// sonde le 2026-09-16, voir mappers.test.ts). On comble l'écart pour ces deux
// champs seulement — no-op sur la vraie forme, jamais atteint en production.
//
// Ni `_id` ni `id` : la forme est inattendue, on ÉCHOUE — l'ancien
// `?? withParent.id!` promettait au compilateur un nombre qui n'existait
// pas, et le DTO partait avec `id: undefined` (ROADMAP, « forme supposée »).
type RawCollectionCompat = RawCollection & { id?: number; parentId?: number | null };
const normalize = (raw: RawCollectionCompat): RawCollection => {
  if (typeof raw._id !== "number" && typeof raw.id !== "number") {
    throw new ShapeError("get_collections", `collection sans identité (${raw.title ?? "?"})`);
  }
  const withParent = raw.parent || raw.parentId == null ? raw : { ...raw, parent: { $id: raw.parentId } };
  return { ...withParent, _id: withParent._id ?? withParent.id! };
};
const toCol = (raw: RawCollectionCompat): ReturnType<typeof toCollection> => toCollection(normalize(raw));

/** La réponse MCP réelle de get_collections/get_child_collections est un
 * tableau nu (vérifié par sonde le 2026-09-16), jamais `{items: [...]}`.
 * Tolérer les deux formes cacherait à nouveau l'écart avec le contrat réel :
 * on échoue bruyamment sur autre chose qu'un tableau. */
function asCollectionArray(data: unknown, tool: string): RawCollectionCompat[] {
  if (!Array.isArray(data)) {
    throw new ShapeError(tool, "tableau attendu");
  }
  return data as RawCollectionCompat[];
}

/** get_collections et get_child_collections se chevauchent sur le compte
 * réel (vérifié par sonde le 2026-09-16 : 2 des 13 racines réapparaissent
 * dans les 203 enfants — `parent: null` dans les deux réponses ; ni les
 * deux ensembles ne sont disjoints, ni get_child_collections ne renvoie
 * tout — mesuré, pas supposé, voir le rapport de task). Dédoublonner par
 * `_id`, première occurrence conservée (root avant children). */
function dedupeById(items: RawCollection[]): RawCollection[] {
  const seen = new Set<number>();
  const out: RawCollection[] = [];
  for (const raw of items) {
    if (seen.has(raw._id)) continue;
    seen.add(raw._id);
    out.push(raw);
  }
  return out;
}

export function collectionsRoutes(deps: SidecarDeps): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    const [root, children] = await Promise.all([
      deps.mcp("get_collections", {}),
      deps.mcp("get_child_collections", {}),
    ]);
    if (!root.ok) return apiError(c, root.code, root.message, root.tool);
    if (!children.ok) return apiError(c, children.code, children.message, children.tool);
    try {
      const raw = [
        ...asCollectionArray(root.data, "get_collections"),
        ...asCollectionArray(children.data, "get_child_collections"),
      ].map(normalize);
      const items = dedupeById(raw).map(toCollection);
      return c.json({ items });
    } catch (e) {
      if (e instanceof ShapeError) return apiError(c, "RAINDROP_API", e.message, e.tool);
      throw e;
    }
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
    // Un id illisible partait en NaN vers le pont ; 0, -1 et -99 (Tous, Non
    // classés, Corbeille) ne sont pas des collections qu'on supprime.
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) return apiError(c, "INVALID_INPUT", "id de collection invalide");
    const out = await deps.mcp("delete_collection", { id });
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json({ deleted: true });
  });

  // PAS de route vers `cleanup_collections` (le nettoyage GLOBAL de
  // Raindrop, `PUT /collections/clean`) : sa définition du « vide » n'est
  // pas la nôtre, et le geste est IRRÉVERSIBLE. La suppression passe id par
  // id, en Revue niveau 2 (`triPourSuppression`). La route survivait sans
  // appelant, `confirm` en simple booléen (audit du 2026-09-23).

  return app;
}
