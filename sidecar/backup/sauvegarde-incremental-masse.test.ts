// Plus de modifications que l'incrémental n'en lit (audit du 2026-09-23).
// `lireModifies` s'arrête à 20 pages (1 000 signets) ; renommer une étiquette
// portée par 1 713 signets (#webdesign, mesuré — CLAUDE.md) en modifie
// davantage. L'incrémental lisait les 1 000 plus récents, avançait le
// watermark au plus récent, et le contrôle de compte — inchangé — déclarait
// l'instantané VALIDE : les autres gardaient leur état d'avant, et plus aucun
// incrémental ne les relirait (7 jours, jusqu'au balayage complet).
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { startFauxApi, type FauxApi } from "../testing/apiServer.js";
import { repertoireTemporaire } from "../testing/tmp.js";
import { makeLecture } from "./lecture.js";
import { Throttle } from "../mcp/throttle.js";
import { makeSauvegarde } from "./sauvegarde.js";

let api: FauxApi | undefined;
afterEach(async () => {
  await api?.close();
  api = undefined;
});

const N = 1100; // > 20 pages de 50
const bibliotheque = () =>
  Array.from({ length: N }, (_, i) => ({
    _id: 1000 + i,
    created: new Date(Date.UTC(2020, 0, 1) + i * 60_000).toISOString(),
    lastUpdate: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(),
    title: `avant ${i}`,
  }));

describe("incrémental sous modification MASSIVE", () => {
  it("n'est jamais déclaré valide avec des signets dans leur état d'avant", async () => {
    const items = bibliotheque();
    api = await startFauxApi(items);
    const dossier = repertoireTemporaire("sauv-masse-");
    const sauvegarde = makeSauvegarde({
      lecture: makeLecture({ token: "j", baseUrl: `http://127.0.0.1:${api.port}/rest/v1`, file: new Throttle(0) }),
      dossier,
    });
    await sauvegarde.executer("balayage");

    // Le renommage d'une étiquette très portée : TOUS les signets changent.
    for (const [i, it] of items.entries()) {
      it.title = `après ${i}`;
      it.lastUpdate = new Date(Date.UTC(2026, 5, 1) + i * 1000).toISOString();
    }
    const r = await sauvegarde.executer("incremental");

    expect(r.complet).toBe(true);
    const titres = readFileSync(join(dossier, r.horodatage, "raindrops.jsonl"), "utf8")
      .trimEnd()
      .split("\n")
      .map((l) => (JSON.parse(l) as { title: string }).title);
    expect(titres).toHaveLength(N);
    expect(titres.filter((t) => t.startsWith("avant"))).toEqual([]);
  });
});
