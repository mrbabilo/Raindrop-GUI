//! Les dépôts EN MASSE venus du glisser-déposer (2026-09-20) : la corbeille
//! et le marquage par étiquette.
//!
//! Un item à la fois, dans l'ordre, sous la file partagée (550 ms) — le
//! motif `dedupe`, synchrone : une sélection tirée à la main compte quelques
//! items, jamais cinq cents.
//!
//! La corbeille LIT l'origine de chaque item (§4.2 — la corbeille Raindrop
//! ne la garde pas) : la sélection tirée ne la transporte pas, et la
//! restauration à l'origine ne doit jamais se dégrader en « inconnue ».
//!
//! L'étiquette pose SEULEMENT l'union : le bulk update de Raindrop REMPLACE
//! les étiquettes — poser « rust » ne doit jamais effacer « python ».

import type { CallOutcome } from "../../shared/errors.js";
import type { OriginStore } from "./origins.js";
import { unionEtiquettes } from "./dedupe.js";

type Mcp = (tool: string, args: Record<string, unknown>) => Promise<CallOutcome<unknown>>;

/** Le journal, minimal et structurel : `SidecarDeps["journal"]` (api/deps)
 *  satisfait cette forme — et trash ne dépend pas d'api (le cycle à éviter). */
export interface PetitJournal {
  info(msg: string, champs?: Record<string, unknown>): void;
  warn(msg: string, champs?: Record<string, unknown>): void;
  error(msg: string, champs?: Record<string, unknown>): void;
}

export interface DepsBulk {
  mcp: Mcp;
  origins: OriginStore;
  journal: PetitJournal;
}

export interface EchecItem {
  id: number;
  raison: string;
}

/** Met à la corbeille les identifiants donnés, un par un. Ce qui est écrit
 *  reste acquis : un échec n'annule jamais les précédents. */
export async function corbeilleEnMasse(
  deps: DepsBulk,
  ids: number[],
): Promise<{ corbeille: number; echecs: EchecItem[] }> {
  const r = { corbeille: 0, echecs: [] as EchecItem[] };
  for (const id of ids) {
    const lu = await deps.mcp("get_raindrop", { id });
    if (!lu.ok) {
      r.echecs.push({ id, raison: lu.message });
      continue;
    }
    const cid = (lu.data as { collection?: { $id?: number } }).collection?.$id ?? -1;
    await deps.origins.remember(id, cid);
    const supprime = await deps.mcp("delete_raindrop", { id });
    if (supprime.ok) r.corbeille++;
    else r.echecs.push({ id, raison: supprime.message });
  }
  deps.journal.info("corbeille en masse", { corbeille: r.corbeille, echecs: r.echecs.length });
  return r;
}

/** Marque les identifiants donnés avec l'étiquette — l'union SEULE, jamais
 *  le remplacement. Une étiquette déjà posée (casse ignorée) ne coûte aucune
 *  écriture : jamais retentées (trap §Traps), les écritures se méritent. */
export async function marquerEtiquette(
  deps: DepsBulk,
  ids: number[],
  tag: string,
): Promise<{ marques: number; deja: number; echecs: EchecItem[] }> {
  const r = { marques: 0, deja: 0, echecs: [] as EchecItem[] };
  for (const id of ids) {
    const lu = await deps.mcp("get_raindrop", { id });
    if (!lu.ok) {
      r.echecs.push({ id, raison: lu.message });
      continue;
    }
    const tags = ((lu.data as { tags?: string[] }).tags ?? []) as string[];
    const union = unionEtiquettes(tags, [tag]);
    if (union.length === tags.length) {
      r.deja++;
      continue;
    }
    const pose = await deps.mcp("update_raindrop", { id, tags: union });
    if (pose.ok) r.marques++;
    else r.echecs.push({ id, raison: pose.message });
  }
  deps.journal.info("étiquette en masse", { tag, marques: r.marques, deja: r.deja });
  return r;
}
