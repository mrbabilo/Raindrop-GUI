import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CarreCollection, PiluleEtiquette, filetEtat, racine } from "./Signaux";
import { collections } from "../test/fixtures";

// Ce que jsdom PEUT vérifier de DESIGN.md : que les variables de teinte
// arrivent bien sur les jetons. Il ne calcule aucune couleur oklch — le rendu
// se juge à l'œil (§captures du brief), pas ici.
const vars = (el: Element) => {
  const s = (el as HTMLElement).style;
  return { h: s.getPropertyValue("--h"), sat: s.getPropertyValue("--sat") };
};

describe("PiluleEtiquette", () => {
  it("porte la teinte de la thématique du mot (§3)", () => {
    const { container } = render(<PiluleEtiquette nom="python" />);
    const pilule = container.firstElementChild!;
    expect(pilule).toHaveClass("tag");
    expect(vars(pilule)).toEqual({ h: "250", sat: "1" }); // technique
  });

  it("hors lexique : gris par --sat 0, avec un --h NUMÉRIQUE (§3)", () => {
    const { container } = render(<PiluleEtiquette nom="zzz-inconnu" />);
    // --h doit valoir un nombre même sans thématique : sans valeur, la
    // déclaration oklch() de .tag est invalide et la pilule n'a plus AUCUN
    // fond — ce qui n'est pas le gris voulu. Le chroma 0 rend la teinte
    // sans effet, donc 0 est sûr.
    expect(vars(container.firstElementChild!)).toEqual({ h: "0", sat: "0" });
  });

  it("taille « detail » ajoute .tag-detail (21 px) sans remplacer .tag", () => {
    const { container } = render(<PiluleEtiquette nom="design" taille="detail" />);
    expect(container.firstElementChild).toHaveClass("tag", "tag-detail");
  });

  it("sans onClick : inerte (pas un bouton) — la pilule de la fiche n'agit pas", () => {
    render(<PiluleEtiquette nom="design" taille="detail" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("design")).toBeInTheDocument();
  });

  it("avec onClick : bouton cliquable qui n'ouvre pas la ligne (stopPropagation)", async () => {
    const onClick = vi.fn();
    const onRow = vi.fn();
    render(
      <div onClick={onRow}>
        <PiluleEtiquette nom="rust" onClick={onClick} />
      </div>,
    );
    await userEvent.click(screen.getByRole("button", { name: "rust" }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(onRow).not.toHaveBeenCalled();
  });
});

describe("CarreCollection", () => {
  it("carré teinté par la thématique du titre transmis (racine, §4)", () => {
    const { container } = render(<CarreCollection collectionId={101} titre="Cuisine" />);
    const carre = container.firstElementChild!;
    expect(carre).toHaveClass("coll-icon");
    expect(vars(carre)).toEqual({ h: "62", sat: "1" }); // maison
    // §4 : « jamais une case vide » — un dossier tient lieu d'icône tant que
    // le champ `cover` de Raindrop n'est pas exposé par le sidecar.
    expect(carre.querySelector("svg")).not.toBeNull();
  });

  it("collection inconnue (arbre pas encore chargé) : gris, jamais de repli coloré", () => {
    const { container } = render(<CarreCollection collectionId={999} />);
    expect(vars(container.firstElementChild!)).toEqual({ h: "0", sat: "0" });
  });
});

describe("racine — §4 : la couleur appartient à la racine", () => {
  it("une descendante hérite du titre de sa racine (Rust ⊂ Dev → Dev)", () => {
    expect(racine(collections, 201)?.title).toBe("Dev");
  });

  it("une racine se rend elle-même ; un id inconnu ne rend rien", () => {
    expect(racine(collections, 101)?.title).toBe("Dev");
    expect(racine(collections, 999)).toBeUndefined();
  });

  it("une boucle de parents ne fait pas tourner la remontée à l'infini", () => {
    const boucle = [
      { id: 1, title: "A", parentId: 2, count: 0, public: false, view: "list", cover: null, color: null },
      { id: 2, title: "B", parentId: 1, count: 0, public: false, view: "list", cover: null, color: null },
    ];
    expect(racine(boucle, 1)).toBeDefined(); // termine, quel que soit le nœud rendu
  });
});

describe("filetEtat", () => {
  it("un état sain ne rend AUCUNE classe (§5 : la marque n'apparaît qu'en cas de problème)", () => {
    expect(filetEtat("ok")).toBe("");
    expect(filetEtat(undefined)).toBe("");
    expect(filetEtat(null)).toBe("");
  });

  it("chaque diagnostic a sa forme (§5)", () => {
    expect(filetEtat("dead")).toBe("filet-broken");
    expect(filetEtat("redirect")).toBe("filet-moved");
    expect(filetEtat("indeterminate")).toBe("filet-unsure");
    expect(filetEtat("duplicate")).toBe("filet-duplicate");
  });
});
