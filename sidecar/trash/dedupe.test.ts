import { describe, it, expect } from "vitest";
import { makeDedupe, unionEtiquettes, type PaireDedupe } from "./dedupe.js";
import type { CallOutcome } from "../../shared/errors.js";
import type { JobHandle } from "../jobs/store.js";

// La consolidation AVANT la corbeille : rien de ce qui distingue une copie
// (ses étiquettes) ne doit mourir avec elle. Les surlignages, eux, restent
// dans les copies — Phase 1 lecture seule, corbeille réversible.

const ok = <T>(data: T): CallOutcome<T> => ({ ok: true, data });
const ko = (message: string): CallOutcome<never> => ({ ok: false, code: "RAINDROP_API", message });

/** Un mcp factice : get_raindrop sert des étiquettes, tout est journalisé. */
const fakeMcp = (journal: string[], etiquettes: Record<number, string[]>, ratechec?: (tool: string, args: Record<string, unknown>) => boolean) => {
  const mcp = async (tool: string, args: Record<string, unknown>): Promise<CallOutcome<unknown>> => {
    journal.push(`${tool}:${JSON.stringify(args)}`);
    if (ratechec?.(tool, args)) return ko("hoquet simulé");
    if (tool === "get_raindrop") return ok({ _id: args.id, tags: etiquettes[args.id as number] ?? [] });
    if (tool === "update_raindrop") return ok({ _id: args.id });
    if (tool === "bulk_raindrops") return ok({ ids: args.ids });
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

const job = (annule: () => boolean = () => false): JobHandle =>
  ({ progress: () => undefined, isCancelled: annule }) as unknown as JobHandle;

const paire = (garde: number, ids: number[], cid = 7): PaireDedupe => ({
  garde,
  copies: ids.map((id) => ({ id, collectionId: cid })),
});

describe("unionEtiquettes", () => {
  it("union sans égard à la casse, la première orthographe gagne", () => {
    // Le gardé d'abord : ses choix ne doivent pas être réécrits par une copie.
    expect(unionEtiquettes(["Python", "web"], ["python", "Rust", "WEB"])).toEqual(["Python", "web", "Rust"]);
  });
});

describe("deduper — la consolidation avant la corbeille", () => {
  it("une paire heureuse : union posée sur le gardé, origines, corbeille", async () => {
    const journal: string[] = [];
    const mcp = fakeMcp(journal, { 100: ["python"], 1: ["python", "tuto"], 2: ["rust"] });
    const r = await makeDedupe({ mcp, origins: fakeOrigins(journal) })([paire(100, [1, 2])], job());
    // L'union [python, tuto, rust] est posée sur le gardé — UNE écriture.
    expect(journal.some((j) => j.startsWith("update_raindrop") && j.includes('"python","tuto","rust"'))).toBe(true);
    expect(journal.filter((j) => j.startsWith("update_raindrop"))).toHaveLength(1);
    // Origines mémorisées AVANT la corbeille (§4.2).
    expect(journal.indexOf("origines:1:7")).toBeLessThan(journal.findIndex((j) => j.startsWith("bulk_raindrops")));
    const bulk = journal.find((j) => j.startsWith("bulk_raindrops"))!;
    // ⚠️ CONTRAT réel (code compilé MCP 1.3.1) : un bulk delete frappe
    // `DELETE /raindrops/{collection_id}` — la collection y est la SOURCE
    // depuis laquelle on retire. 0 (« Tous ») MET À LA CORBEILLE ; -99
    // viserait des ids DÉJÀ corbeillés et ne ferait RIEN pour des signets
    // vivants — avec `result: true`, donc un succès inventé. Défaut réel du
    // 2026-09-20 : deux doublons « corbeillés » restés intacts, aucune
    // erreur nulle part. La source n'est JAMAIS la corbeille elle-même.
    expect(bulk).toContain('"collection_id":0');
    expect(bulk).toContain("[1,2]");
    expect(r).toMatchObject({ paires: 1, corbeille: 2, fusionnees: 2, etiquettesAjoutees: 2, nonFusionnees: [], echecs: [], annule: false });
  });

  it("des copies sans étiquettes ne déclenchent AUCUNE écriture du gardé", async () => {
    const journal: string[] = [];
    const mcp = fakeMcp(journal, { 100: ["python"], 1: [], 2: [] });
    const r = await makeDedupe({ mcp, origins: fakeOrigins(journal) })([paire(100, [1, 2])], job());
    // Réécrire des étiquettes identiques coûterait une écriture jamais
    // retentée pour zéro effet — le gardé n'est pas touché.
    expect(journal.some((j) => j.startsWith("update_raindrop"))).toBe(false);
    expect(r.corbeille).toBe(2);
    expect(r.fusionnees).toBe(2);
  });

  it("étiquettes illisibles : la copie part EN CORBEILLE, et le déficit est dit", async () => {
    const journal: string[] = [];
    const mcp = fakeMcp(journal, { 100: ["python"] }, (_t, a) => a.id === 1);
    const r = await makeDedupe({ mcp, origins: fakeOrigins(journal) })([paire(100, [1, 2])], job());
    // Bloquer le nettoyage sur un hoquet de lecture en ferait l'otage ; le
    // taire ferait croire que rien n'a été perdu. Ni l'un ni l'autre.
    expect(r.nonFusionnees.map((n) => n.id)).toEqual([1]);
    expect(r.corbeille).toBe(2);
  });

  it("échec de corbeille : les copies sont rapportées, le gardé garde son union", async () => {
    const journal: string[] = [];
    const mcp = fakeMcp(journal, { 100: ["python"], 1: ["tuto"] }, (t) => t === "bulk_raindrops");
    const r = await makeDedupe({ mcp, origins: fakeOrigins(journal) })([paire(100, [1])], job());
    expect(r.echecs.map((e) => e.id)).toEqual([1]);
    // La consolidation a bien eu lieu AVANT l'échec — elle ne se défait pas.
    expect(journal.some((j) => j.startsWith("update_raindrop"))).toBe(true);
  });

  it("annulation entre deux paires : la suite n'est pas touchée, et le mot est dit", async () => {
    const journal: string[] = [];
    const mcp = fakeMcp(journal, {});
    let apresPremiere = false;
    const annule = () => apresPremiere;
    const j: JobHandle = {
      progress: () => {
        apresPremiere = true;
      },
      isCancelled: annule,
    } as unknown as JobHandle;
    const r = await makeDedupe({ mcp, origins: fakeOrigins(journal) })([paire(100, [1]), paire(200, [2, 3])], j);
    expect(r.annule).toBe(true);
    expect(journal.filter((j) => j.startsWith("bulk_raindrops"))).toHaveLength(1);
  });
});
