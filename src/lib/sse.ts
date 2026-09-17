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
    const lignes = block.split("\n");
    const eventLine = lignes.find((l) => l.startsWith("event: "));
    if (!eventLine) return;
    const kind = eventLine.slice(7).trim();
    if (kind === "ping") return; // heartbeat du sidecar (15 s), pas un event
    // Protocole SSE : plusieurs lignes `data:` se joignent par \n — un JSON
    // éclaté sur deux lignes se reconstitue entier, il n'était que tronqué.
    const data = lignes.filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("\n") || null;
    let parsed: unknown = data;
    try { parsed = JSON.parse(String(data)); } catch { /* data brut */ }
    handlers.onEvent({ kind, ...(typeof parsed === "object" && parsed ? parsed : {}) });
    if (kind === "done" || kind === "error" || kind === "cancelled") handlers.onDone();
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    // CRLF normalisé en LF AVANT la découpe : chercher \n\n laisse passer
    // des blocs finissant \r\n\r\n, jamais coupés — le flux entier se
    // taisait si l'émetteur changeait de convention de fin de ligne.
    buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      handle(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 2);
    }
  }
}
