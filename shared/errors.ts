import type { Context } from "hono";

export type ErrorCode =
  | "MCP_TIMEOUT"
  | "MCP_CRASHED"
  | "RATE_LIMITED"
  | "RAINDROP_API"
  | "INVALID_INPUT"
  | "SCAN_EN_COURS"
  | "ARCHIVE_ABSENTE" // spec lecture §5 : l'archive a disparu entre le marqueur et le clic
  | "ARCHIVE_TROP_VOLUMINEUSE" // garde de décompression 64 Mo (spec lecture §3)
  | "ARCHIVE_ILLISIBLE" // gzip défectueux : les contrôles à froid n'ont pas tout attrapé
  | "NOT_FOUND" // ressource locale inconnue (ex. id de smart list) — v1 : seules les smart lists l'émettent
  | "STOCKAGE"; // le dépôt local (app-data) n'a pas pu être écrit — la mémoire de l'utilisateur se signale, jamais un succès inventé

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; tool?: string };
}

const STATUS_BY_CODE: Record<ErrorCode, 400 | 404 | 409 | 413 | 429 | 500 | 502 | 503 | 504> = {
  INVALID_INPUT: 400,
  SCAN_EN_COURS: 409,
  RATE_LIMITED: 429,
  RAINDROP_API: 502,
  MCP_CRASHED: 503,
  MCP_TIMEOUT: 504,
  ARCHIVE_ABSENTE: 404,
  ARCHIVE_TROP_VOLUMINEUSE: 413,
  ARCHIVE_ILLISIBLE: 500,
  NOT_FOUND: 404,
  STOCKAGE: 500,
};

export function errorStatus(code: ErrorCode): number {
  return STATUS_BY_CODE[code];
}

/** Résultat typé d'un appel tool MCP (succès métier ou erreur classée). */
export type CallOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; message: string; tool?: string };

/** Réponse HTTP d'erreur uniforme `{error:{code,message,tool?}}`. */
export function apiError(
  c: Context,
  code: ErrorCode,
  message: string,
  tool?: string,
): Response {
  const body: ApiErrorBody = { error: { code, message, ...(tool ? { tool } : {}) } };
  return c.json(body, errorStatus(code) as 400 | 404 | 409 | 413 | 429 | 500 | 502 | 503 | 504);
}
