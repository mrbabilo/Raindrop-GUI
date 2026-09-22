// Link checker (§5.1) — HEAD puis GET sur 405/501, redirections suivies
// à la main (max 5, redirect: "manual"), timeout, 1 retry réseau.
// Classification : ok / redirect (chaîne + kind) / dead / indeterminate.

import type { LinkCheckResult, RedirectKind } from "../../shared/types.js";

export interface CheckerOptions {
  timeoutMs: number; // prod : 10_000
  concurrency: number; // prod : 6
  retry: number; // prod : 1 (erreurs réseau uniquement)
  maxRedirects?: number; // 5
}

export type CheckOutcome = Omit<LinkCheckResult, "raindropId" | "checkedAt">;

const MAX_REDIRECTS = 5;

async function request(
  url: string,
  method: "HEAD" | "GET",
  timeoutMs: number,
): Promise<{ kind: "response"; status: number; location: string | null } | { kind: "network"; reason: string }> {
  try {
    const res = await fetch(url, {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "RaindropGUI/0.1 (link check)" },
    });
    return { kind: "response", status: res.status, location: res.headers.get("location") };
  } catch (e) {
    return { kind: "network", reason: networkReason(e) };
  }
}

function networkReason(e: unknown): string {
  const err = e as {
    code?: string; name?: string;
    cause?: { code?: string; message?: string; errors?: { code?: string }[] };
  };
  if (err.name === "TimeoutError" || err.name === "AbortError") return "timeout";
  const cause = err.cause;
  // Multi-adresses (dual-stack) : cause est un AggregateError, le code vit
  // dans errors[0].
  const code = err.code ?? cause?.code ?? cause?.errors?.[0]?.code ?? "";
  if (code === "ABORT_ERR") return "timeout";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "dns";
  if (code === "ECONNREFUSED") return "conn_refused";
  // Node ≥18 (undici) bloque les ports réservés (« bad port », liste de la
  // spec Fetch) AVANT toute tentative TCP : pas de code d'erreur réseau, mais
  // pour l'utilisateur l'URL est injoignable au niveau connexion — même
  // raison que conn_refused (imposé par le test http://127.0.0.1:1).
  if (cause?.message === "bad port") return "conn_refused";
  return `net_${code || "error"}`;
}

/**
 * DOMAINE.md — « Lien mort : 4xx/5xx, DNS inexistant, timeout, connexion
 * refusée ». Tout AUTRE échec transport (reset, TLS, protocole, route) n'est
 * pas la preuve d'une mort : le serveur a parlé, ou c'est notre route qui a
 * faibli — protections anti-bot, certificats expirés ou auto-signés, HTTP/2
 * capricieux. Mesuré en réel le 2026-09-22 : 367 verdicts de cette famille
 * étaient classés « morts », dont un site actif signalé à l'usage
 * (net_ERR_HTTP2_STREAM_ERROR). Ces cas partent en `indeterminate` —
 * vérification manuelle — jamais en mort.
 */
export function verdictTransport(reason: string): "dead" | "indeterminate" {
  return reason === "dns" || reason === "conn_refused" || reason === "timeout"
    ? "dead"
    : "indeterminate";
}

/**
 * Reclassifie les verdicts des CACHES ANTÉRIEURS à la règle ci-dessus, à la
 * lecture — sans re-scan, même précédent que `filtrerGeneriques` pour les
 * groupes génériques (corriger l'algorithme ne suffit pas : l'écran devait
 * dire vrai tout de suite). Le stockage, lui, reste tel quel : un résultat
 * se récrit au prochain check de son URL (TTL).
 */
export function reclasseTransport(r: LinkCheckResult): LinkCheckResult {
  return r.status === "dead" && r.reason != null && r.reason.startsWith("net_")
    ? { ...r, status: "indeterminate" }
    : r;
}

export async function checkUrl(url: string, opts: Partial<CheckerOptions> = {}): Promise<CheckOutcome> {  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
  const retry = opts.retry ?? 1;

  const attempt = async (): Promise<CheckOutcome> => {
    const chain: string[] = [url];
    const redirectStatuses: number[] = [];
    let current = url;
    let method: "HEAD" | "GET" = "HEAD";
    while (true) {
      const res = await request(current, method, timeoutMs);
      if (res.kind === "network") {
        return {
          url, status: verdictTransport(res.reason), httpStatus: null,
          redirectChain: chain.length > 1 ? chain.slice(0, -1) : null,
          finalUrl: null, redirectKind: null, reason: res.reason,
        };
      }
      if (res.status >= 300 && res.status < 400) {
        const loc = res.location;
        if (!loc) {
          return { url, status: "dead", httpStatus: res.status, redirectChain: chain, finalUrl: null, redirectKind: null, reason: `http_${res.status}` };
        }
        if (redirectStatuses.length >= maxRedirects) {
          return { url, status: "dead", httpStatus: res.status, redirectChain: chain, finalUrl: null, redirectKind: null, reason: "redirect_loop" };
        }
        redirectStatuses.push(res.status);
        let nextStr: string;
        try {
          nextStr = new URL(loc, current).toString();
        } catch {
          // Location malformé (serveur hostile/cassé) → dead, jamais un crash du scan
          return { url, status: "dead", httpStatus: res.status, redirectChain: chain, finalUrl: null, redirectKind: null, reason: `http_${res.status}` };
        }
        chain.push(nextStr);
        current = nextStr;
        continue;
      }
      if ((res.status === 405 || res.status === 501) && method === "HEAD") {
        method = "GET"; // beaucoup de sites refusent HEAD (spec §5.1)
        continue;
      }
      return classify(res.status, chain, current, redirectStatuses);
    }
  };

  let result = await attempt();
  // 1 retry réseau (contrainte spec §5.1) : DNS, connexion refusée, erreurs
  // transport — PAS les timeouts (coût 2× timeout) ni les statuts HTTP.
  // Le verdict transport pouvant être indeterminate (règle DOMAINE), le
  // retry s'applique aux DEUX statuts — jamais aux 401/403/429, qui sont
  // indeterminate pour une tout autre raison (http_*).
  const retentable =
    result.reason != null &&
    (result.reason === "dns" || result.reason === "conn_refused" || result.reason.startsWith("net_"));
  if ((result.status === "dead" || result.status === "indeterminate") && retentable && retry > 0) {
    result = await attempt();
  }
  return result;
}

/**
 * Classification finale : `redirectChain` = URLs intermédiaires traversées
 * SANS l'URL finale ; 2xx au bout d'une chaîne → catégorie "redirect".
 */
function classify(
  status: number,
  chain: string[],
  finalUrl: string,
  redirectStatuses: number[],
): CheckOutcome {
  const redirected = chain.length > 1;
  const base = {
    url: chain[0]!,
    httpStatus: status,
    redirectChain: redirected ? chain.slice(0, -1) : null,
    finalUrl: redirected ? finalUrl : null,
    redirectKind: redirected ? redirectKindFor(redirectStatuses) : null,
    reason: null as string | null,
  };
  if (status >= 200 && status < 300) {
    return redirected
      ? { ...base, status: "redirect", reason: `http_${redirectStatuses[0]}` }
      : { ...base, status: "ok", reason: null };
  }
  if (status === 401 || status === 403 || status === 429) {
    return { ...base, status: "indeterminate", reason: `http_${status}` };
  }
  return { ...base, status: "dead", reason: `http_${status}` };
}

/** Type de redirect d'une chaîne : 301/308 = permanent, sinon temporaire. */
export function redirectKindFor(statuses: number[]): RedirectKind {
  return statuses.length > 0 && statuses.every((s) => s === 301 || s === 308)
    ? "permanent"
    : "temporary";
}

export async function checkAll(
  targets: { raindropId: number; url: string }[],
  opts: CheckerOptions & {
    /** Seam d'injection du check (tests) — défaut : checkUrl prod. */
    checkImpl?: (url: string) => Promise<CheckOutcome>;
    onUpdate(r: LinkCheckResult): void;
    isCancelled(): boolean;
  },
): Promise<{ stats: { checked: number; maxConcurrency: number } }> {
  const check = opts.checkImpl ?? ((url: string) => checkUrl(url, opts));
  const results: LinkCheckResult[] = [];
  let index = 0;
  let inFlight = 0;
  let maxConcurrency = 0;

  const worker = async () => {
    while (true) {
      if (opts.isCancelled()) return;
      const i = index++;
      if (i >= targets.length) return;
      inFlight++;
      maxConcurrency = Math.max(maxConcurrency, inFlight);
      try {
        const t = targets[i]!;
        const outcome = await check(t.url);
        const full: LinkCheckResult = { ...outcome, raindropId: t.raindropId, checkedAt: new Date().toISOString() };
        results.push(full);
        opts.onUpdate(full);
      } finally {
        inFlight--;
      }
    }
  };

  const workers = Array.from({ length: Math.min(opts.concurrency, targets.length) }, worker);
  await Promise.all(workers);
  return { stats: { checked: results.length, maxConcurrency } };
}
