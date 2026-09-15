import type { McpLifecycle } from "../mcp/lifecycle.js";
import type { Throttle } from "../mcp/throttle.js";
import type { CallOutcome } from "../../shared/errors.js";
import type { JobStore } from "../jobs/store.js"; // Task 10

export interface SidecarDeps {
  /** Appel tool MCP throttled (espacement 550 ms en prod). */
  mcp: (
    tool: string,
    args: Record<string, unknown>,
    timeoutMs?: number,
  ) => Promise<CallOutcome<unknown>>;
  state: () => import("../mcp/lifecycle.js").LifecycleState;
  restart: () => Promise<void>;
  jobs: JobStore;
}

export function makeMcpCaller(lifecycle: McpLifecycle, throttle: Throttle): SidecarDeps["mcp"] {
  return (tool, args, timeoutMs) => throttle.run(() => lifecycle.call(tool, args, timeoutMs));
}
