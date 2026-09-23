import { repertoireTemporaire } from "./testing/tmp.js";
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { acquireLock, readLockfile, clearLockfile } from "./lockfile.js";

const dir = () => repertoireTemporaire("lock-");

describe("acquireLock", () => {
  it("crée le lockfile {port,pid,startedAt} — SANS token (R15, spec §3.7)", async () => {
    const d = dir();
    const r = await acquireLock(d, { port: 5000 });
    expect(r).toBe("created");
    const data = await readLockfile(d)!;
    expect(data).toMatchObject({ port: 5000, pid: process.pid });
    expect(typeof data!.startedAt).toBe("string");
    expect(isNaN(Date.parse(data!.startedAt))).toBe(false);
    expect(Object.keys(data!).sort()).toEqual(["pid", "port", "startedAt"]);
  });

  it("pid vivant existant → reused (réutilisation par Tauri)", async () => {
    const d = dir();
    await acquireLock(d, { port: 5000 });
    const r = await acquireLock(d, { port: 6000 });
    expect(r).toBe("reused");
  });

  it("pid mort → écrasement (lockfile corrompu/crash)", async () => {
    const d = dir();
    await acquireLock(d, { port: 5000, pid: 999999999 });
    const r = await acquireLock(d, { port: 7000 });
    expect(r).toBe("created");
    expect((await readLockfile(d))!.port).toBe(7000);
  });

  it("contenu corrompu → écrasement propre", async () => {
    const d = dir();
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(d, "sidecar.json"), "pas du json");
    const r = await acquireLock(d, { port: 8000 });
    expect(r).toBe("created");
  });

  it("clearLockfile supprime", async () => {
    const d = dir();
    await acquireLock(d, { port: 1 });
    await clearLockfile(d);
    expect(await readLockfile(d)).toBeNull();
  });
});
