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

vi.mock("../hooks/useStaticData", () => ({
  useCollections: () => ({ data: collections, isLoading: false }),
  useTags: () => ({ data: [{ name: "typescript", count: 8 }], isLoading: false }),
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
