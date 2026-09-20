import { Hono } from "hono";
import type { SidecarDeps } from "../deps.js";
import { lireJournal } from "../../journal.js";

/** La consultation du journal depuis l'app (Réglages, 2026-09-20) : le
 *  fichier JSONL du jour, 500 dernières entrées — une ligne corrompue est
 *  sautée par `lireJournal`, et l'absence de fichier est une liste vide,
 *  jamais une erreur. Le Bearer est exigé par le middleware global. */
export function journalRoutes(deps: SidecarDeps): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    const entries = await lireJournal(deps.logsDir);
    return c.json({ entries });
  });

  return app;
}
