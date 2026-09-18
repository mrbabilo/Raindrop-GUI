import type { McpLifecycle } from "../mcp/lifecycle.js";
import type { Throttle } from "../mcp/throttle.js";
import type { CallOutcome } from "../../shared/errors.js";
import type { JobStore } from "../jobs/store.js"; // Task 10
import type { AnalysisCache } from "../analysis/cache.js"; // Task 13
import type { Scanner } from "../analysis/scanner.js"; // Task 14
import type { OriginStore } from "../trash/origins.js"; // Task 0b
import type { Sauvegarde } from "../backup/sauvegarde.js";

export interface SidecarDeps {
  /** Appel tool MCP throttled (espacement 550 ms en prod). */
  mcp: (
    tool: string,
    args: Record<string, unknown>,
    timeoutMs?: number,
  ) => Promise<CallOutcome<unknown>>;
  state: () => import("../mcp/lifecycle.js").LifecycleState;
  restart: () => Promise<void>;
  jobs: JobStore; // Task 10
  /** Cache d'analyse (Task 13). */
  cache: AnalysisCache;
  /** Scanner local (Task 14). */
  scanner: Scanner;
  /** Mémoire des origines de corbeille (Task 0b, décision spec §4.2). */
  origins: OriginStore;
  /** Sauvegarde locale — ABSENTE tant que `BACKUP_DIR` n'est pas
   *  configuré : la sauvegarde est alors inactive, et la route le dit. */
  sauvegarde?: Sauvegarde;
  /** Appels REST directs Raindrop — Task 8 (contournement : update_raindrop
   *  MCP v1.3.1 n'expose pas `url` ; unrestore — MCP n'expose pas la
   *  restauration, Task 0b). Throttled en prod comme les appels MCP. */
  direct: {
    updateRaindropUrl(id: number, url: string): Promise<CallOutcome<{ id: number }>>;
    /** Destination OBLIGATOIRE : la route /unrestore résout l'origine. */
    unrestore(ids: number[], toCollectionId: number): Promise<CallOutcome<{ restored: number }>>;
  };
}

/** Tools en LECTURE seule — seuls autorisés à être rejoués (jamais les
 *  écritures : un retry de create/edit/double risquerait un doublon). */
const READ_TOOLS = new Set([
  "search_raindrops", "get_raindrop", "get_collections", "get_child_collections",
  "get_collection", "get_tags", "get_highlights", "get_user", "parse_url", "check_urls_exist",
]);

/**
 * Appel tool MCP avec :
 * - timeout par appel (opts.timeoutMs, défaut 30 s — MCP_TIMEOUT_MS), overridable
 *   par appel (le paramètre timeoutMs du caller reste prioritaire) ;
 * - retry UNIQUE après opts.retryDelayMs (défaut 2 000 ms) sur échec
 *   RAINDROP_API d'un tool de lecture — le 429 est indétectable via MCP, cette
 *   relance est la face réactive du rate limiting (jamais sur les écritures).
 * Le résultat du retry est retourné tel quel (ok ou ko).
 */
export function makeMcpCaller(
  lifecycle: McpLifecycle,
  throttle: Throttle,
  opts?: { timeoutMs?: number; retryDelayMs?: number },
): SidecarDeps["mcp"] {
  const defaultTimeoutMs = opts?.timeoutMs ?? 30_000;
  const retryDelayMs = opts?.retryDelayMs ?? 2_000;
  return (tool, args, timeoutMs) =>
    throttle.run(() => lifecycle.call(tool, args, timeoutMs ?? defaultTimeoutMs)).then((first) => {
      if (!(!first.ok && first.code === "RAINDROP_API" && READ_TOOLS.has(tool))) return first;
      return new Promise((r) => setTimeout(r, retryDelayMs)).then(() =>
        throttle.run(() => lifecycle.call(tool, args, timeoutMs ?? defaultTimeoutMs)),
      );
    });
}
