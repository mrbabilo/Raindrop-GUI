import { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../../shared/errors.js";
import type { SidecarDeps } from "../deps.js";

export function userRoutes(deps: SidecarDeps): Hono {
  const app = new Hono();

  app.get("/api/user", async (c) => {
    const out = await deps.mcp("get_user", {});
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    const u = out.data as { id: number; email: string; full_name?: string; fullName?: string; pro?: boolean; bookmarks_count?: number };
    return c.json({
      id: u.id,
      email: u.email,
      fullName: u.fullName ?? u.full_name ?? u.email,
      pro: u.pro ?? false,
      bookmarksCount: u.bookmarks_count ?? 0,
    });
  });

  app.post("/api/parse-url", async (c) => {
    const body = z.object({ url: z.string().url() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", "url valide requise");
    const out = await deps.mcp("parse_url", body.data);
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(out.data);
  });

  app.post("/api/check-urls", async (c) => {
    const body = z.object({ urls: z.array(z.string().url()).min(1) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", "urls[] requises");
    const out = await deps.mcp("check_urls_exist", body.data);
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(out.data);
  });

  return app;
}
