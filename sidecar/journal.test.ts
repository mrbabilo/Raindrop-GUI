import { describe, it, expect } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { repertoireTemporaire } from "./testing/tmp.js";
import { lireJournal } from "./journal.js";

// `repertoireTemporaire` rend une string, pas une fabrique (trap lot 09-18).
const dir = () => repertoireTemporaire("journal-");
const aujourdhui = () => new Date().toISOString().slice(0, 10);

const poserLogs = async (base: string, lignes: string[]): Promise<string> => {
  const d = join(base, "logs");
  await mkdir(d, { recursive: true });
  await writeFile(join(d, `sidecar-${aujourdhui()}.jsonl`), lignes.join("\n") + "\n", "utf8");
  return d;
};

describe("lireJournal", () => {
  it("rend les entrées du jour, parsées, dans l'ordre du fichier", async () => {
    const logs = await poserLogs(dir(), [
      JSON.stringify({ ts: "2026-09-20T10:00:00Z", level: "info", msg: "a" }),
      JSON.stringify({ ts: "2026-09-20T10:01:00Z", level: "info", msg: "b" }),
    ]);
    const es = await lireJournal(logs);
    expect(es).toHaveLength(2);
    expect(es[0]).toMatchObject({ msg: "a" });
    expect(es[1]).toMatchObject({ msg: "b" });
  });

  it("une ligne corrompue est SAUTÉE, jamais une erreur (coupure en écriture)", async () => {
    const logs = await poserLogs(dir(), [
      JSON.stringify({ ts: "2026-09-20T10:00:00Z", level: "info", msg: "bonne" }),
      '{"ts": tronqué',
    ]);
    const es = await lireJournal(logs);
    expect(es).toHaveLength(1);
    expect(es[0]?.msg).toBe("bonne");
  });

  it("limite aux N DERNIÈRES entrées (500 par défaut)", async () => {
    const lignes = Array.from({ length: 7 }, (_, i) =>
      JSON.stringify({ ts: `2026-09-20T10:0${i}:00Z`, level: "info", msg: `m${i}` }),
    );
    const logs = await poserLogs(dir(), lignes);
    const es = await lireJournal(logs, { limit: 3 });
    expect(es.map((e) => e.msg)).toEqual(["m4", "m5", "m6"]);
  });

  it("fichier absent : liste vide — l'état normal d'un premier jour", async () => {
    const es = await lireJournal(join(dir(), "n-existe-pas"));
    expect(es).toEqual([]);
  });
});
