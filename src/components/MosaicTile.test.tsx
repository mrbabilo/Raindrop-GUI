import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// fixtures AVANT MosaicTile (TDZ — même remarque que Sidebar.test.tsx).
import { raindrop } from "../test/fixtures";
import { MosaicTile } from "./MosaicTile";

describe("MosaicTile", () => {
  it("img quand cover existe, initiale du titre sinon", () => {
    const { container, rerender } = render(
      <MosaicTile r={raindrop({ cover: "https://img.example/c.jpg" })} onOpen={() => undefined} />,
    );
    expect(container.querySelector("img")).toHaveAttribute("src", "https://img.example/c.jpg");
    rerender(<MosaicTile r={raindrop({ cover: null })} onOpen={() => undefined} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("A")).toBeInTheDocument(); // initiale d'« Article exemple »
    expect(screen.getByText("example.com")).toBeInTheDocument();
  });

  it("le clic ouvre le détail", async () => {
    const onOpen = vi.fn();
    render(<MosaicTile r={raindrop()} onOpen={onOpen} />);
    await userEvent.click(screen.getByText("Article exemple"));
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
