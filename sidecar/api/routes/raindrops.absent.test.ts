import { it, expect, vi } from "vitest";
import { raindropsRoutes } from "./raindrops.js";
import type { SidecarDeps } from "../deps.js";
import type { CallOutcome } from "../../../shared/errors.js";

const absentMcp = { ok: false as const, code: "RAINDROP_API" as const, message: "raindrop 42 not found" };
function app(result: CallOutcome<unknown>, mcpResult: CallOutcome<unknown> = absentMcp) {
  const getRaindrop = vi.fn(async () => result);
  const invaliderInstantane = vi.fn();
  const routes = raindropsRoutes({
    mcp: async () => mcpResult,
    direct: { getRaindrop },
    scanner: { invaliderInstantane },
  } as unknown as SidecarDeps);
  return { routes, getRaindrop, invaliderInstantane };
}

it("confirme le 404 et force la prochaine analyse à relire la bibliothèque", async () => {
  const a = app({ ok: false, code: "SIGNET_INTROUVABLE", message: "Absent" });
  const response = await a.routes.request("/42");
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ error: { code: "SIGNET_INTROUVABLE" } });
  expect(a.getRaindrop).toHaveBeenCalledWith(42);
  expect(a.invaliderInstantane).toHaveBeenCalledOnce();
});

it("ne périme pas l'instantané lors d'une panne de lecture", async () => {
  const a = app({ ok: false, code: "RAINDROP_API", message: "http 500" });
  expect((await a.routes.request("/42")).status).toBe(502);
  expect(a.invaliderInstantane).not.toHaveBeenCalled();
});

it("ne sonde pas REST pour une panne MCP sans message ambigu", async () => {
  const a = app({ ok: false, code: "SIGNET_INTROUVABLE", message: "Absent" }, { ok: false, code: "MCP_TIMEOUT", message: "timeout" });
  expect((await a.routes.request("/42")).status).toBe(504);
  expect(a.getRaindrop).not.toHaveBeenCalled();
});

it("retourne la fiche si la lecture de secours retrouve le signet", async () => {
  const a = app({ ok: true, data: { _id: 42, link: "https://example.test", title: "Retrouvé", collection: { $id: 1 }, tags: [], created: "2026-10-15", lastUpdate: "2026-10-15" } });
  const response = await a.routes.request("/42");
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ id: 42, title: "Retrouvé" });
  expect(a.invaliderInstantane).not.toHaveBeenCalled();
});
