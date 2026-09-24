import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
// fixtures AVANT ListPane (TDZ — la factory vi.mock référence `collections`).
import { collections } from "../test/fixtures";
import { ListPane } from "./ListPane";
import { AppStateProvider, useAppState, type View } from "../state/appState";

// La liste VIDE (audit UX du 2026-09-23). « Rien ici » se disait aussi quand
// un FILTRE vidait la liste : un constat, sans dire ce qui filtre ni comment
// le retirer — DESIGN §10, « un écran vide est une invitation à agir ».
vi.mock("../hooks/useAnalysis", () => ({ useEtatsAnalyse: () => ({ data: undefined }) }));
vi.mock("../hooks/useRaindrops", () => ({
  useRaindrops: () => ({
    data: { pages: [{ items: [], count: 0, page: 0, perPage: 50 }] },
    isError: false, isFetching: false, refetch: vi.fn(),
    fetchNextPage: vi.fn(), hasNextPage: false, isFetchingNextPage: false,
  }),
}));
vi.mock("../hooks/useStaticData", () => ({ useCollections: () => ({ data: collections, isLoading: false }) }));

const Spy = () => {
  const { view } = useAppState();
  return <span data-testid="view">{JSON.stringify(view)}</span>;
};
const Aller = ({ vers }: { vers: View }) => {
  const { go } = useAppState();
  return <button type="button" onClick={() => go(vers)}>aller</button>;
};
const monter = async (vers: View) => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppStateProvider><Spy /><Aller vers={vers} /><ListPane /></AppStateProvider>
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByText("aller"));
};
const vue = () => JSON.parse(screen.getByTestId("view").textContent!);

describe("ListPane — une liste vide dit pourquoi, et comment en sortir", () => {
  it("vidée par des filtres : le dit, et « Effacer la recherche et les filtres » les retire tous", async () => {
    await monter({ kind: "list", collectionId: 101, label: "Dev", search: "zz", tags: ["rust"], media: "video", domain: "a.fr", sort: "title", viewMode: "mosaic" });
    expect(screen.getByText("Aucun signet ne correspond à la recherche et aux filtres.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Effacer la recherche et les filtres" }));
    // Les FILTRES partent ; la collection, le tri et l'affichage restent.
    expect(vue()).toEqual({ kind: "list", collectionId: 101, label: "Dev", sort: "title", viewMode: "mosaic" });
  });

  it("une collection réellement vide invite à y coller une URL — sans bouton d'effacement", async () => {
    await monter({ kind: "list", collectionId: 101, label: "Dev" });
    expect(screen.getByText("Aucun signet ici — collez une URL ci-dessus pour en ajouter un.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Effacer la recherche et les filtres" })).not.toBeInTheDocument();
  });

  it("la corbeille vide se dit comme telle", async () => {
    await monter({ kind: "list", collectionId: -99, label: "Corbeille" });
    expect(screen.getByText("La corbeille est vide.")).toBeInTheDocument();
  });
});
