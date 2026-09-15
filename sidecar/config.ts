import { z } from "zod";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const envSchema = z.object({
  MCP_RAINDROPIO_TOKEN: z.string().min(1, "token Raindrop requis"),
  LOCAL_API_TOKEN: z.string().min(1).default("dev-local-token"),
  APPDATA_DIR: z.string().optional(),
  RAINDROP_MCP_ENTRY: z
    .string()
    .default(
      fileURLToPath(new URL("../node_modules/@kud/mcp-raindrop-io/dist/index.js", import.meta.url)),
    ),
  MCP_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  MIN_CALL_INTERVAL_MS: z.coerce.number().int().positive().default(550),
  LINK_CONCURRENCY: z.coerce.number().int().positive().default(6),
  LINK_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  ANALYSIS_TTL_DAYS: z.coerce.number().int().positive().default(30),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const msg = z.prettifyError(parsed.error);
    throw new Error(`configuration invalide — ${msg}`);
  }
  return parsed.data;
}

export function appDataDir(cfg: Config): string {
  return cfg.APPDATA_DIR ?? join(homedir(), "Library", "Application Support", "Raindrop-GUI");
}
