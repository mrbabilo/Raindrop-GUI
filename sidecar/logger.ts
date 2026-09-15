import { appendFile, mkdir, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";

export interface Logger {
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  close(): Promise<void>;
}

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof LEVELS;

export function createLogger(
  logsDir: string,
  opts: { level?: Level; retentionDays?: number; now?: () => Date } = {},
): Logger {
  const level = LEVELS[opts.level ?? "info"];
  const now = opts.now ?? (() => new Date());
  const pending: Promise<unknown>[] = [];

  const fileFor = (d: Date) => {
    const ymd = d.toISOString().slice(0, 10);
    return join(logsDir, `sidecar-${ymd}.jsonl`);
  };

  const write = (lvl: Level, msg: string, fields?: Record<string, unknown>) => {
    if (LEVELS[lvl] < level) return;
    const entry = JSON.stringify({ ts: now().toISOString(), level: lvl, msg, ...fields });
    pending.push(appendFile(fileFor(now()), `${entry}\n`, "utf8").catch(() => undefined));
  };

  // rotation : purge des logs > 7 jours (async, sans bloquer)
  const retentionDays = opts.retentionDays ?? 7;
  void (async () => {
    try {
      await mkdir(logsDir, { recursive: true });
      const cutoff = Date.now() - retentionDays * 864e5;
      for (const f of await readdir(logsDir)) {
        const m = /^sidecar-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(f);
        if (m && new Date(`${m[1]}T00:00:00Z`).getTime() < cutoff) {
          await unlink(join(logsDir, f)).catch(() => undefined);
        }
      }
    } catch {
      // logs non critiques
    }
  })();

  return {
    info: (m, f) => write("info", m, f),
    warn: (m, f) => write("warn", m, f),
    error: (m, f) => write("error", m, f),
    close: async () => {
      await Promise.allSettled(pending);
    },
  };
}
