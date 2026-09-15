/**
 * File séquentielle avec espacement minimum entre DÉBUTS d'appels.
 * 120 req/min autorisées par Raindrop → 550 ms ≈ 109 req/min (marge).
 * Le 429 HTTP est indétectable via MCP (aplati en "Error: ..." par le
 * package) : la protection est préventive, pas réactive (contrainte plan).
 */
export class Throttle {
  private queue: Promise<unknown> = Promise.resolve();
  private lastStart = 0;
  private _pending = 0;

  constructor(public readonly minIntervalMs: number) {}

  get pendingCount(): number {
    return this._pending;
  }

  run<T>(fn: () => Promise<T>): Promise<T> {
    this._pending++;
    const result = this.queue.then(async () => {
      const now = Date.now();
      const wait = Math.max(0, this.lastStart + this.minIntervalMs - now);
      if (wait > 0) await new Promise<void>((r) => setTimeout(r, wait));
      this.lastStart = Date.now();
      try {
        return await fn();
      } finally {
        this._pending--;
      }
    });
    // la file continue même si l'appel échoue
    this.queue = result.catch(() => undefined);
    return result as Promise<T>;
  }
}
