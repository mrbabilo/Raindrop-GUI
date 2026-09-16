import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
// fixtures AVANT CommandPalette : la factory vi.mock (hisée au-dessus des
// imports) référence `collections`/`tags` — voir la note de Sidebar.test.tsx
// (TDZ).
import { collections, tags } from "../test/fixtures";
import { CommandPalette } from "./CommandPalette";
import { AppStateProvider, useAppState } from "../state/appState";

vi.mock("../hooks/useStaticData", () => ({
  useCollections: () => ({ data: collections }),
  useTags: () => ({ data: tags }),
}));

// Faux serveur routé par recherche : il ne renvoie le bookmark que pour une
// requête « rust », les autres reviennent vides — comme un vrai serveur.
// (Ruling 2a : le mock unique du brief rendait le test « Design » non
// déterministe — le bookmark « rust async » passait en tête de rangées.)
const getMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/api", () => ({ api: { get: getMock } }));

const rustBookmark = {
  id: 555, title: "rust async", url: "https://x", domain: "x", tags: [],
  excerpt: "", created: "2025-01-01", lastUpdate: "2025-01-01",
  important: false, type: "link", cover: null, collectionId: 101, note: "",
};

function mockApi() {
  getMock.mockReset().mockImplementation((path: string, query?: { search?: string }) => {
    if (path === "/api/raindrops" && (query?.search ?? "").toLowerCase().includes("rust"))
      return Promise.resolve({ items: [rustBookmark] });
    return Promise.resolve({ items: [] });
  });
}

// Le Spy sérialise la vue ENTIÈRE : les assertions portent sur la navigation
// (collectionId, search), pas sur un fragment (ruling 2a).
const Spy = () => {
  const { view } = useAppState();
  return <span data-testid="view">{JSON.stringify(view)}</span>;
};

const renderPalette = (query = "", onClose: () => void = () => undefined) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppStateProvider><Spy /><CommandPalette open onClose={onClose} initialQuery={query} /></AppStateProvider>
    </QueryClientProvider>,
  );

describe("CommandPalette", () => {
  beforeEach(mockApi);

  it("filtre collections et tags localement, et lance la recherche serveur", async () => {
    renderPalette("rust");
    await waitFor(() => expect(screen.getByText("rust async")).toBeInTheDocument());
    expect(screen.getByText("Rust")).toBeInTheDocument();   // collection (filtre local)
    expect(screen.getByText("#rust")).toBeInTheDocument();  // tag (filtre local)
    expect(getMock).toHaveBeenCalledWith("/api/raindrops", { search: "rust", per_page: 8 });
  });

  it("ne déclenche la recherche serveur qu'à partir de 2 caractères", () => {
    renderPalette("r");
    // Le filtre local travaille dès 1 caractère…
    expect(screen.getByText("Rust")).toBeInTheDocument();
    expect(screen.getByText("#rust")).toBeInTheDocument();
    // …mais le serveur reste au repos (contrat porté seul par `enabled`,
    // ruling 2b — l'ancien filtre mort du snippet ne disait rien).
    expect(screen.queryByText("rust async")).not.toBeInTheDocument();
    expect(getMock).not.toHaveBeenCalled();
  });

  it("Entrée sur une collection navigue (collectionId 102) et ferme", async () => {
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AppStateProvider><Spy /><CommandPalette open onClose={onClose} initialQuery="Design" /></AppStateProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("Design")).toBeInTheDocument());
    await userEvent.type(screen.getByRole("combobox"), "{Enter}");
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({
      kind: "list", collectionId: 102, label: "Design",
    });
    expect(onClose).toHaveBeenCalled();
  });

  // R11P-1 : la navigation tag porte label ET search `#tag` — sinon
  // listQuery lit view.search absent et affiche « Tous » non filtré.
  it("cliquer un tag navigue vers la vue filtrée #tag", async () => {
    renderPalette("rust");
    await waitFor(() => expect(screen.getByText("#rust")).toBeInTheDocument());
    await userEvent.click(screen.getByText("#rust"));
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({
      kind: "list", collectionId: 0, label: "#rust", search: "#rust",
    });
  });

  it("les flèches déplacent la sélection, Échap ferme sans naviguer", async () => {
    const onClose = vi.fn();
    renderPalette("", onClose);
    // Requête vide : tout le local matche — 3 collections + 3 tags + 4 vues,
    // serveur au repos (0 < 2 caractères).
    expect(screen.getAllByRole("option")).toHaveLength(10);
    await userEvent.type(screen.getByRole("combobox"), "{ArrowDown}{ArrowDown}");
    expect(screen.getAllByRole("option")[2]).toHaveAttribute("aria-selected", "true");
    await userEvent.type(screen.getByRole("combobox"), "{ArrowUp}");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    await userEvent.type(screen.getByRole("combobox"), "{Escape}");
    expect(onClose).toHaveBeenCalled();
    // Aucune navigation déclenchée : la vue initiale est intacte.
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({ kind: "list", collectionId: 0 });
  });
});
