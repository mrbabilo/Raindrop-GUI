import { describe, it, expect, afterEach } from "vitest";
import { startFauxApi, type FauxApi } from "../testing/apiServer.js";
import { makeLecture } from "./lecture.js";
import { Throttle } from "../mcp/throttle.js";

let api: FauxApi | undefined;
afterEach(async () => {
  await api?.close();
  api = undefined;
});

const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    _id: 1000 + i,
    created: `2020-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    lastUpdate: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    title: `t${i}`,
  }));

const lecture = (a: FauxApi) =>
  makeLecture({ token: "jeton", baseUrl: `http://127.0.0.1:${a.port}/rest/v1`, file: new Throttle(0) });

describe("lecture", () => {
  it("rend les items BRUTS et le compte, sans normaliser", async () => {
    api = await startFauxApi(items(3));
    const p = await lecture(api).page(0, { sort: "created", page: 0 });
    expect(p.count).toBe(3);
    // Le brut : les champs de l'API, pas ceux du DTO du front.
    expect(p.items[0]).toMatchObject({ _id: 1000, created: expect.any(String) });
  });

  it("le compteur ne rapatrie pas la bibliothèque", async () => {
    api = await startFauxApi(items(120));
    expect(await lecture(api).compteur(0)).toBe(120);
    // perpage=1 : un compteur ne doit pas coûter une page entière.
    expect(api.appels.filter((a) => a.includes("raindrops"))).toHaveLength(1);
  });

  it("le jeton part en en-tête, jamais dans l'URL", async () => {
    api = await startFauxApi(items(1));
    await lecture(api).page(0, { sort: "created", page: 0 });
    expect(api.appels.join("|")).not.toContain("jeton");
  });

  it("un 429 est rendu comme tel, pas aplati en panne réseau", async () => {
    api = await startFauxApi(items(1));
    api.repondre429(1);
    await expect(lecture(api).page(0, { sort: "created", page: 0 })).rejects.toThrow(/429/);
  });
});
