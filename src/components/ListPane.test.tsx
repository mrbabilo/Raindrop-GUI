import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
// fixtures AVANT ListPane : la factory vi.mock (hisée au-dessus des imports)
// référence `raindrop` — piège TDZ documenté dans useStaticData.test.tsx.
import { raindrop } from "../test/fixtures";
import { ListPane } from "./ListPane";
import { AppStateProvider, useAppState } from "../state/appState";

vi.mock("../hooks/useRaindrops", () => ({
  useRaindrops: () => ({
    data: { pages: [{ items: [raindrop({ id: 1000 }), raindrop({ id: 1001, title: "Second", tags: ["rust", "design"] })], count: 2, page: 0, perPage: 50 }] },
    fetchNextPage: vi.fn(), hasNextPage: false, isFetchingNextPage: false,
  }),
}));

// jsdom ne fait pas de layout : offsetHeight vaut 0 et le virtualizer en
// déduit une plage vide (virtual-core : outerSize === 0 → range null →
// getVirtualItems []). On simule une fenêtre de défilement de 600 px, le
// temps du fichier — l'ombre sur HTMLElement.prototype masque le getter
// d'Element.prototype et `delete` la retire sans toucher à l'original.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 600 });
});
afterAll(() => {
  delete (HTMLElement.prototype as unknown as { offsetHeight?: unknown }).offsetHeight;
});

// Assertion du détail : le brief propose le span dans App ou le Spy —
// même pattern que Task 5/6 ; le Spy évite de polluer App.
const Spy = () => {
  const { selectedRaindropId } = useAppState();
  return <span data-testid="detail-id" className="hidden">{selectedRaindropId}</span>;
};

const renderList = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppStateProvider><Spy /><ListPane /></AppStateProvider>
    </QueryClientProvider>,
  );

describe("ListPane", () => {
  it("affiche les items virtualisés (titre, domaine, extrait, tags, date fr)", () => {
    renderList();
    expect(screen.getByText("Article exemple")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getAllByText("example.com").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("#rust")).toBeInTheDocument();
  });

  it("clic = détail ; clic tag = filtre ; checkbox = sélection", async () => {
    renderList();
    await userEvent.click(screen.getByText("Article exemple"));
    expect(document.querySelector("[data-testid='detail-id']")?.textContent).toBe("1000");
    await userEvent.click(screen.getByText("#rust"));
    // le tag cliqué déclenche patchList({search:"#rust"}) — vérifié via la vue
    expect(screen.getByRole("checkbox", { name: "Sélectionner Second" })).not.toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: "Sélectionner Second" }));
    expect(screen.getByRole("checkbox", { name: "Sélectionner Second" })).toBeChecked();
  });
});
