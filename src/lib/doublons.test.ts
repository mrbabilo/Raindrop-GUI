import { describe, it, expect } from "vitest";
import { choisirGarde, copiesDe, pairesCertaines, elaguerGroupes } from "./doublons";

const item = (id: number, created: string, url = `https://a.example/${id}`) => ({ id, created, url });

describe("choisirGarde — la plus ancienne gagne", () => {
  it("l'original, pas la copie récente", () => {
    // La présence d'abord : un groupe à deux membres a bien un choix à faire.
    const items = [item(2, "2024-01-01T00:00:00Z"), item(1, "2020-01-01T00:00:00Z")];
    expect(choisirGarde(items).id).toBe(1);
  });

  it("à date égale, https avant http", () => {
    const items = [item(1, "2020-01-01T00:00:00Z", "http://a.example/x"), item(2, "2020-01-01T00:00:00Z", "https://a.example/x")];
    expect(choisirGarde(items).id).toBe(2);
  });

  it("à tout égal, l'ordre du groupe tranche — et reste stable", () => {
    // « L'ordre du groupe » EST le dernier départage : deux entrées de
    // groupes différents ne sont pas le même groupe. Ce qui doit tenir, c'est
    // qu'un MÊME groupe rend le même gardé à chaque appel.
    const g = [item(1, "2020-01-01T00:00:00Z"), item(2, "2020-01-01T00:00:00Z")];
    expect(choisirGarde(g).id).toBe(choisirGarde(g).id);
    expect(choisirGarde(g).id).toBe(1);
  });
});

describe("pairesCertaines — le tri global ne touche que l' certain", () => {
  it("exact et normalisé oui, flou NON", () => {
    // Le flou vient de le démontrer : 163 signets réels groupés par le seul
    // mot « Weiterleitungshinweis ». Même domaine + même titre ≠ certitude.
    const g = (kind: "exact" | "normalized" | "fuzzy", ids: number[]) => ({
      key: kind + ids.join(","), kind,
      items: ids.map((id) => ({ id, url: `https://a.example/${id}`, title: "t", collectionId: 1, created: "2020-01-01T00:00:00Z" })),
    });
    const paires = pairesCertaines({ exact: [g("exact", [1, 2])], normalized: [g("normalized", [3, 4])], fuzzy: [g("fuzzy", [5, 6])] });
    const ids = paires.flatMap((p) => p.copies.map((c) => c.id));
    expect(ids).toEqual([2, 4]);
    expect(ids).not.toContain(5);
    expect(ids).not.toContain(6);
  });

  it("chaque paire garde UN exemplaire", () => {
    const g = { key: "k", kind: "exact" as const, items: [1, 2, 3].map((id) => ({ id, url: `https://a.example/${id}`, title: "t", collectionId: 1, created: "2020-01-01T00:00:00Z" })) };
    const paires = pairesCertaines({ exact: [g], normalized: [], fuzzy: [] });
    expect(paires).toHaveLength(1);
    expect(paires[0]!.copies).toHaveLength(2);
    expect(copiesDe(g.items, paires[0]!.garde.id)).toHaveLength(2);
  });
});

describe("elaguerGroupes — l'écran dit vrai après une suppression", () => {
  const g = (kind: "exact" | "normalized" | "fuzzy", ids: number[]) => ({
    key: kind + ids.join(","), kind,
    items: ids.map((id) => ({ id, url: `https://a.example/${id}`, title: "t", collectionId: 1, created: "2020-01-01T00:00:00Z" })),
  });
  const trois = { exact: [g("exact", [1, 2, 3])], normalized: [], fuzzy: [g("fuzzy", [8, 9])] };

  it("une copie sortie, le groupe tient encore", () => {
    const r = elaguerGroupes(trois, [3]);
    expect(r.exact[0]!.items.map((i) => i.id)).toEqual([1, 2]);
    expect(r.fuzzy).toEqual(trois.fuzzy);
  });

  it("réduit à UN exemplaire, le groupe N'EST PLUS un doublon — il disparaît", () => {
    // Retirer 3 du trio laisse une PAIRE : le groupe exact doit survivre —
    // la présence d'abord, sinon ce test célèbrerait un filtre qui jette
    // tout. Retirer 8 de la paire floue laisse UN exemplaire : le groupe
    // cesse d'être un doublon, il disparaît.
    const r = elaguerGroupes(trois, [3, 8]);
    expect(r.exact[0]!.items.map((i) => i.id)).toEqual([1, 2]);
    expect(r.fuzzy).toEqual([]);
  });

  it("rien de supprimé : les groupes sortent INTACTS", () => {
    expect(elaguerGroupes(trois, [])).toEqual(trois);
  });
});
