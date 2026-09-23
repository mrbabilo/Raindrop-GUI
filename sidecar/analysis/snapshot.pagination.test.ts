import { describe, it, expect } from "vitest";
import type { CallOutcome } from "../../shared/errors.js";
import { fetchLibrarySnapshot } from "./snapshot.js";

// La pagination par OFFSET sous mutation (audit du 2026-09-23) — les pièges
// que la SAUVEGARDE a mesurés (CLAUDE.md, traps sauvegarde), que le snapshot
// de l'analyse ignorait : sans tri, l'ordre par défaut de Raindrop est
// « récent d'abord », une CRÉATION décale vers l'avant (un signet lu deux
// fois — un faux groupe de doublons avec lui-même) ; une SUPPRESSION décale
// vers l'arrière (un signet SAUTÉ, que `setItemsIndex` — qui REMPLACE —
// effacerait de l'index). Le faux serveur MCP ignore `sort` : ce simulateur
// l'applique, sans quoi le test serait aveugle à ce qu'il prétend couvrir.
type Item = { _id: number; link: string; created: string; last_update: string; collection: { $id: number } };

const simulateur = (n: number, apresPage?: (page: number, lib: Item[], rendus: Item[]) => void) => {
  const lib: Item[] = Array.from({ length: n }, (_, i) => ({
    _id: i + 1,
    link: `https://x.example/${i + 1}`,
    created: new Date(Date.UTC(2020, 0, 1) + i * 60_000).toISOString(),
    last_update: "2020-01-01T00:00:00.000Z",
    collection: { $id: 1 },
  }));
  const mcp = async (_tool: string, args: Record<string, unknown>): Promise<CallOutcome<unknown>> => {
    const sort = args.sort as string | undefined;
    const ordre = [...lib].sort((a, b) =>
      sort === "created" ? a.created.localeCompare(b.created) : b.created.localeCompare(a.created),
    );
    const page = args.page as number;
    const per = args.per_page as number;
    const out = { count: lib.length, items: ordre.slice(page * per, page * per + per) };
    apresPage?.(page, lib, out.items);
    return { ok: true, data: out };
  };
  return { lib, mcp };
};

describe("fetchLibrarySnapshot — pagination sous mutation", () => {
  it("témoin : bibliothèque immobile, tout est lu une fois", async () => {
    const { mcp } = simulateur(120);
    const { items } = await fetchLibrarySnapshot(mcp);
    expect(new Set(items.map((i) => i.id)).size).toBe(120);
    expect(items).toHaveLength(120);
  });

  it("une CRÉATION pendant la lecture ne fait lire aucun signet deux fois", async () => {
    let cree = false;
    const { lib, mcp } = simulateur(120, (page, l) => {
      if (page === 0 && !cree) {
        cree = true;
        l.push({ _id: 999, link: "https://x.example/neuf", created: "2030-01-01T00:00:00.000Z", last_update: "2030-01-01T00:00:00.000Z", collection: { $id: 1 } });
      }
    });
    const { items } = await fetchLibrarySnapshot(mcp);
    const ids = items.map((i) => i.id);
    expect(ids.length).toBe(new Set(ids).size); // aucun doublon d'identifiant
    expect(new Set(ids)).toEqual(new Set(lib.map((i) => i._id)));
  });

  it("une SUPPRESSION pendant la lecture ne fait sauter aucun signet vivant", async () => {
    let supprime = false;
    const { lib, mcp } = simulateur(120, (page, l, rendus) => {
      if (page === 0 && !supprime) {
        supprime = true;
        // Un signet DÉJÀ LU part (le premier rendu, quel que soit l'ordre) :
        // tout ce qui suit recule d'un rang, et la page 1 saute un vivant.
        l.splice(l.findIndex((i) => i._id === rendus[0]!._id), 1);
      }
    });
    const { items } = await fetchLibrarySnapshot(mcp);
    expect(new Set(items.map((i) => i.id))).toEqual(new Set(lib.map((i) => i._id)));
  });

  it("une bibliothèque qui ne cesse de changer : un échec NOMMÉ, jamais un index amputé", async () => {
    const { mcp } = simulateur(120, (page, l, rendus) => {
      if (page === 0) l.splice(l.findIndex((i) => i._id === rendus[0]!._id), 1);
    });
    await expect(fetchLibrarySnapshot(mcp)).rejects.toThrow(/a changé pendant la lecture/);
  });
});
