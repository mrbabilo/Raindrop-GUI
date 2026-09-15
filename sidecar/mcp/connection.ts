import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { CallOutcome } from "../../shared/errors.js";

export interface McpTransportFactory {
  create(): Promise<Transport>;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** Erreur métier renvoyée par le package MCP (texte préfixé « Error: »). */
class ToolError extends Error {}

function parseToolText(text: string): unknown {
  if (text.startsWith("Error: ")) throw new ToolError(text.slice("Error: ".length));
  return JSON.parse(text);
}

export class McpConnection {
  private transport: Transport | null = null;
  private closed = false;
  private constructor(private client: Client) {}

  /** Connexion vers un transport arbitraire (prod : stdio, test : injecté). */
  static async connect(
    factory: McpTransportFactory,
    opts?: { timeoutMs?: number },
  ): Promise<McpConnection> {
    const client = new Client({ name: "raindrop-gui-sidecar", version: "0.1.0" });
    const transport = await factory.create();
    await client.connect(transport);
    const conn = new McpConnection(client);
    conn.transport = transport;
    void opts; // le timeout est par appel (call())
    return conn;
  }

  /** Test helper : enveloppe un client déjà connecté (paire InMemory). */
  static fromClient(client: Client): McpConnection {
    const conn = new McpConnection(client);
    conn.transport = client.transport ?? null;
    return conn;
  }

  async call<T>(
    tool: string,
    args: Record<string, unknown>,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<CallOutcome<T>> {
    try {
      const result = await this.client.callTool(
        { name: tool, arguments: args },
        undefined,
        { timeout: timeoutMs },
      );
      if ("toolResult" in result) {
        // SDK ≥1.30 : union CallToolResult | CompatibilityCallToolResult —
        // la variante « toolResult » (tâches) n'arrive jamais ici.
        return { ok: false, code: "RAINDROP_API", message: `réponse invalide du tool ${tool}`, tool };
      }
      const block = result.content?.[0];
      if (result.isError || !block || block.type !== "text") {
        return { ok: false, code: "RAINDROP_API", message: `réponse invalide du tool ${tool}`, tool };
      }
      const data = parseToolText(block.text);
      return { ok: true, data: data as T };
    } catch (e) {
      return classifyError(e, tool);
    }
  }

  /** Notification de mort du transport (crash subprocess) — consommé par McpLifecycle. */
  onClose(cb: () => void): void {
    if (!this.transport) return;
    const prev = this.transport.onclose;
    this.transport.onclose = () => {
      prev?.(); // laisse le SDK marquer le client déconnecté
      if (!this.closed) cb(); // un close() gracieux n'est pas un crash
    };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.client.close();
  }
}

function classifyError(e: unknown, tool: string): CallOutcome<never> {
  if (e instanceof ToolError) {
    return { ok: false, code: "RAINDROP_API", message: e.message, tool };
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (/timed out|timeout/i.test(msg)) {
    return { ok: false, code: "MCP_TIMEOUT", message: msg, tool };
  }
  if (/closed|not connected/i.test(msg)) {
    return { ok: false, code: "MCP_CRASHED", message: msg, tool };
  }
  return { ok: false, code: "MCP_CRASHED", message: msg, tool };
}

/** Factory prod : stdio vers le package épinglé. Token passé par env. */
export function stdioFactory(mcpEntryPath: string, token: string): McpTransportFactory {
  return {
    create: async () =>
      new StdioClientTransport({
        command: process.execPath,
        args: [mcpEntryPath],
        env: { ...process.env, MCP_RAINDROPIO_TOKEN: token } as Record<string, string>,
        stderr: "pipe",
      }),
  };
}
