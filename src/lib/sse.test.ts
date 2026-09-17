import { describe, it, expect, vi, afterEach } from "vitest";
import { jobEvents } from "./sse";

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let sent = 0;
  return new Response(new ReadableStream({
    pull(controller) {
      if (sent < chunks.length) controller.enqueue(encoder.encode(chunks[sent++]));
      else controller.close();
    },
  }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("jobEvents", () => {
  it("parse les events SSE et termine sur done", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([
      'event: progress\ndata: {"done":1,"total":2}\n\n',
      'event: done\ndata: {"checked":2}\n\n',
    ])));
    const events: string[] = [];
    await jobEvents("job-1", { onEvent: (e) => events.push(e.kind), onDone: () => undefined }, new AbortController().signal);
    expect(events).toEqual(["progress", "done"]);
  });

  it("ignore les pings, traverse le data brut et termine sur cancelled", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([
      "event: ping\ndata: 1697000000000\n\n",
      "event: progress\ndata: pas-du-json\n\n",
      "event: cancelled\n\n",
    ])));
    const events: { kind: string; [k: string]: unknown }[] = [];
    let finished = false;
    await jobEvents("job-1", { onEvent: (e) => events.push(e), onDone: () => { finished = true; } }, new AbortController().signal);
    expect(events).toEqual([{ kind: "progress" }, { kind: "cancelled" }]);
    expect(finished).toBe(true);
  });

  // Résolution 3 : le body peut être null (flux interrompu par un proxy) —
  // erreur propre rejetée à l'appelant, jamais d'assertion non nulle.
  it("rejette proprement quand le corps de la réponse est absent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    await expect(
      jobEvents("job-1", { onEvent: () => undefined, onDone: () => undefined }, new AbortController().signal),
    ).rejects.toThrow(/corps absent/);
  });

  it("rejette sur une réponse d'erreur (job inconnu)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { code: "INVALID_INPUT", message: "job inconnu" } }), { status: 404 })),
    );
    await expect(
      jobEvents("job-1", { onEvent: () => undefined, onDone: () => undefined }, new AbortController().signal),
    ).rejects.toThrow(/404/);
  });

  // Le protocole SSE permet les fins de ligne CRLF et les blocs data en
  // plusieurs lignes. Le sidecar n'émet ni l'un ni l'autre aujourd'hui —
  // mais un proxy local ou une réécriture de l'émission pourrait le faire,
  // et le parseur ne disait alors RIEN (blocs jamais coupés) ou tronquait
  // le data silencieusement.
  it("tient les fins de ligne CRLF", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([
      'event: progress\r\ndata: {"done":1}\r\n\r\n',
      'event: done\r\ndata: {}\r\n\r\n',
    ])));
    const events: string[] = [];
    await jobEvents("job-1", { onEvent: (e) => events.push(e.kind), onDone: () => undefined }, new AbortController().signal);
    expect(events).toEqual(["progress", "done"]);
  });

  it("joint les lignes data multi-lignes (protocole SSE : séparées par \\n)", async () => {
    // JSON.stringify indenté éclate le JSON sur plusieurs lignes : en SSE,
    // CHAQUE ligne devient son propre `data: ` et le protocole les joint
    // par \n.
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([
      'event: progress\ndata: {\ndata:  "done": 1,\ndata:  "total": 2\ndata: }\n\n',
      'event: done\n\n',
    ])));
    const events: { kind: string; [k: string]: unknown }[] = [];
    await jobEvents("job-1", { onEvent: (e) => events.push(e), onDone: () => undefined }, new AbortController().signal);
    // Le JSON éclaté sur quatre lignes `data:` se reconstitue entier.
    expect(events[0]).toEqual({ kind: "progress", done: 1, total: 2 });
  });
});
