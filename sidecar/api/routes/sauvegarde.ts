import { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../../shared/errors.js";
import type { SidecarDeps } from "../deps.js";
import { runJob } from "../../jobs/store.js";

/** Sans dossier configuré, la sauvegarde est INACTIVE — et le dit. Ce n'est
 *  pas une panne : le sélecteur de dossier relève du shell Tauri (§4.3), et
 *  d'ici là l'absence de dossier est l'état normal du premier lancement. */
const INACTIVE = "aucun dossier de sauvegarde configuré (BACKUP_DIR) — la sauvegarde est inactive";

export function sauvegardeRoutes(deps: SidecarDeps): Hono {
  const app = new Hono();

  // Les routes sont montées MÊME sans dossier configuré : un 404 serait le
  // silence que §6 interdit, pas un état explicite.
  app.post("/run", async (c) => {
    const body = z
      .object({ mode: z.enum(["complet", "incremental"]) })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", "mode ∈ {complet, incremental}");
    const sauvegarde = deps.sauvegarde;
    if (!sauvegarde) return apiError(c, "INVALID_INPUT", INACTIVE);
    // Comme `/api/analysis/scan` refuse un second scan concurrent : deux
    // balayages en vol se marcheraient dessus (même horodatage, même fichier)
    // et doubleraient la charge contre le plafond de 120 requêtes/min.
    if (sauvegarde.enCours()) return apiError(c, "INVALID_INPUT", "une sauvegarde est déjà en cours");
    // Même infrastructure que les scans (`sidecar/jobs/`) : progression et
    // annulation par SSE sur /api/jobs/:id/events.
    const job = runJob(deps.jobs, "backup", 0, (j) => sauvegarde.executer(body.data.mode, j));
    return c.json({ jobId: job.id }, 202);
  });

  app.get("/status", async (c) => {
    if (!deps.sauvegarde) return c.json({ actif: false, raison: INACTIVE });
    return c.json(await deps.sauvegarde.statut());
  });

  return app;
}
