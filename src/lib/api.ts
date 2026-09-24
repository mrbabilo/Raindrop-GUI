import { getConnection } from "./connection";
import { t } from "../i18n/fr";
import type { ErrorCode } from "../../shared/errors";

/** `message` est ce que l'écran affiche ; `detail`, le texte d'origine. */
export class ApiError extends Error {
  constructor(public code: ErrorCode, public status: number, message: string, public detail = message) {
    super(message);
  }
}

// L'écran affichait le message TECHNIQUE tel quel (« Error: failed to update
// raindrop », « Load failed »). §10 : une erreur dit ce qui s'est passé et
// comment le corriger — les codes du pont reçoivent leur phrase ; les
// messages que le sidecar rédige lui-même (INVALID_INPUT, SCAN_EN_COURS,
// archives…) passent tels quels (audit UX du 2026-09-23).
function humain(code: ErrorCode, brut: string, sansCorps: boolean): string {
  if (sansCorps) return t("erreur.inattendue", { detail: brut });
  if (code === "MCP_TIMEOUT") return t("erreur.delaiRaindrop");
  if (code === "RATE_LIMITED") return t("erreur.quota");
  if (code === "MCP_CRASHED") return t("erreur.pont");
  if (code === "RAINDROP_API") return t("erreur.refus", { detail: brut.replace(/^Error:\s*/, "") });
  return brut;
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
  }).catch((e: unknown) => {
    // Rien n'a répondu : WebKit dit « Load failed », le délai « The operation
    // timed out » — ni l'un ni l'autre ne dit quoi faire. Une annulation
    // VOLONTAIRE (AbortError) remonte intacte : ses appelants la taisent.
    if (e instanceof DOMException && e.name === "TimeoutError") throw new Error(t("erreur.delaiLocal"), { cause: e });
    if (e instanceof TypeError) throw new Error(t("erreur.injoignable"), { cause: e });
    throw e;
  });
  if (!res.ok) {
    let code: ErrorCode = "RAINDROP_API";
    let message = `http ${res.status}`;
    let sansCorps = true;
    try {
      const j = (await res.json()) as { error?: { code?: ErrorCode; message?: string } };
      sansCorps = j.error === undefined;
      if (j.error?.code) code = j.error.code;
      if (j.error?.message) message = j.error.message;
    } catch { /* corps non JSON */ }
    throw new ApiError(code, res.status, humain(code, message, sansCorps), message);
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path + qs(query)),
  send: <T>(method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown) => request<T>(method, path, body),
};
