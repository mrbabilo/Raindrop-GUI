import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// fixtures AVANT RaindropRow (TDZ — même remarque que Sidebar.test.tsx).
import { raindrop } from "../test/fixtures";
import { RaindropRow } from "./RaindropRow";

const noop = () => undefined;
const ligne = (props: Partial<Parameters<typeof RaindropRow>[0]> = {}) =>
  render(
    <RaindropRow
      r={raindrop({ tags: ["python", "zzz-inconnu"] })}
      selected={false}
      isDetail={false}
      onOpen={noop}
      onToggle={noop}
      onTag={noop}
      {...props}
    />,
  );

// jsdom ne calcule aucune couleur oklch et ne mesure aucune hauteur : ce
// fichier vérifie que les SIGNAUX de DESIGN.md §2 sont câblés (quels
// éléments, quelles classes, quelles variables), pas leur rendu — qui se
// juge à l'œil.
describe("RaindropRow — signalétique (DESIGN.md §2)", () => {
  it("porte les trois signaux d'une ligne saine : collection, étiquettes, nature", () => {
    const { container } = ligne({ collectionRacine: "Dev" });
    // Carré de collection, teinté par la RACINE (§4) : Dev → technique (250).
    const carre = screen.getByTestId("coll-101");
    expect(carre).toHaveClass("coll-icon");
    expect(carre.style.getPropertyValue("--h")).toBe("250");
    // Étiquettes en pilules teintées, plus en texte « #tag ».
    expect(screen.getByText("python")).toHaveClass("tag");
    expect(screen.queryByText("#python")).toBeNull();
    // §3 : un mot hors lexique reste gris — c'est le résultat attendu.
    expect(screen.getByText("zzz-inconnu").style.getPropertyValue("--sat")).toBe("0");
    // §2.1/§7 : le glyphe de nature précède le domaine, qui est en chasse fixe.
    const domaine = container.querySelector(".url");
    expect(domaine).toHaveTextContent("example.com");
    expect(domaine!.previousElementSibling?.tagName.toLowerCase()).toBe("svg");
  });

  it("une ligne saine ne porte AUCUN filet d'état (§2 : le quatrième signal est conditionnel)", () => {
    const { container } = ligne();
    const row = container.querySelector("[data-testid='row-1000']")!;
    expect(row).not.toHaveClass("filet");
    expect(row.className).not.toContain("filet-");
  });

  it("un item à problème porte le filet de son diagnostic (§5)", () => {
    const { container, rerender } = ligne({ etat: "redirect" });
    const row = () => container.querySelector("[data-testid='row-1000']")!;
    expect(row()).toHaveClass("filet", "filet-moved");
    const props = { r: raindrop(), selected: false, isDetail: false, onOpen: noop, onToggle: noop, onTag: noop };
    rerender(<RaindropRow {...props} etat="dead" />);
    expect(row()).toHaveClass("filet", "filet-broken");
    rerender(<RaindropRow {...props} etat="duplicate" />);
    expect(row()).toHaveClass("filet", "filet-duplicate");
    rerender(<RaindropRow {...props} etat="ok" />);
    expect(row()).not.toHaveClass("filet");
  });

  it("cliquer une étiquette filtre sans ouvrir la fiche", async () => {
    const onTag = vi.fn();
    const onOpen = vi.fn();
    ligne({ onTag, onOpen });
    await userEvent.click(screen.getByRole("button", { name: "python" }));
    expect(onTag).toHaveBeenCalledWith("python");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("collection inconnue de l'arbre : carré gris, jamais de repli coloré", () => {
    ligne();
    expect(screen.getByTestId("coll-101").style.getPropertyValue("--sat")).toBe("0");
  });
});
