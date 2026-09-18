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

  // Le retrait d'arbre est porté par la BANDE, qui démarre sous la pastille
  // de la mère — le décrochement dit le rang avant qu'on lise le titre. Le
  // contenu, lui, reprend le padding ordinaire : un padding de retrait EN
  // PLUS du décrochement doublerait l'indentation.
  it("la bande d'une sous-collection décroche, son contenu non", async () => {
    renderSidebar();
    await userEvent.hover(screen.getByText("Dev"));
    const enfant = (await screen.findByText("Rust")).closest("button")!;
    expect(enfant.getAttribute("style") ?? "").not.toContain("padding-left");
    const bande = screen.getByText("Rust").closest(".nav-ligne")!;
    expect(bande.getAttribute("data-niveau")).toBe("1");
    // La racine, elle, ne décroche pas.
    expect(screen.getByText("Dev").closest(".nav-ligne")!.getAttribute("data-niveau")).toBe("0");
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
  it("le chevron épingle le groupe ouvert, et le referme au clic suivant", async () => {
    renderSidebar();
    const chevron = screen.getByRole("button", { name: "Déplier Dev" });
    expect(chevron).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(chevron);
    expect(screen.getByText("Rust")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replier Dev" })).toHaveAttribute("aria-expanded", "true");
    // Épinglé : le groupe ne se replie pas en quittant le survol.
    fireEvent.pointerLeave(screen.getByText("Dev").closest("div.group")!);
    await new Promise((r) => setTimeout(r, 600));
    expect(screen.getByText("Rust")).toBeInTheDocument();
    // Et le clic suivant le referme.
    fireEvent.click(screen.getByRole("button", { name: "Replier Dev" }));
    expect(screen.queryByText("Rust")).not.toBeInTheDocument();
  });

  // Le grief : survolé, un groupe est déjà ouvert — cliquer son chevron le
  // refermait alors qu'on venait de demander à le retenir.
  it("cliquer le chevron d'un groupe DÉJÀ ouvert par le survol l'épingle", async () => {
    const user = userEvent.setup();
    renderSidebar();
    await user.hover(screen.getByText("Dev"));
    expect(screen.getByText("Rust")).toBeInTheDocument(); // ouvert par le survol
    await user.click(screen.getByRole("button", { name: "Replier Dev" }));
    expect(screen.getByText("Rust")).toBeInTheDocument(); // et non refermé
    fireEvent.pointerLeave(screen.getByText("Dev").closest("div.group")!);
    await new Promise((r) => setTimeout(r, 600));
    expect(screen.getByText("Rust")).toBeInTheDocument(); // épinglé pour de bon
  });

  // Cliquer la collection elle-même la fixe ouverte, comme son chevron.
  it("cliquer la collection mère l'épingle, un nouveau clic la referme", async () => {
    const user = userEvent.setup();
    renderSidebar();
    await user.click(screen.getByText("Dev"));
    fireEvent.pointerLeave(screen.getByText("Dev").closest("div.group")!);
    await new Promise((r) => setTimeout(r, 600));
    expect(screen.getByText("Rust")).toBeInTheDocument();

    await user.click(screen.getByText("Dev"));
    fireEvent.pointerLeave(screen.getByText("Dev").closest("div.group")!);
    await new Promise((r) => setTimeout(r, 600));
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

  // R11P-1 : cliquer un tag FILTRE la liste (filtre serveur prouvé en réel :
  // search=#webdesign → count exact du tag). La barre latérale NAVIGUE : elle
  // ouvre un écran filtré sur cette seule étiquette, là où la pilule d'une
  // ligne ajuste le filtre courant.
  it("cliquer un tag ouvre la liste filtrée sur ce tag", async () => {
    renderSidebar();
    await userEvent.click(screen.getByText("typescript"));
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({
      kind: "list",
      collectionId: 0,
      tags: ["typescript"],
    });
  });
});
