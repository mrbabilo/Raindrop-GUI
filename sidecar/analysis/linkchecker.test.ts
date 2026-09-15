import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTargetServer } from "../testing/targetServer.js";
import { checkUrl, checkAll } from "./linkchecker.js";

let port: number;
let close: () => Promise<void>;
const u = (p: string) => `http://127.0.0.1:${port}${p}`;

beforeAll(async () => {
  const s = await startTargetServer();
  port = s.port;
  close = s.close;
});
afterAll(async () => close());

const fast = { timeoutMs: 200, concurrency: 6, retry: 1 };

describe("checkUrl", () => {
  it("200 → ok", async () => {
    const r = await checkUrl(u("/ok"), fast);
    expect(r.status).toBe("ok");
    expect(r.httpStatus).toBe(200);
  });

  it("301 → redirect permanent avec chaîne et URL finale", async () => {
    const r = await checkUrl(u("/moved"), fast);
    expect(r.status).toBe("redirect");
    expect(r.redirectKind).toBe("permanent");
    expect(r.finalUrl).toBe(u("/final"));
    expect(r.redirectChain).toEqual([u("/moved")]);
  });

  it("302 → redirect temporaire", async () => {
    const r = await checkUrl(u("/temp"), fast);
    expect(r.status).toBe("redirect");
    expect(r.redirectKind).toBe("temporary");
  });

  it("chaîne 301→301→200 → redirect permanent, chaîne complète", async () => {
    const r = await checkUrl(u("/chain"), fast);
    expect(r.status).toBe("redirect");
    expect(r.redirectChain).toEqual([u("/chain"), u("/moved")]);
    expect(r.finalUrl).toBe(u("/final"));
  });

  it("404 → dead (http_404)", async () => {
    expect((await checkUrl(u("/notfound"), fast)).status).toBe("dead");
  });

  it("403 → indeterminate", async () => {
    const r = await checkUrl(u("/forbidden"), fast);
    expect(r.status).toBe("indeterminate");
    expect(r.reason).toBe("http_403");
  });

  it("429 → indeterminate", async () => {
    expect((await checkUrl(u("/rate-limit"), fast)).status).toBe("indeterminate");
  });

  it("405 en HEAD → retente en GET → ok", async () => {
    const r = await checkUrl(u("/method"), fast);
    expect(r.status).toBe("ok");
  });

  it("redirection vers 404 → classification FINALE dead", async () => {
    const r = await checkUrl(u("/redirect-to-404"), fast);
    expect(r.status).toBe("dead");
    expect(r.httpStatus).toBe(404);
  });

  it("boucle de redirection → dead (redirect_loop)", async () => {
    const r = await checkUrl(u("/loop"), fast);
    expect(r.status).toBe("dead");
    expect(r.reason).toBe("redirect_loop");
  });

  it("timeout → dead (timeout)", async () => {
    const r = await checkUrl(u("/slow"), { ...fast, timeoutMs: 100 });
    expect(r.status).toBe("dead");
    expect(r.reason).toBe("timeout");
  });

  it("port fermé → dead (conn_refused)", async () => {
    const r = await checkUrl("http://127.0.0.1:1/x", fast);
    expect(r.status).toBe("dead");
    expect(r.reason).toBe("conn_refused");
  });

  it("DNS invalide → dead (dns)", async () => {
    const r = await checkUrl("http://domaine-qui-nexiste-pas-xyz.example/x", { ...fast, retry: 0 });
    expect(r.status).toBe("dead");
    expect(r.reason).toBe("dns");
  });
});

describe("checkAll", () => {
  it("traite tout, publie via onUpdate, respecte la concurrence", async () => {
    const targets = Array.from({ length: 8 }, (_, i) => ({
      raindropId: i,
      url: u(i % 2 === 0 ? "/ok" : "/notfound"),
    }));
    const results: { raindropId: number; status: string }[] = [];
    const out = await checkAll(targets, {
      ...fast,
      concurrency: 3,
      onUpdate: (r) => results.push({ raindropId: r.raindropId, status: r.status }),
      isCancelled: () => false,
    });
    expect(results).toHaveLength(8);
    expect(out.stats.checked).toBe(8);
    expect(out.stats.maxConcurrency).toBeLessThanOrEqual(3);
    expect(out.stats.maxConcurrency).toBe(3); // 8 tâches, 3 workers → atteint
  });

  it("annulation : s'arrête et laisse des résultats partiels", async () => {
    const targets = Array.from({ length: 20 }, (_, i) => ({ raindropId: i, url: u("/slow") }));
    let seen = 0;
    const out = await checkAll(targets, {
      ...fast,
      timeoutMs: 60,
      concurrency: 2,
      onUpdate: () => seen++,
      isCancelled: () => seen >= 2,
    });
    expect(out.stats.checked).toBeLessThan(20);
  });
});
