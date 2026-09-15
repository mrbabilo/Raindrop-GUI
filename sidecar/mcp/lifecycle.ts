import { EventEmitter } from "node:events";
import { McpConnection } from "./connection.js";
import type { McpTransportFactory } from "./connection.js";
import type { CallOutcome } from "../../shared/errors.js";

export type LifecycleState = "starting" | "connected" | "restarting" | "crashed" | "stopped";

export interface LifecycleEvents {
  state: (state: LifecycleState) => void;
}

export class McpLifecycle {
  private conn: McpConnection | null = null;
  private _state: LifecycleState = "stopped";
  private emitter = new EventEmitter();
  private restartsLeft: number;
  private stopping = false;
  private readonly maxRestarts: number;
  private readonly restartBackoffMs: number;
  private readonly factory: McpTransportFactory;
  private connectedSince = 0;
  private readonly stableMs = 60_000;

  constructor(opts: {
    factory: McpTransportFactory;
    maxRestarts?: number;
    restartBackoffMs?: number;
  }) {
    this.maxRestarts = opts.maxRestarts ?? 3;
    this.restartsLeft = this.maxRestarts;
    this.restartBackoffMs = opts.restartBackoffMs ?? 1000;
    this.factory = opts.factory;
  }

  get state(): LifecycleState {
    return this._state;
  }

  on<K extends keyof LifecycleEvents>(event: K, listener: LifecycleEvents[K]): void {
    this.emitter.on(event, listener);
  }

  private setState(s: LifecycleState): void {
    this._state = s;
    this.emitter.emit("state", s);
  }

  async start(): Promise<void> {
    this.stopping = false;
    this.setState("starting");
    try {
      await this.connectOnce();
    } catch (e) {
      // Adaptation brief : l'échec initial traverse la même chaîne de relance
      // qu'un crash (quota maxRestarts, backoff) puis l'état finit « crashed » ;
      // l'erreur remonte quand même à l'appelant (start rejette).
      await this.autoRestart();
      throw e;
    }
  }

  private async connectOnce(): Promise<void> {
    await this.conn?.close().catch(() => undefined);
    this.conn = await McpConnection.connect(this.factory);
    // Health-check : le handshake initialize du subprocess a réussi.
    this.markConnected();
    // Surveiller la mort de la connexion : onclose du transport (déjà câblé
    // par McpConnection.onClose — un close() gracieux ne déclenche pas le cb).
    this.conn.onClose(() => this.handleClose());
  }

  private markConnected(): void {
    this.connectedSince = Date.now();
    this.setState("connected");
  }

  private handleClose(): void {
    if (this.stopping || this._state === "restarting" || this._state === "crashed" || this._state === "stopped")
      return;
    // connexion stable > 60 s : on repart sur un quota complet de restarts
    if (Date.now() - this.connectedSince > this.stableMs) this.restartsLeft = this.maxRestarts;
    void this.autoRestart();
  }

  private async autoRestart(): Promise<void> {
    if (this.restartsLeft <= 0) {
      this.setState("crashed");
      return;
    }
    this.restartsLeft--;
    this.setState("restarting");
    const delay = this.restartBackoffMs * 2 ** (this.maxRestarts - this.restartsLeft - 1);
    await new Promise((r) => setTimeout(r, delay));
    if (this.stopping) return;
    try {
      await this.connectOnce();
    } catch {
      await this.autoRestart();
    }
  }

  /** Redémarrage manuel (bouton UI) : quota d'échecs remis à zéro. */
  async restart(): Promise<void> {
    this.stopping = false;
    this.restartsLeft = this.maxRestarts;
    this.setState("restarting");
    try {
      await this.connectOnce();
    } catch (e) {
      this.setState("crashed");
      throw e;
    }
  }

  async call<T>(
    tool: string,
    args: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<CallOutcome<T>> {
    if (this._state !== "connected" || !this.conn) {
      return {
        ok: false,
        code: "MCP_CRASHED",
        message: `MCP indisponible (état: ${this._state})`,
        tool,
      };
    }
    return this.conn.call<T>(tool, args, timeoutMs);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.setState("stopped");
    await this.conn?.close().catch(() => undefined);
    this.conn = null;
  }
}
