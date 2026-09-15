import type { McpLifecycle } from "../mcp/lifecycle.js";
import type { Throttle } from "../mcp/throttle.js";
import type { CallOutcome } from "../../shared/errors.js";
import type { JobStore } from "../jobs/store.js"; // Task 10
import type { AnalysisType } from "../../shared/types.js";

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
  /** Cache d'analyse — AnalysisCache arrive en Task 13 (stub typé unknown d'ici là). */
  cache: unknown;
  /** Scanner local — Task 14 (impl. réelle à venir). */
  scanner: { startScan(type: AnalysisType): string; isRunning(type: AnalysisType): boolean };
  /** Appels REST directs Raindrop — Task 8 (contournement : update_raindrop
   *  MCP v1.3.1 n'expose pas `url`). */
  direct: { updateRaindropUrl(id: number, url: string): Promise<CallOutcome<{ id: number }>> };
}

export function makeMcpCaller(lifecycle: McpLifecycle, throttle: Throttle): SidecarDeps["mcp"] {
  return (tool, args, timeoutMs) => throttle.run(() => lifecycle.call(tool, args, timeoutMs));
}
