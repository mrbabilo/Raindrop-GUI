import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import { apiError } from "../../shared/errors.js";
import type { SidecarDeps } from "./deps.js";
import { raindropsRoutes } from "./routes/raindrops.js";
import { collectionsRoutes } from "./routes/collections.js";
import { tagsRoutes } from "./routes/tags.js";
import { userRoutes } from "./routes/user.js";
import { maintenanceRoutes } from "./routes/maintenance.js";
import { analysisRoutes } from "./routes/analysis.js";
import { jobsRoutes } from "./routes/jobs.js";
import { sauvegardeRoutes } from "./routes/sauvegarde.js";
import { journalRoutes } from "./routes/journal.js";

function bearerOk(expected: string, got: string | undefined): boolean {
  if (!got?.startsWith("Bearer ")) return false;
  const a = Buffer.from(got.slice(7));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createApp(deps: SidecarDeps, opts: { localToken: string }): Hono {
  const app = new Hono();

  // Défense en profondeur (spec §3.7) : si un header Origin est présent, il
  // doit être celui du webview Tauri ou d'un serveur de dev local.
  // Adaptation brief : enregistré AVANT l'auth Bearer — une origine forgée est
  // rejetée 403 même sans token (sinon elle serait écrasée par le 401).
  // CORS minimal (spec §3.7) : même liste locale — les origines autorisées
  // reçoivent les headers CORS (le webview Tauri en a besoin pour lire les
  // réponses) ; pas d'Origin ou origine non locale → aucun header CORS.
  // Le preflight OPTIONS est répondu ici (204, sans corps) : les navigateurs
  // n'envoient jamais Authorization sur un preflight, il ne doit donc pas
  // traverser le middleware d'auth.
  const LOCAL_ORIGIN =
    /^(tauri:\/\/localhost|https:\/\/tauri\.localhost|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;
  app.use("/api/*", async (c, next) => {
    const origin = c.req.header("Origin");
    if (!origin) return next();
    if (!LOCAL_ORIGIN.test(origin)) {
      return c.json({ error: { code: "INVALID_INPUT", message: "origine non autorisée" } }, 403);
    }
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
    c.header("Access-Control-Max-Age", "86400");
    // La date de l'archive (spec lecture §3) doit rester LISIBLE au JS du
    // webview : CORS masque tout en-tête non exposé, même sur une 200.
    c.header("Access-Control-Expose-Headers", "X-Archive-Date");
    if (c.req.method === "OPTIONS") return c.body(null, 204);
    return next();
  });

  app.use("/api/*", async (c, next) => {
    if (!bearerOk(opts.localToken, c.req.header("Authorization"))) {
      return c.json({ error: { code: "INVALID_INPUT", message: "token local requis" } }, 401);
    }
    return next();
  });

  app.get("/api/health", (c) =>
    c.json({ status: "ok", mcp: deps.state(), pending: undefined }),
  );

  app.post("/api/mcp/restart", async (c) => {
    // lifecycle.restart() rejette quand la reconnexion échoue — erreur uniforme
    // (MCP_CRASHED → 503) au lieu d'une 500 nue.
    try {
      await deps.restart();
    } catch (e) {
      return apiError(c, "MCP_CRASHED", e instanceof Error ? e.message : String(e));
    }
    return c.json({ status: "restarted", mcp: deps.state() });
  });

  app.route("/api/raindrops", raindropsRoutes(deps));
  app.route("/api/collections", collectionsRoutes(deps));
  app.route("/api/tags", tagsRoutes(deps));
  // Pas de route /api/highlights : l'endpoint qu'elle appelait
  // (GET /raindrop/{id}/highlights via get_highlights) répond 404 HTML en
  // réel (R8cP-1) — les highlights traversent GET /api/raindrops/:id.
  app.route("/", userRoutes(deps)); // chemins complets internes : /api/user, /api/parse-url, /api/check-urls
  app.route("/api/maintenance", maintenanceRoutes(deps));
  app.route("/api/analysis", analysisRoutes(deps));
  app.route("/api/jobs", jobsRoutes(deps));
  // Le journal consultable depuis l'app (Réglages, 2026-09-20) : écritures,
  // jobs, erreurs — 500 dernières entrées du jour.
  app.route("/api/journal", journalRoutes(deps));
  // Montée MÊME sans dossier configuré : la route dit alors que la
  // sauvegarde est inactive (un 404 serait le silence que §6 interdit).
  app.route("/api/backup", sauvegardeRoutes(deps));

  return app;
}
