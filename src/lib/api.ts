import { getConnection } from "./connection";
import type { ErrorCode } from "../../shared/errors";

export class ApiError extends Error {
  constructor(public code: ErrorCode, public status: number, message: string) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | readonly string[] | undefined>;

// Un TABLEAU se répète (`?tags=a&tags=b`), il ne se joint pas : `String([...])`
// rendrait « a,b » — une seule valeur, silencieusement, pour une étiquette qui
// porterait une virgule. Un tableau VIDE n'émet rien : c'est l'absence de
// filtre, et non un filtre sur rien.
function qs(query?: Query): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined) continue;
    if (Array.isArray(v)) for (const item of v) p.append(k, item);
    else p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { baseUrl, token } = getConnection();
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(70_000), // pire-cas lecture MCP : 2×timeout + retry 2 s (contrainte plan 2)
  });
  if (!res.ok) {
    let code: ErrorCode = "RAINDROP_API";
    let message = `http ${res.status}`;
    try {
      const j = (await res.json()) as { error?: { code?: ErrorCode; message?: string } };
      if (j.error?.code) code = j.error.code;
      if (j.error?.message) message = j.error.message;
    } catch { /* corps non JSON */ }
    throw new ApiError(code, res.status, message);
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path + qs(query)),
  send: <T>(method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown) => request<T>(method, path, body),
};
