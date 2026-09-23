import { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../../shared/errors.js";
import type { SidecarDeps } from "../deps.js";
import { toRaindropItem } from "../mappers.js";
import { composerRecherche } from "../recherche.js";
import { makeDedupe } from "../../trash/dedupe.js";
import { corbeilleEnMasse, marquerEtiquette } from "../../trash/bulk.js";
import { runJob } from "../../jobs/store.js";
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
  // Le filtre multi-étiquettes. Comme `domain`, ce n'est PAS un paramètre du
  // tool : il se compose dans la recherche (recherche.ts) et le tableau ne
  // doit jamais atteindre le pont.
  tags: z.array(z.string()).optional(),
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
    // §4.2 (revue finale) : le front connaît la collection d'origine de
    // CHAQUE item (vue review) — il la transmet pour que la mise à la
    // corbeille en masse soit restaurable À L'ORIGINE. Absent (anciens
    // clients) : repli sur collection_id, dégradé « Tous ».
    origins: z.array(z.object({ id: z.number().int(), from: z.number().int() })).optional(),
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

const dedupeBody = z.object({
  paires: z
    .array(
      z.object({
        garde: z.number().int(),
        copies: z
          .array(z.object({ id: z.number().int(), collectionId: z.number().int() }))
          .min(1),
      }),
    )
    .min(1),
});

// Les dépôts du glisser-déposer (2026-09-20). Borne 50 : ~1,1 s par item
// sous la file (lecture + écriture), et le front attend 70 s au plus.
const bulkTrashBody = z.object({ ids: z.array(z.number().int()).min(1).max(50) });
const bulkTagBody = z.object({
  ids: z.array(z.number().int()).min(1).max(50),
  tag: z.string().min(1),
});

const unrestoreBody = z.object({
  ids: z.array(z.number().int()).min(1),
  toCollectionId: z.number().int().optional(),
});

/** `from` arrive en query string → coercion explicite (⚠️ jamais
 *  z.coerce.boolean(), ruling R10 ; ici un nombre : coerce sûr). */
const fromQuery = z.coerce.number().int().optional();

export function raindropsRoutes(deps: SidecarDeps): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    const params = new URL(c.req.url).searchParams;
    // ⚠️ `Object.fromEntries` ne garde que la DERNIÈRE valeur d'une clé
    // répétée : `?tags=a&tags=b` s'y réduirait à `b`, sans la moindre erreur —
    // un filtre sur deux étiquettes qui n'en applique qu'une, et une liste
    // trop large qu'aucun message n'explique. Les étiquettes se relisent donc
    // par `getAll`, APRÈS l'aplatissement, et l'écrasent.
    const brut: Record<string, unknown> = Object.fromEntries(params);
    const tagsBruts = params.getAll("tags");
    if (tagsBruts.length > 0) brut.tags = tagsBruts;
    else delete brut.tags;
    const q = searchQuery.safeParse(brut);
    if (!q.success) return apiError(c, "INVALID_INPUT", z.prettifyError(q.error));
    // CLAUDE.md §Traps : `domain` transmis au tool ne filtre RIEN — le pont
    // l'envoie en paramètre d'URL et l'API Raindrop l'ignore. Le filtre par
    // domaine n'existe que dans la recherche : on l'y compose, et on RETIRE
    // le paramètre mort des arguments (sinon le pont l'ajoute quand même).
    // `tags` suit la même règle, et `media` pareillement — l'opérateur
    // `type:` est le seul filtre de nature : le paramètre mort faisait
    // flotter les puces (2026-09-20).
    const { domain, tags, media, ...args } = q.data;
    const search = composerRecherche(q.data.search, domain, tags, media);
    const out = await deps.mcp("search_raindrops", { ...args, ...(search === undefined ? {} : { search }) });
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
    // La chaîne vide n'est pas une origine : `z.coerce.number()("")` rend 0
    // (« Tous »), et `?from=` mentait sa provenance en mémorisant 0.
    const brut = c.req.query("from") ?? undefined;
    const from = fromQuery.safeParse(brut === "" ? undefined : brut);
    if (!from.success) return apiError(c, "INVALID_INPUT", z.prettifyError(from.error));
    // Un appelant qui se dit DANS la corbeille demande une suppression
    // définitive (SOURCES.md) : ce geste appartient au vidage de niveau 2,
    // jamais à ce DELETE (audit du 2026-09-23 — même garde que la fiche).
    if (from.data === -99) return apiError(c, "INVALID_INPUT", "déjà en corbeille : la suppression y serait définitive");
    // §4.2 : la corbeille ne garde pas l'origine → notée AVANT la suppression.
    // Le store ne remonte jamais d'erreur (contrat origins.ts) : un échec de
    // mémorisation dégrade en « destination demandée au front », pas en 500.
    if (from.data !== undefined) await deps.origins.remember(id, from.data);
    const out = await deps.mcp("delete_raindrop", { id });
    if (!out.ok) {
      deps.journal.warn("corbeille refusée", { id, err: out.message });
      return apiError(c, out.code, out.message, out.tool);
    }
    // Une écriture qui ne fait rien doit laisser une trace — le silence a
    // caché la corbeille `-99` entière (2026-09-20).
    deps.journal.info("corbeille", { id, from: from.data ?? null });
    return c.json({ deleted: true });
  });

  // Restauration corbeille — le MCP v1.3.1 n'expose pas unrestore → REST direct.
  // Hybride (§4.2) : destination fournie → tout part là ; sinon regroupement
  // par origine mémorisée, les ids sans origine reviennent `unknown` SANS
  // être restaurés (le front demandera la destination, Task 8).
  app.post("/unrestore", async (c) => {
    const body = unrestoreBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", z.prettifyError(body.error));
    const { ids, toCollectionId } = body.data;

    if (toCollectionId !== undefined) {
      const out = await deps.direct.unrestore(ids, toCollectionId);
      if (!out.ok) return apiError(c, out.code, out.message);
      await deps.origins.forget(ids);
      return c.json({ restored: out.data.restored, unknown: [] });
    }

    // take est une LECTURE PURE — seul forget écrit, et uniquement sur les
    // ids d'un groupe effectivement restauré : si une destination réussit et
    // une autre échoue, les origines du groupe en échec survivent (sinon ces
    // éléments deviennent irrécupérables à l'origine au prochain essai).
    const { known, unknown } = await deps.origins.take(ids);
    const byDest = new Map<number, number[]>();
    for (const [id, dest] of known) {
      const group = byDest.get(dest);
      if (group) group.push(id);
      else byDest.set(dest, [id]);
    }
    let restored = 0;
    for (const [dest, group] of byDest) {
      // séquentiel : en prod, deps.direct.unrestore passe par le throttle
      // partagé (550 ms) qui espace les appels entre destinations
      const out = await deps.direct.unrestore(group, dest);
      if (out.ok) {
        restored += out.data.restored;
        await deps.origins.forget(group);
      }
      // échec d'un groupe : origines conservées, ids ni restaurés ni unknown
      // (restored + unknown < ids.length le signale au front)
    }
    return c.json({ restored, unknown });
  });

  app.post("/bulk", async (c) => {
    const body = bulkBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", z.prettifyError(body.error));
    if (body.data.operation === "delete" && body.data.ids) {
      // §4.2 : la corbeille en masse (BulkBar, ReviewPage) est le cas COURANT
      // d'un nettoyage — sans mémorisation ici, tout reviendrait unknown.
      // L'origine fournie par item prime ; un id absent de `origins` retombe
      // sur collection_id (dégradé « Tous », anciens clients).
      const parId = new Map((body.data.origins ?? []).map((o) => [o.id, o.from]));
      await Promise.all(
        body.data.ids.map((id) => deps.origins.remember(id, parId.get(id) ?? body.data.collection_id)),
      );
    }
    // `origins` est un contrat front↔sidecar : il n'existe pas côté tool MCP.
    const { origins: _origines, ...args } = body.data;
    const out = await deps.mcp("bulk_raindrops", args);
    if (!out.ok) {
      deps.journal.warn("bulk refusé", {
        operation: body.data.operation,
        ids: body.data.ids ?? null,
        err: out.message,
      });
      return apiError(c, out.code, out.message, out.tool);
    }
    deps.journal.info("bulk", {
      operation: body.data.operation,
      ids: body.data.ids ?? null,
      to: body.data.to_collection_id ?? null,
    });
    return c.json(out.data);
  });

  // Suppression de doublons CONSOLIDÉE : les étiquettes des copies remontent
  // dans le gardé avant la corbeille (demande utilisateur du 2026-09-19).
  // Job SSE : N lectures + M écritures dans la file à 550 ms — le front suit
  // la progression comme pour un archivage.
  app.post("/dedupe", async (c) => {
    const body = dedupeBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", z.prettifyError(body.error));
    const total = body.data.paires.reduce((n, p) => n + p.copies.length, 0);
    const deduper = makeDedupe({ mcp: deps.mcp, origins: deps.origins });
    // Le journal traverse jusqu'au job : le terme (corbeillées, échecs) se
    // logge au point unique de runJob, lisible depuis l'app.
    const job = runJob(deps.jobs, "dedupe", total, (j) => deduper(body.data.paires, j), deps.journal);
    deps.journal.info("dedupe lancé", { paires: body.data.paires.length, copies: total });
    return c.json({ jobId: job.id, total });
  });

  // Dépôt du glisser-déposer sur la corbeille (2026-09-20). La sélection
  // tirée ne transporte pas les origines : le sidecar les LIT, item par
  // item, et les mémorise avant la corbeille (§4.2).
  app.post("/bulk-trash", async (c) => {
    const body = bulkTrashBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", "ids : 1 à 50 identifiants");
    const r = await corbeilleEnMasse({ mcp: deps.mcp, origins: deps.origins, journal: deps.journal }, body.data.ids);
    return c.json(r);
  });

  // Dépôt du glisser-déposer sur une étiquette (2026-09-20) : l'union SEULE.
  app.post("/bulk-tag", async (c) => {
    const body = bulkTagBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", "ids : 1 à 50 identifiants, tag requis");
    const r = await marquerEtiquette({ mcp: deps.mcp, origins: deps.origins, journal: deps.journal }, body.data.ids, body.data.tag);
    return c.json(r);
  });

  return app;
}
