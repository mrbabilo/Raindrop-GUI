import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createRef } from "react";
import { useIndexClavier } from "./useIndexClavier";

// La liste change SOUS l'index actif (audit du 2026-09-23) : ListPane reste
// monté d'une collection à l'autre, la Revue filtre ses lignes par la
// recherche locale. Un index hors de la nouvelle liste ne désignait plus
// aucune ligne : aucun `tabIndex=0`, la liste sortait du parcours clavier.
const rendre = (nombre: number) =>
  renderHook(({ n }) => useIndexClavier({ nombre: n, zone: createRef<HTMLElement>(), defilerVers: () => undefined }), {
    initialProps: { n: nombre },
  });

const tabulables = (c: ReturnType<typeof useIndexClavier>, nombre: number) =>
  Array.from({ length: nombre }, (_, i) => c.ligne(i).tabIndex).filter((t) => t === 0).length;

describe("useIndexClavier — un seul arrêt de tabulation, quoi qu'il arrive à la liste", () => {
  it("témoin : l'index actif porte l'arrêt", () => {
    const { result } = rendre(200);
    act(() => result.current.setActif(150));
    expect(result.current.ligne(150).tabIndex).toBe(0);
    expect(tabulables(result.current, 200)).toBe(1);
  });

  it("la liste rétrécit sous l'index : l'arrêt revient à une ligne existante", () => {
    const { result, rerender } = rendre(200);
    act(() => result.current.setActif(150));
    rerender({ n: 20 });
    expect(tabulables(result.current, 20)).toBe(1);
  });

  it("Entrée sur un index hors liste ne déclenche rien", () => {
    let recu: number | null = null;
    const { result, rerender } = renderHook(
      ({ n }) =>
        useIndexClavier({ nombre: n, zone: createRef<HTMLElement>(), defilerVers: () => undefined, surEntree: (i) => { recu = i; } }),
      { initialProps: { n: 200 } },
    );
    act(() => result.current.setActif(150));
    rerender({ n: 20 });
    act(() => result.current.surTouche({ key: "Enter", preventDefault: () => undefined } as React.KeyboardEvent));
    expect(recu).toBeNull();
  });
});
