import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { apiError } from "../../../shared/errors.js";
import type { SidecarDeps } from "../deps.js";

// La vue reçue exige collectionId (nombre), le reste est optionnel — la
// forme sérialisable d'une vue "list" (spec §3). Le front n'envoie jamais
// les champs vides : le zod les tolérerait, le contrat ne les produit pas.
const vueSchema = z.object({
  collectionId: z.number(),
  notag: z.boolean().optional(),
  search: z.string().optional(),
  tags: z.array(z.string()).optional(),
  sort: z.string().optional(),
  domain: z.string().optional(),
  media: z.string().optional(),
  createdStart: z.string().optional(),
  createdEnd: z.string().optional(),
});

// Une smart list n'est pas un dépotoir : nom non vide, 80 signes (spec §3).
const nomSchema = z.string().trim().min(1).max(80);

/** L'échec du dépôt local se NOMME (STOCKAGE), jamais une 500 nue — et
 *  jamais un 200 alors que rien n'a été écrit (succès inventé). */
const sousStockage = async (c: Context, fn: () => Promise<Response>): Promise<Response> => {
  try {
    return await fn();
  } catch (e) {
    return apiError(c, "STOCKAGE", e instanceof Error ? e.message : String(e));
  }
};

export function smartlistsRoutes(deps: SidecarDeps): Hono {
  const app = new Hono();

  app.get("/", (c) => sousStockage(c, async () => c.json({ items: await deps.smartlists.list() })));

  app.post("/", (c) =>
    sousStockage(c, async () => {
      const body = z
        .object({ label: nomSchema, vue: vueSchema })
        .safeParse(await c.req.json().catch(() => null));
      if (!body.success) return apiError(c, "INVALID_INPUT", "label (1-80 signes) et vue (collectionId requis) attendus");
      return c.json(await deps.smartlists.add(body.data));
    }),
  );

  app.patch("/:id", (c) =>
    sousStockage(c, async () => {
      const body = z.object({ label: nomSchema }).safeParse(await c.req.json().catch(() => null));
      if (!body.success) return apiError(c, "INVALID_INPUT", "label (1-80 signes) attendu");
      const maj = await deps.smartlists.rename(c.req.param("id"), body.data.label);
      if (!maj) return apiError(c, "NOT_FOUND", "vue sauvegardée inconnue");
      return c.json(maj);
    }),
  );

  app.delete("/:id", (c) =>
    sousStockage(c, async () => {
      const fait = await deps.smartlists.remove(c.req.param("id"));
      if (!fait) return apiError(c, "NOT_FOUND", "vue sauvegardée inconnue");
      return c.json({ result: true });
    }),
  );

  return app;
}
