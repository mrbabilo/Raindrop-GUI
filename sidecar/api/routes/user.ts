import { Hono } from "hono";
import { apiError } from "../../../shared/errors.js";
import type { SidecarDeps } from "../deps.js";

// Stub Task 7 — adapté : GET / (monté sous /api/user) appelle deps.mcp et
// mappe l'erreur uniforme, pour le scénario 503/MCP_CRASHED de app.test.ts
// (un stub vide renverrait 404). Remplacé intégralement par la Task 9.
export const userRoutes = (deps: SidecarDeps): Hono => {
  const app = new Hono();
  app.get("/", async (c) => {
    const out = await deps.mcp("get_user", {});
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(out.data);
  });
  return app;
};
