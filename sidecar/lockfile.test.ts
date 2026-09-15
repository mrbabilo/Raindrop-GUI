import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLock, readLockfile, clearLockfile } from "./lockfile.js";

const dir = () => mkdtempSync(join(tmpdir(), "lock-"));

describe("acquireLock", () => {
  it("crée le lockfile avec port/token/pid", async () => {
    const d = dir();
    const r = await acquireLock(d, { port: 5000, token: "abc" });
    expect(r).toBe("created");
    const data = await readLockfile(d);
    expect(data).toMatchObject({ port: 5000, token: "abc", pid: process.pid });
  });

  it("pid vivant existant → reused (réutilisation par Tauri)", async () => {
    const d = dir();
    await acquireLock(d, { port: 5000, token: "abc" });
    const r = await acquireLock(d, { port: 6000, token: "x" });
    expect(r).toBe("reused");
  });

  it("pid mort → écrasement (lockfile corrompu/crash)", async () => {
    const d = dir();
    await acquireLock(d, { port: 5000, token: "abc", pid: 999999999 });
    const r = await acquireLock(d, { port: 7000, token: "y" });
    expect(r).toBe("created");
    expect((await readLockfile(d))!.port).toBe(7000);
  });

  it("contenu corrompu → écrasement propre", async () => {
    const d = dir();
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(d, "sidecar.json"), "pas du json");
    const r = await acquireLock(d, { port: 8000, token: "z" });
    expect(r).toBe("created");
  });

  it("clearLockfile supprime", async () => {
    const d = dir();
    await acquireLock(d, { port: 1, token: "t" });
    await clearLockfile(d);
    expect(await readLockfile(d)).toBeNull();
  });
});
