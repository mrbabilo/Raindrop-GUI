import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
// fixtures AVANT Sidebar : la factory vi.mock (hisée au-dessus des imports)
// référence `collections` — voir la note de useStaticData.test.tsx (TDZ).
import { collections } from "../test/fixtures";
import { Sidebar } from "./Sidebar";
import { AppStateProvider, useAppState } from "../state/appState";

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

const renderSidebar = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppStateProvider><Spy /><Sidebar /></AppStateProvider>
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
    expect(screen.getByText("Rust")).toBeInTheDocument(); // enfant indenté
    expect(screen.getByText("typescript")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("cliquer une collection change la vue", async () => {
    renderSidebar();
    await userEvent.click(screen.getByText("Dev"));
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({ kind: "list", collectionId: 101 });
  });

  // FIX ledger (revue finale) : DESIGN.md §8 — « retrait 14 px par niveau ».
  // L'enfant (niveau 1) porte donc 8 px (px-2 de la classe item) + 14 px de
  // retrait = 22 px ; l'ancien pl-6 (24 px) ne suivait pas la lettre.
  it("retrait d'arbre : 14 px par niveau — 22 px au niveau 1 (§8)", () => {
    renderSidebar();
    const enfant = screen.getByText("Rust").closest("button")!;
    expect(enfant).toHaveStyle({ paddingLeft: "22px" });
    expect(enfant.className).not.toContain("pl-6");
    // Le parent, racine, ne porte aucun retrait supplémentaire.
    const racine = screen.getByText("Dev").closest("button")!;
    expect(racine).not.toHaveStyle({ paddingLeft: "22px" });
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
