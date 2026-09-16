import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeOriginStore } from "./origins.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "origins-"));
});

describe("makeOriginStore", () => {
  it("fichier absent → tout unknown, jamais de throw (pas une source de vérité, §11)", async () => {
    const store = makeOriginStore({ file: join(dir, "absent.json") });
    const { known, unknown } = await store.take([1, 2, 3]);
    expect(known.size).toBe(0);
    expect(unknown).toEqual([1, 2, 3]);
  });

  it("fichier corrompu → vide, pas de throw", async () => {
    const file = join(dir, "origins.json");
    writeFileSync(file, "{corrompu");
    const store = makeOriginStore({ file });
    const { known, unknown } = await store.take([7]);
    expect(known.size).toBe(0);
    expect(unknown).toEqual([7]);
  });

  it("remember puis take → origine connue, associée à la collection", async () => {
    const store = makeOriginStore({ file: join(dir, "origins.json") });
    await store.remember(1000, 42);
    const { known, unknown } = await store.take([1000]);
    expect(known.get(1000)).toBe(42);
    expect(unknown).toEqual([]);
  });

  it("take est une lecture pure : rien n'est retiré", async () => {
    const store = makeOriginStore({ file: join(dir, "origins.json") });
    await store.remember(1000, 42);
    await store.take([1000]);
    const again = await store.take([1000]);
    expect(again.known.get(1000)).toBe(42);
  });

  it("forget retire ; ids inconnus tolérés", async () => {
    const store = makeOriginStore({ file: join(dir, "origins.json") });
    await store.remember(1000, 42);
    await store.forget([1000, 9999]); // 9999 jamais mémorisé
    const { known, unknown } = await store.take([1000, 9999]);
    expect(known.size).toBe(0);
    expect(unknown).toEqual([1000, 9999]);
  });

  it("persiste : un second store (relance) relit les origines du premier", async () => {
    const file = join(dir, "origins.json");
    const first = makeOriginStore({ file });
    await first.remember(1000, 42);
    await first.remember(1001, 7);
    await first.flush();

    const second = makeOriginStore({ file });
    const { known, unknown } = await second.take([1000, 1001, 1002]);
    expect(known.get(1000)).toBe(42);
    expect(known.get(1001)).toBe(7);
    expect(unknown).toEqual([1002]);
  });

  it("persiste la suppression : forget visible par un second store", async () => {
    const file = join(dir, "origins.json");
    const first = makeOriginStore({ file });
    await first.remember(1000, 42);
    await first.forget([1000]);
    await first.flush();

    const second = makeOriginStore({ file });
    const { known } = await second.take([1000]);
    expect(known.size).toBe(0);
  });

  it("remembers concurrents → file d'écriture sérialisée, tout est sur disque", async () => {
    const file = join(dir, "origins.json");
    const store = makeOriginStore({ file });
    await Promise.all(Array.from({ length: 40 }, (_, i) => store.remember(i, 100 + i)));
    await store.flush();

    const reread = makeOriginStore({ file });
    const { known, unknown } = await reread.take(Array.from({ length: 40 }, (_, i) => i));
    expect(known.size).toBe(40);
    expect(unknown).toEqual([]);
  });

  it("save atomique : pas de .tmp résiduel, JSON valide", async () => {
    const file = join(dir, "origins.json");
    const store = makeOriginStore({ file });
    await store.remember(1000, 42);
    await store.flush();
    expect(existsSync(file)).toBe(true);
    expect(existsSync(`${file}.tmp`)).toBe(false);
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { version: number; origins: Record<string, number> };
    expect(parsed.version).toBe(1);
    expect(parsed.origins["1000"]).toBe(42);
  });
});
