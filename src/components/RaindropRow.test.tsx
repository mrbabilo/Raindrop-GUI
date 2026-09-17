import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// fixtures AVANT RaindropRow (TDZ — même remarque que Sidebar.test.tsx).
import { raindrop } from "../test/fixtures";
import { RaindropRow } from "./RaindropRow";
import { injecterRegles } from "../test/injectStyles";

const noop = () => undefined;
const ligne = (props: Partial<Parameters<typeof RaindropRow>[0]> = {}) =>
  render(
    <RaindropRow
      r={raindrop({ tags: ["python", "zzz-inconnu"] })}
      selected={false}
      isDetail={false}
      poignee={{ onPointerDown: noop, onClick: noop }}
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
    const props = { r: raindrop(), selected: false, isDetail: false, poignee: { onPointerDown: noop, onClick: noop }, onToggle: noop, onTag: noop };
    rerender(<RaindropRow {...props} etat="dead" />);
    expect(row()).toHaveClass("filet", "filet-broken");
    rerender(<RaindropRow {...props} etat="duplicate" />);
    expect(row()).toHaveClass("filet", "filet-duplicate");
    rerender(<RaindropRow {...props} etat="ok" />);
    expect(row()).not.toHaveClass("filet");
  });

  // Les autres assertions de filet ne portent que sur des noms de classe :
  // jsdom ne peint rien, donc aucune ne peut attraper une bande qui s'affiche
  // au mauvais endroit. Celle-ci injecte la règle `.filet` RÉELLE (lue dans
  // src/styles.css, jamais recopiée ici) et vérifie la déclaration qui décide
  // de son origine. Sans `background-origin: border-box`, la bande se peint
  // dans la boîte de padding — soit, avec le `px-3` de la ligne, à 12 px du
  // bord, DERRIÈRE la case à cocher (les fonds se peignent sous le contenu
  // des descendants) : §2 « filet de 3 px en bord de ligne » et §5 « la
  // marque borde la ligne » ne seraient satisfaits ni l'un ni l'autre.
  // jsdom ne fait aucune mise en page : ce test prouve que la déclaration
  // atteint l'élément, pas la géométrie peinte — celle-ci se juge à l'œil.
  it("le filet part du bord de la ligne, pas du bord de padding (§2, §5)", () => {
    const style = injecterRegles(".filet");
    try {
      const { container } = ligne({ etat: "dead" });
      const row = container.querySelector("[data-testid='row-1000']")!;
      expect(getComputedStyle(row).backgroundOrigin).toBe("border-box");
    } finally {
      style.remove();
    }
  });

  it("cliquer une étiquette filtre sans ouvrir la fiche", async () => {
    const onTag = vi.fn();
    const onClick = vi.fn();
    ligne({ onTag, poignee: { onPointerDown: noop, onClick } });
    await userEvent.click(screen.getByRole("button", { name: "python" }));
    expect(onTag).toHaveBeenCalledWith("python");
    expect(onClick).not.toHaveBeenCalled();
  });

  it("collection inconnue de l'arbre : carré gris, jamais de repli coloré", () => {
    ligne();
    expect(screen.getByTestId("coll-101").style.getPropertyValue("--sat")).toBe("0");
  });

  // Revue finale (FIX ledger) : l'étoile de la liste est la MÊME icône au
  // trait que la fiche (§9, R8P-2) — plus d'étoile pleine locale.
  it("l'étoile de favori de la liste est au trait, unifiée avec la fiche (§9)", () => {
    ligne({ r: raindrop({ important: true }) });
    const svg = screen.getByRole("img", { name: "Favori" }).querySelector("svg")!;
    expect(svg).toHaveAttribute("fill", "none");
    expect(svg).toHaveAttribute("width", "15");
  });
});
