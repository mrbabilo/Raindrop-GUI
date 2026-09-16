import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Glyphe, NATURE_TYPES } from "./glyphes";

describe("Glyphe", () => {
  it("rend un <svg> 15x15 aria-hidden pour chaque nature connue (DESIGN.md §2.1/§9)", () => {
    for (const type of NATURE_TYPES) {
      const { container } = render(<Glyphe type={type} />);
      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("width", "15");
      expect(svg).toHaveAttribute("height", "15");
    }
  });

  it("un type inconnu retombe sur le glyphe link (aucun septième tracé)", () => {
    const { container: linkRender } = render(<Glyphe type="link" />);
    const { container: unknownRender } = render(<Glyphe type="ce-nest-pas-une-nature" />);
    expect(unknownRender.querySelector("svg")?.innerHTML).toBe(linkRender.querySelector("svg")?.innerHTML);
  });
});
