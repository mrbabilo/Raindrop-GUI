import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CarreCollection, PiluleEtiquette, filetEtat, racine, teinteCollection } from "./Signaux";
import type { Collection } from "../../shared/types";
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
describe("teinteCollection (§4, cascade)", () => {
  const col = (id: number, title: string, parentId: number | null, color: string | null = null) =>
    ({ id, title, parentId, count: 0, public: false, view: "list", cover: null, color }) as Collection;

  // 68 collections sur 216 portent une couleur ; les 148 autres héritent.
  const arbre = [
    col(1, "Racine", null, "#2394f4"),      // bleu, teinte ~250°
    col(2, "Enfant coloré", 1, "#f44434"),  // rouge, teinte ~29,5°
    col(3, "Enfant nu", 1),                 // hérite du bleu de sa racine
    col(4, "Orpheline", null),              // rien : ni couleur ni racine
    col(5, "Photo", null),                  // rien, mais le lexique connaît
  ] as Collection[];
  const h = (id: number) => Number((teinteCollection(arbre, id) as Record<string, string>)["--h"]);
  const sat = (id: number) => (teinteCollection(arbre, id) as Record<string, string>)["--sat"];

  it("sa propre couleur prime", () => {
    expect(h(2)).toBeCloseTo(29.5, 0);
    expect(h(1)).toBeCloseTo(250, 0);
  });

  // Sans héritage, la barre latérale serait grise aux deux tiers.
  it("à défaut, la couleur de sa racine", () => {
    expect(h(3)).toBeCloseTo(250, 0);
    expect(sat(3)).toBe("1");
  });

  it("à défaut encore, la thématique du titre", () => {
    expect(sat(5)).toBe("1"); // « Photo » est au lexique
  });

  // §3 : hors de tout, gris — et un --h NUMÉRIQUE malgré tout, sinon
  // `oklch(L C var(--h))` est invalide et le jeton perd son fond.
  it("hors de tout : gris, avec une teinte numérique quand même", () => {
    expect(sat(4)).toBe("0");
    expect(Number.isFinite(h(4))).toBe(true);
  });
});

describe("CarreCollection — icône Raindrop", () => {
  it("affiche l'icône quand la collection en a une, POSÉE sur sa teinte", () => {
    const { container } = render(<CarreCollection collectionId={1} titre="Dev" cover="https://up.raindrop.io/x.png" />);
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("src", "https://up.raindrop.io/x.png");
    // Mesuré au navigateur : à pleine taille (18 px dans 18), l'icône
    // masquait entièrement le fond teinté et la couleur disparaissait.
    expect(img.className).toContain("h-[13px]");
    expect(img.className).not.toContain("h-full");
  });

  // « Jamais une case vide » (§4) vaut aussi pour une image qui ne CHARGE
  // pas : `cover` est une vignette distante, et l'une d'elles a déjà rendu
  // 403 pendant cette session.
  it("une icône qui échoue retombe sur le dossier teinté", () => {
    const { container } = render(<CarreCollection collectionId={1} titre="Dev" cover="https://exemple.invalide/x.png" />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("sans icône, le dossier teinté", () => {
    const { container } = render(<CarreCollection collectionId={1} titre="Dev" cover={null} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

