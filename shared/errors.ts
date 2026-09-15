import type { Context } from "hono";

export type ErrorCode =
  | "MCP_TIMEOUT"
  | "MCP_CRASHED"
  | "RATE_LIMITED"
  | "RAINDROP_API"
  | "INVALID_INPUT";

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; tool?: string };
}

const STATUS_BY_CODE: Record<ErrorCode, 400 | 429 | 502 | 503 | 504> = {
  INVALID_INPUT: 400,
  RATE_LIMITED: 429,
  RAINDROP_API: 502,
  MCP_CRASHED: 503,
  MCP_TIMEOUT: 504,
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
  return c.json(body, errorStatus(code) as 400 | 429 | 502 | 503 | 504);
}
