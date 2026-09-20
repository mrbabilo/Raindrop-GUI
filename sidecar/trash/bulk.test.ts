import { describe, it, expect } from "vitest";
import type { CallOutcome } from "../../shared/errors.js";
import { corbeilleEnMasse, marquerEtiquette } from "./bulk.js";

// Les dépôts EN MASSE venus du glisser-déposer : la corbeille mémorise les
// origines (§4.2 — sans elles, la restauration reviendrait « inconnue »),
// l'étiquette pose SEULEMENT l'union (le bulk update de Raindrop remplace).

const ok = <T>(data: T): CallOutcome<T> => ({ ok: true, data });
const ko = (message: string): CallOutcome<never> => ({ ok: false, code: "RAINDROP_API", message });

/** Un mcp factice : chaque item porte sa collection et ses étiquettes. */
const fakeMcp = (
  journal: string[],
  items: Record<number, { collectionId?: number; tags?: string[] }>,
  ratechec?: (tool: string, args: Record<string, unknown>) => boolean,
) => {
  const mcp = async (tool: string, args: Record<string, unknown>): Promise<CallOutcome<unknown>> => {
    journal.push(`${tool}:${JSON.stringify(args)}`);
    if (ratechec?.(tool, args)) return ko("hoquet");
    if (tool === "get_raindrop") {
      const it = items[args.id as number] ?? {};
      return ok({ _id: args.id, collection: { $id: it.collectionId ?? 0 }, tags: it.tags ?? [] });
    }
    if (tool === "update_raindrop") return ok({ _id: args.id });
    if (tool === "delete_raindrop") return ok({ deleted: true });
    return ok({});
  };
  return mcp;
};

const fakeOrigins = (journal: string[]) => ({
  remember: async (id: number, cid: number) => void journal.push(`origines:${id}:${cid}`),
  take: async () => ({ known: new Map(), unknown: [] }),
  forget: async () => undefined,
  flush: async () => undefined,
  purge: async () => undefined,
});

const journalFictif = () => {
  const entrees: { msg: string; champs?: Record<string, unknown> }[] = [];
  return {
    journal: {
      info: (msg: string, champs?: Record<string, unknown>) => { entrees.push({ msg, champs }); },
      warn: (msg: string, champs?: Record<string, unknown>) => { entrees.push({ msg, champs }); },
      error: (msg: string, champs?: Record<string, unknown>) => { entrees.push({ msg, champs }); },
    },
    entrees,
  };
};

describe("corbeilleEnMasse", () => {
  it("mémorise l'origine AVANT la corbeille — item par item, dans l'ordre", async () => {
    const journal: string[] = [];
    const { journal: j, entrees } = journalFictif();
    const mcp = fakeMcp(journal, { 1: { collectionId: 7 }, 2: { collectionId: 9 } });
    const r = await corbeilleEnMasse({ mcp, origins: fakeOrigins(journal), journal: j }, [1, 2]);
    expect(r).toEqual({ corbeille: 2, echecs: [] });
    // Pour CHAQUE item : l'origine d'abord, puis la corbeille. La file à
    // 550 ms voit un ordre — for..await, jamais allSettled (trap 09-20).
    expect(journal.indexOf("origines:1:7")).toBeLessThan(journal.indexOf('delete_raindrop:{"id":1}'));
    expect(journal.indexOf("origines:2:9")).toBeLessThan(journal.indexOf('delete_raindrop:{"id":2}'));
    expect(entrees.some((e) => e.msg === "corbeille en masse" && e.champs?.corbeille === 2)).toBe(true);
  });

  it("une lecture illisible : l'item est rapporté, les suivants partent", async () => {
    const journal: string[] = [];
    const { journal: j } = journalFictif();
    const mcp = fakeMcp(journal, { 2: { collectionId: 7 } }, (_t, a) => a.id === 1);
    const r = await corbeilleEnMasse({ mcp, origins: fakeOrigins(journal), journal: j }, [1, 2]);
    expect(r.corbeille).toBe(1);
    expect(r.echecs).toEqual([{ id: 1, raison: "hoquet" }]);
  });

  it("une corbeille refusée : échec nommé, l'origine reste mémorisée", async () => {
    const journal: string[] = [];
    const { journal: j } = journalFictif();
    const mcp = fakeMcp(journal, { 1: { collectionId: 7 } }, (t) => t === "delete_raindrop");
    const r = await corbeilleEnMasse({ mcp, origins: fakeOrigins(journal), journal: j }, [1]);
    expect(r.corbeille).toBe(0);
    expect(r.echecs).toHaveLength(1);
    // L'origine est déjà juste : le prochain essai restaure au bon endroit.
    expect(journal.some((x) => x.startsWith("origines:1:7"))).toBe(true);
  });
});

describe("marquerEtiquette", () => {
  it("pose SEULEMENT l'union — les étiquettes existantes ne sont jamais écrasées", async () => {
    const journal: string[] = [];
    const { journal: j, entrees } = journalFictif();
    const mcp = fakeMcp(journal, { 1: { tags: ["python"] } });
    const r = await marquerEtiquette({ mcp, origins: fakeOrigins(journal), journal: j }, [1], "Rust");
    expect(r).toEqual({ marques: 1, deja: 0, echecs: [] });
    const maj = journal.find((x) => x.startsWith("update_raindrop"))!;
    expect(maj).toContain('["python","Rust"]');
    expect(entrees.some((e) => e.msg === "étiquette en masse" && e.champs?.tag === "Rust")).toBe(true);
  });

  it("une étiquette déjà posée (casse ignorée) ne déclenche AUCUNE écriture", async () => {
    const journal: string[] = [];
    const { journal: j } = journalFictif();
    const mcp = fakeMcp(journal, { 1: { tags: ["python"] } });
    const r = await marquerEtiquette({ mcp, origins: fakeOrigins(journal), journal: j }, [1], "PYTHON");
    expect(r).toEqual({ marques: 0, deja: 1, echecs: [] });
    expect(journal.some((x) => x.startsWith("update_raindrop"))).toBe(false);
  });
});
