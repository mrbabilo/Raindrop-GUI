import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Etoile } from "./Etoile";

// DESIGN.md §9 : l'étoile est UNE icône au trait pour toute l'interface —
// fill none, trait 1,7, grille 15–16 (R8P-2). Le test verrouille la lettre :
// aucun retour possible à l'étoile pleine (13 px, fill currentColor) de la
// première mouture de RaindropRow.
describe("Etoile (design)", () => {
  it("icône au trait : fill=none, stroke courant 1,7, grille 15 (§9)", () => {
    const { container } = render(<Etoile />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("fill", "none");
    expect(svg).toHaveAttribute("stroke", "currentColor");
    expect(svg).toHaveAttribute("stroke-width", "1.7");
    expect(svg).toHaveAttribute("width", "15");
    expect(svg).toHaveAttribute("height", "15");
  });
});
