import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// fixtures AVANT MosaicTile (TDZ — même remarque que Sidebar.test.tsx).
import { raindrop } from "../test/fixtures";
import { MosaicTile } from "./MosaicTile";
import { injecterRegles } from "../test/injectStyles";

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

  // DESIGN.md §4 : « teinte de la vignette en mosaïque » — la tuile reprend
  // la signalétique de sa collection racine, comme le carré de la liste.
  it("la vignette porte la teinte de la collection racine (§4)", () => {
    const { container } = render(<MosaicTile r={raindrop()} collectionRacine="Dev" onOpen={() => undefined} />);
    const vignette = container.querySelector(".wash") as HTMLElement;
    expect(vignette.style.getPropertyValue("--h")).toBe("250"); // technique
    expect(vignette.style.getPropertyValue("--sat")).toBe("1");
  });

  // §5 : « en liste la marque borde la ligne ; en mosaïque elle COIFFE la
  // vignette » — d'où une bande en tête de tuile, pas un bord latéral.
  it("l'état coiffe la vignette, et seulement en cas de problème (§5)", () => {
    const { container, rerender } = render(<MosaicTile r={raindrop()} onOpen={() => undefined} />);
    expect(container.querySelector(".coiffe")).toBeNull();
    rerender(<MosaicTile r={raindrop()} etat="dead" onOpen={() => undefined} />);
    expect(container.querySelector(".coiffe")).toHaveClass("filet-broken");
    // La marque est en tête de tuile, avant la vignette.
    expect(container.querySelector(".coiffe")!.nextElementSibling).toHaveClass("wash");
    rerender(<MosaicTile r={raindrop()} etat="ok" onOpen={() => undefined} />);
    expect(container.querySelector(".coiffe")).toBeNull();
  });

  // Symétrique du test de `.filet` : la coiffe n'a pas de padding aujourd'hui,
  // mais les deux règles doivent rester honnêtes sur la boîte de référence.
  it("la coiffe se peint depuis le bord de la vignette (§5)", () => {
    const style = injecterRegles(".coiffe");
    try {
      const { container } = render(<MosaicTile r={raindrop()} etat="dead" onOpen={() => undefined} />);
      expect(getComputedStyle(container.querySelector(".coiffe")!).backgroundOrigin).toBe("border-box");
    } finally {
      style.remove();
    }
  });

  // §2.1 : le glyphe de nature précède son libellé puis le domaine ; §7 : le
  // domaine en chasse fixe, et rien d'autre. Le libellé est la nature en
  // toutes lettres (2026-09-20).
  it("glyphe de nature puis domaine en chasse fixe", () => {
    const { container } = render(<MosaicTile r={raindrop({ type: "video" })} onOpen={() => undefined} />);
    const urls = container.querySelectorAll(".url");
    expect(urls[0]).toHaveTextContent("Vidéo");
    expect(urls[0]!.previousElementSibling?.tagName.toLowerCase()).toBe("svg");
    expect(urls[1]).toHaveTextContent("example.com");
  });
});

// Le retour d'usage du 2026-09-20 : les tuiles ne remplissaient pas le
// panneau — colonnes fixes de 221 px, reliquat vide sur la droite. La tuile
// s'étire désormais (221 px = plancher de colonne, vignette au ratio).
describe("MosaicTile — la tuile remplit sa colonne", () => {
  it("largeur fluide, jamais fixe — et la vignette garde le ratio du §8", () => {
    const { container } = render(<MosaicTile r={raindrop()} collectionRacine="Dev" onOpen={() => undefined} />);
    const tuile = container.firstElementChild as HTMLElement;
    expect(tuile.className).toContain("w-full");
    expect(tuile.className).not.toContain("w-[221px]");
    // Le ratio remplace la hauteur fixe : la vignette grandit AVEC la tuile.
    expect(tuile.querySelector(".wash")?.className).toContain("aspect-[221/118]");
    expect(tuile.querySelector(".wash")?.className).not.toContain("h-[118px]");
  });
});

// La nature est IDENTIFIÉE EN TOUTES LETTRES dans la vignette aussi
// (signalement 2026-09-20) — le glyphe seul exige de le deviner.
it("le libellé de la nature accompagne le domaine", () => {
  const { container } = render(<MosaicTile r={raindrop({ type: "video" })} onOpen={() => undefined} />);
  expect(container.textContent).toContain("Vidéo");
  // Le domaine reste SON nœud texte.
  expect(screen.getByText("example.com")).toBeInTheDocument();
});
