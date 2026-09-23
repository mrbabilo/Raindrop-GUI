import { repertoireTemporaire } from "./testing/tmp.js";
import { describe, it, expect } from "vitest";
import {writeFileSync, existsSync, readFileSync} from "node:fs";
import { join } from "node:path";
import { createLogger } from "./logger.js";

const dir = () => repertoireTemporaire("logs-");

/** Les writes du logger sont asynchrones : borne l'attente au lieu de courser
 *  sur le scheduling (flake 27 % sous charge). Échoue si jamais apparu. */
async function waitFor(cond: () => boolean, what: string, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`condition non remplie : ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("createLogger", () => {
  it("écrit une entrée JSONL avec ts/level/msg dans le fichier du jour", async () => {
    const d = dir();
    const logger = createLogger(d, { level: "info" });
    logger.info("démarrage sidecar", { pid: process.pid });
    logger.warn("attention", { code: 42 });
    await logger.close();

    const file = join(d, `sidecar-${new Date().toISOString().slice(0, 10)}.jsonl`);
    await waitFor(() => existsSync(file), `fichier créé : ${file}`);
    const lines = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toMatchObject([
      { level: "info", msg: "démarrage sidecar", pid: process.pid },
      { level: "warn", msg: "attention", code: 42 },
    ]);
    expect(typeof lines[0]!.ts).toBe("string");
  });

  it("purge les logs plus vieux que retentionDays au boot", async () => {
    const d = dir();
    const old = join(d, "sidecar-2020-01-01.jsonl");
    writeFileSync(old, '{"ts":"2020","level":"info","msg":"ancien"}\n', "utf8");
    const logger = createLogger(d, { level: "info", retentionDays: 7 });
    logger.info("nouveau");
    await logger.close();
    await waitFor(() => !existsSync(old), "ancien log purgé");
  });
});
