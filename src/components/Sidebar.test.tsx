import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitForElementToBeRemoved } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
// fixtures AVANT Sidebar : la factory vi.mock (hisée au-dessus des imports)
// référence `collections` — voir la note de useStaticData.test.tsx (TDZ).
import { collections } from "../test/fixtures";
import { Sidebar } from "./Sidebar";
import { AppStateProvider, useAppState } from "../state/appState";
import { DragProvider, useDrag } from "../state/drag";

// « Masqué si nul » (§9) : une collection racine et une étiquette à 0 item
// s'ajoutent aux fixtures — elles n'existent que pour ce contrat.
vi.mock("../hooks/useStaticData", () => ({
  useCollections: () => ({
    data: [...collections, { id: 103, title: "Vide", parentId: null, count: 0, public: false, view: "list", cover: null, color: null }],
    isLoading: false,
  }),
  useTags: () => ({ data: [{ name: "typescript", count: 8 }, { name: "orphelin", count: 0 }], isLoading: false }),
}));

const Spy = () => {
  const { view } = useAppState();
  return <span data-testid="view">{JSON.stringify(view)}</span>;
};

// Déclencheur de déplacement : ce que fait la liste quand le seuil est
// franchi (useDragBookmark.commencer).
const Tirer = () => {
  const { commencer } = useDrag();
  return <button type="button" onClick={() => commencer([1000], "un signet")}>tirer</button>;
};

const renderSidebar = (avecDrag = false) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppStateProvider>
        <DragProvider>
          <Spy />
          {avecDrag && <Tirer />}
          <Sidebar />
        </DragProvider>
      </AppStateProvider>
    </QueryClientProvider>,
  );

describe("Sidebar", () => {
  it("affiche vues fixes, collections (arbre) et tags", () => {
    renderSidebar();
    expect(screen.getByText("Tous")).toBeInTheDocument();
    expect(screen.getByText("Non-lus")).toBeInTheDocument();
    expect(screen.getByText("Favoris")).toBeInTheDocument();
    expect(screen.getByText("Corbeille")).toBeInTheDocument();
    expect(screen.getByText("Dev")).toBeInTheDocument();
    // « Rust » est un enfant : replié par défaut, il n'est pas rendu (§9).
    expect(screen.queryByText("Rust")).not.toBeInTheDocument();
    expect(screen.getByText("typescript")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  // Une collection QUI A des enfants ouvre la vue composite (ses signets
  // directs, puis une section par sous-collection) ; une feuille ouvre la
  // liste ordinaire. C'est la seule branche de navigation à deux issues.
  it("cliquer une collection parente ouvre la vue collection", async () => {
    renderSidebar();
    await userEvent.click(screen.getByText("Dev")); // Dev a Rust pour enfant
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({
      kind: "collection", collectionId: 101,
    });
  });

  it("cliquer une collection sans enfant ouvre la liste", async () => {
    renderSidebar();
    await userEvent.click(screen.getByText("Design")); // aucune enfant
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({
      kind: "list", collectionId: 102,
    });
  });

  it("cliquer une sous-collection ouvre la liste, jamais la vue composite", async () => {
    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Déplier Dev" }));
    await userEvent.click(screen.getByText("Rust"));
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({
      kind: "list", collectionId: 201,
    });
  });

  // DESIGN.md §8 : « retrait 14 px par niveau » — mesuré depuis le contenu du
  // PARENT, pas depuis le bord de la barre. Le chevron pousse le parent à
  // 35 px (19 de gouttière + 8 de gap + 8 de padding) : l'enfant se pose donc
  // à 49. Mesuré au navigateur, l'ancien 22 px le plaçait 13 px À GAUCHE de
  // son parent, et la hiérarchie se lisait à l'envers.
  it("retrait d'arbre : l'enfant est 14 px à DROITE du contenu de son parent (§8)", async () => {
    renderSidebar();
    await userEvent.hover(screen.getByText("Dev"));
    const enfant = (await screen.findByText("Rust")).closest("button")!;
    expect(enfant).toHaveStyle({ paddingLeft: "49px" });
    // Le parent, racine, ne porte aucun retrait supplémentaire.
    const racine = screen.getByText("Dev").closest("button")!;
    expect(racine).not.toHaveStyle({ paddingLeft: "49px" });
  });

  // DESIGN.md §9 « masqué si nul » : un compteur à 0 ne s'affiche pas — le
  // nom de la collection (ou de l'étiquette) reste, seul le chiffre sort.
  it("compteur masqué à 0, affiché sinon (§9)", () => {
    renderSidebar();
    const vide = screen.getByText("Vide").closest("button")!;
    expect(vide.textContent).not.toContain("0");
    const orphelin = screen.getByText("orphelin").closest("button")!;
    expect(orphelin.textContent).not.toContain("0");
    // Contrôle positif : les compteurs non nuls restent posés.
    expect(screen.getByText("Dev").closest("button")!.textContent).toContain("12");
    expect(screen.getByText("typescript").closest("button")!.textContent).toContain("8");
  });

  // DESIGN.md §9 « révélé, pas posé » : l'arbre s'explore au pointeur. Un
  // parent déplie ses enfants au survol ; les quitter les replie, mais pas
  // tout de suite — un simple passage du pointeur ne doit pas faire clignoter
  // la sidebar.
  it("un parent déplie au survol et replie APRÈS un délai", async () => {
    const user = userEvent.setup();
    renderSidebar();
    expect(screen.queryByText("Rust")).not.toBeInTheDocument();
    await user.hover(screen.getByText("Dev"));
    expect(screen.getByText("Rust")).toBeInTheDocument();

    await user.unhover(screen.getByText("Dev"));
    // Toujours là juste après : le repli est différé.
    expect(screen.getByText("Rust")).toBeInTheDocument();
    await waitForElementToBeRemoved(() => screen.queryByText("Rust"), { timeout: 1500 });
  });

  // Survoler un ENFANT ne quitte pas le groupe : sans cela, viser un enfant
  // le ferait disparaître sous le pointeur.
  it("survoler un enfant garde le groupe déplié", async () => {
    const user = userEvent.setup();
    renderSidebar();
    await user.hover(screen.getByText("Dev"));
    await user.hover(screen.getByText("Rust"));
    // Laisser passer largement le délai de repli.
    await new Promise((r) => setTimeout(r, 600));
    expect(screen.getByText("Rust")).toBeInTheDocument();
  });

  // Le survol n'existe pas au clavier : le chevron est le SEUL accès au
  // pliage pour qui n'a pas de souris. Il n'est pas un doublon du survol,
  // il en est l'équivalent accessible.
  // `fireEvent.click` et non `userEvent.click` : ce dernier survole avant de
  // cliquer, et le survol déplie déjà — on testerait alors le chemin souris,
  // où le chevron affiche « Replier » et replie bel et bien. Ici c'est le
  // chemin CLAVIER qui est en cause : activer le chevron sans jamais survoler.
  it("le chevron plie et déplie sans survol (clavier), et dit son état", async () => {
    renderSidebar();
    const chevron = screen.getByRole("button", { name: "Déplier Dev" });
    expect(chevron).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(chevron);
    expect(screen.getByText("Rust")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replier Dev" })).toHaveAttribute("aria-expanded", "true");
    // Déplié à la main, le groupe ne se replie pas tout seul au leave.
    fireEvent.pointerLeave(screen.getByText("Dev").closest("div.group")!);
    await new Promise((r) => setTimeout(r, 600));
    expect(screen.getByText("Rust")).toBeInTheDocument();
    // Et le chevron le referme.
    fireEvent.click(screen.getByRole("button", { name: "Replier Dev" }));
    expect(screen.queryByText("Rust")).not.toBeInTheDocument();
  });

  // §9 « masqué si nul » : pas d'enfants, pas de chevron.
  it("une collection sans enfant n'a pas de chevron", () => {
    renderSidebar();
    expect(screen.queryByRole("button", { name: /plier Design/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Déplier Dev" })).toBeInTheDocument();
  });

  // Sans cela, cliquer un enfant replierait le groupe d'où l'on vient et
  // ferait perdre le contexte de la vue courante.
  it("le parent de la vue courante reste déplié", async () => {
    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Déplier Dev" }));
    fireEvent.click(screen.getByText("Rust"));
    // Le pointeur quitte la sidebar : seul « la vue est là-dedans » retient
    // encore le groupe ouvert.
    fireEvent.pointerLeave(screen.getByText("Dev").closest("div.group")!);
    await new Promise((r) => setTimeout(r, 600));
    expect(screen.getByText("Rust")).toBeInTheDocument();
  });

  // Le grief : plus de 250 arrêts de tabulation avant d'atteindre la liste,
  // un par étiquette. La barre n'en prend qu'un.
  it("toute la barre ne prend qu'un seul arrêt de tabulation", () => {
    renderSidebar();
    const navigables = [...document.querySelectorAll<HTMLElement>("nav [data-nav]")];
    expect(navigables.length).toBeGreaterThan(5);
    expect(navigables.filter((e) => e.tabIndex === 0)).toHaveLength(1);
  });

  // Le chevron reste cliquable, mais il n'est plus un arrêt : →/← plient
  // depuis la ligne du parent, là où le focus se trouve déjà.
  it("le chevron n'est pas un arrêt de tabulation", () => {
    renderSidebar();
    expect(screen.getByRole("button", { name: "Déplier Dev" }).tabIndex).toBe(-1);
  });

  it("les flèches verticales circulent dans la barre", async () => {
    renderSidebar();
    const premier = screen.getByRole("button", { name: "Tous" });
    premier.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "Non-lus" })).toHaveFocus();
  });

  // « →/← déplient/replient un parent » : le pliage au clavier passe par la
  // ligne du parent, pas par le chevron.
  it("→ déplie le parent focalisé, ← le replie", async () => {
    renderSidebar();
    const dev = screen.getByText("Dev").closest("button")!;
    dev.focus();
    expect(screen.queryByText("Rust")).not.toBeInTheDocument();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByText("Rust")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.queryByText("Rust")).not.toBeInTheDocument();
  });

  // « Échap remonte d'un niveau et rend le focus » : la barre rend la main
  // à la page plutôt que de retenir le clavier.
  it("Échap rend le focus", async () => {
    renderSidebar();
    const dev = screen.getByText("Dev").closest("button")!;
    dev.focus();
    await userEvent.keyboard("{Escape}");
    expect(dev).not.toHaveFocus();
  });

  // §4 : UNE couleur par famille, le rang se lit à l'intensité du lavis et
  // au retrait — pas à la teinte, qu'ils partagent désormais.
  it("parent et enfant partagent la teinte, pas le rang", async () => {
    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Déplier Dev" }));
    const parent = screen.getByText("Dev").closest(".nav-ligne") as HTMLElement;
    const enfant = screen.getByText("Rust").closest(".nav-ligne") as HTMLElement;
    expect(parent.style.getPropertyValue("--h")).toBe(enfant.style.getPropertyValue("--h"));
    expect(parent.getAttribute("data-niveau")).toBe("0");
    expect(enfant.getAttribute("data-niveau")).toBe("1");
  });

  // Une collection n'est une cible que PENDANT un déplacement : au repos,
  // survoler la sidebar ne doit rien allumer.
  it("les collections ne s'allument qu'en cours de déplacement", async () => {
    renderSidebar(true);
    const ligne = screen.getByText("Dev").closest(".nav-ligne")!;
    await userEvent.hover(ligne);
    expect(ligne.className).not.toContain("outline");

    await userEvent.click(screen.getByText("tirer"));
    await userEvent.hover(ligne);
    expect(ligne.className).toContain("outline");
    await userEvent.unhover(ligne);
    expect(ligne.className).not.toContain("outline");
  });

  // La corbeille n'accueille rien : y glisser un signet l'effacerait d'un
  // geste, sans confirmation — la mise à la corbeille est un verbe (§10).
  // « Tous » et les marqueurs d'état ne sont pas davantage des lieux.
  it("corbeille, Tous, Non-lus et Favoris n'accueillent aucun dépôt", async () => {
    renderSidebar(true);
    await userEvent.click(screen.getByText("tirer"));
    for (const nom of ["Corbeille", "Tous", "Non-lus", "Favoris"]) {
      const entree = screen.getByText(nom).closest(".nav-ligne") ?? screen.getByText(nom).closest("button")!;
      // Comparer l'avant et l'après : « Tous » est la vue COURANTE et porte
      // déjà `bg-app-sel` de ce fait — c'est la même surface pour dire deux
      // choses, seul son apparition au survol trahirait une cible.
      const avant = entree.className;
      await userEvent.hover(entree);
      expect(entree.className).toBe(avant);
    }
  });

  // R11P-1 : cliquer un tag FILTRE la liste — la vue porte search `#tag`
  // (filtre serveur prouvé en réel : search=#webdesign → count exact du tag).
  // Sans `search`, listQuery lit view.search absent : « Tous » non filtré.
  it("cliquer un tag filtre la liste par la recherche #tag", async () => {
    renderSidebar();
    await userEvent.click(screen.getByText("typescript"));
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({
      kind: "list",
      collectionId: 0,
      search: "#typescript",
    });
  });
});
