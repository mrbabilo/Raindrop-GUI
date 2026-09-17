import { getConnection } from "./connection";

// Suit le flux SSE d'un job (GET /api/jobs/:id/events, posé plan 1). Chaque
// bloc `event:`/`data:` est dispatché à onEvent ; onDone signale la fin
// métier (done|error|cancelled). Résout à la fermeture du flux, rejette sur
// réponse d'erreur ou corps absent — et sur abort via le rejet du fetch.
export async function jobEvents(
  jobId: string,
  handlers: { onEvent(evt: { kind: string; [k: string]: unknown }): void; onDone(): void },
  signal: AbortSignal,
): Promise<void> {
  const { baseUrl, token } = getConnection();
  const res = await fetch(`${baseUrl}/api/jobs/${jobId}/events`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!res.ok) throw new Error(`flux SSE du job ${jobId} : http ${res.status}`);
  // Résolution 3 : le body peut être null si le flux est interrompu en route
  // (proxy…) — erreur propre à l'appelant, jamais d'assertion non nulle.
  if (!res.body) throw new Error(`flux SSE du job ${jobId} : corps absent`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const handle = (block: string) => {
    const eventLine = block.split("\n").find((l) => l.startsWith("event: "));
    const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
    if (!eventLine) return;
    const kind = eventLine.slice(7).trim();
    if (kind === "ping") return; // heartbeat du sidecar (15 s), pas un event
    let data: unknown = dataLine ? dataLine.slice(6) : null;
    try { data = JSON.parse(String(data)); } catch { /* data brut */ }
    handlers.onEvent({ kind, ...(typeof data === "object" && data ? data : {}) });
    if (kind === "done" || kind === "error" || kind === "cancelled") handlers.onDone();
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      handle(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 2);
    }
  }
}
