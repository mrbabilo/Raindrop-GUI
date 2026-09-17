import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Icone } from "./icones";

// DESIGN.md §9 : « icônes dessinées en SVG, trait de 1,6–1,8, grille de
// 15–16 px, jamais d'emoji ». Même contrat que glyphes.test.tsx — la règle
// se vérifie sur le dessin, pas sur la foi.
describe("Icone", () => {
  it("respecte la grille et le trait de §9, et ne porte aucun nom propre", () => {
    for (const nom of ["liste", "mosaique", "reglages", "chevron"] as const) {
      const { container } = render(<Icone nom={nom} />);
      const svg = container.querySelector("svg")!;
      expect(svg.getAttribute("viewBox")).toBe("0 0 16 16");
      expect(Number(svg.getAttribute("stroke-width"))).toBeGreaterThanOrEqual(1.6);
      expect(Number(svg.getAttribute("stroke-width"))).toBeLessThanOrEqual(1.8);
      // Décorative : le nom accessible vient du bouton qui la porte (§9 —
      // une icône seule prend son aria-label, l'icône elle-même se tait).
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.querySelector("path, rect, circle")).not.toBeNull();
    }
  });
});
