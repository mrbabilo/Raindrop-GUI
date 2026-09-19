import { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../../shared/errors.js";
import type { SidecarDeps } from "../deps.js";
import type { LinkCheckResult } from "../../../shared/types.js";

const FILTER_ORDER: Record<string, number> = { dead: 0, indeterminate: 1, redirect: 2, ok: 3 };

export function analysisRoutes(deps: SidecarDeps): Hono {
  const app = new Hono();

  app.post("/scan", async (c) => {
    const body = z.object({ type: z.enum(["links", "duplicates"]) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", "type ∈ {links, duplicates}");
    try {
      const jobId = deps.scanner.startScan(body.data.type);
      return c.json({ jobId }, 202);
    } catch (e) {
      return apiError(c, "INVALID_INPUT", e instanceof Error ? e.message : String(e));
    }
  });

  app.get("/status", (c) => {
    // L'avancement des liens vient du CACHE, pas d'une requête : il rend
    // visible une reprise qui, jusqu'ici, fonctionnait sans le dire. Après une
    // coupure, `lastScan` reste `null` — la date ne se pose qu'à
    // l'achèvement — et l'écran affichait « jamais » au-dessus de milliers de
    // liens déjà vérifiés.
    const avancement = deps.cache.avancementLiens(deps.scanner.ttlJours());
    return c.json({
      links: {
        lastScan: deps.cache.lastScan("links"),
        running: deps.scanner.isRunning("links"),
        ...avancement,
      },
      duplicates: { lastScan: deps.cache.lastScan("duplicates"), running: deps.scanner.isRunning("duplicates") },
    });
  });

  app.get("/results/links", (c) => {
    const q = z.object({
      page: z.coerce.number().int().min(0).default(0),
      per_page: z.coerce.number().int().min(1).max(200).default(50),
      filter: z.enum(["all", "dead", "indeterminate", "redirect", "ok"]).default("all"),
    }).safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
    if (!q.success) return apiError(c, "INVALID_INPUT", z.prettifyError(q.error));

    const index = deps.cache.getItemsIndex();
    // PAR SIGNET, non par URL : une URL portée par trois signets rendait UNE
    // ligne, et les deux autres restaient morts sans que rien ne le dise.
    const all = deps.cache.resultatsParSignet();
    const filtered = q.data.filter === "all" ? all : all.filter((r) => r.status === q.data.filter);
    filtered.sort((a, b) => (FILTER_ORDER[a.status] ?? 9) - (FILTER_ORDER[b.status] ?? 9));
    const start = q.data.page * q.data.per_page;
    const items = filtered.slice(start, start + q.data.per_page).map((r) => enrich(r, index));
    return c.json({ items, total: filtered.length, page: q.data.page, perPage: q.data.per_page });
  });

  app.get("/results/duplicates", (c) => c.json(deps.cache.getGroups()));

  /**
   * Les diagnostics PAR SIGNET, pour la liste principale.
   *
   * Seuls les signets qui portent un diagnostic sont transmis : un lien sain
   * n'a aucune marque (DESIGN.md §5), donc rien à dire. La charge est ainsi
   * proportionnelle aux PROBLÈMES, pas à la taille de la bibliothèque — une
   * réponse par page, elle, ne couvrirait pas les lignes que le virtualiseur
   * n'a pas encore montées.
   *
   * ORDRE VOULU : les doublons d'abord, le verdict de lien ENSUITE — il
   * écrase. Un signet peut être les deux, et la ligne ne porte qu'un filet :
   * « mort » l'emporte sur « doublon », parce qu'un lien cassé ne se répare
   * pas en rangeant. La précédence est tablée dans DESIGN.md §5, où quelqu'un
   * ira la chercher.
   */
  app.get("/etats", (c) => {
    const etats: Record<number, string> = {};
    const groupes = deps.cache.getGroups();
    for (const genre of ["exact", "normalized", "fuzzy"] as const) {
      for (const g of groupes[genre]) for (const it of g.items) etats[it.id] = "duplicate";
    }
    // `resultatsParSignet` et NON `allResults` : ce dernier rend une ligne par
    // URL, et la liste ne marquerait qu'un seul de trois signets partageant
    // une adresse morte. C'est le défaut corrigé le 2026-09-19 ; l'appeler
    // ici le rouvrirait ailleurs.
    for (const r of deps.cache.resultatsParSignet()) {
      if (r.status !== "ok") etats[r.raindropId] = r.status;
    }
    return c.json({ etats });
  });

  return app;
}

type EnrichedLink = LinkCheckResult & { title: string; collectionId: number };

function enrich(r: LinkCheckResult, index: Record<number, { title: string; collectionId: number; url: string }>): EnrichedLink {
  const meta = index[r.raindropId];
  return { ...r, title: meta?.title ?? r.url, collectionId: meta?.collectionId ?? -1 };
}
