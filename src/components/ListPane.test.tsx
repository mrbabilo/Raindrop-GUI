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
// Reste représentatif avec measureElement (R7P) : les lignes mesurent aussi
// 600 px sous jsdom — géométrie irréaliste, mais ce que le fichier asserte
// est QUELS items se rendent (contenu, sélection, filtre, détail), pas la
// métrique ; le câblage mesure→position (data-index + ref) s'exerce
// réellement (mesures enregistrées, translateY recalculé sans crash), et la
// précision numérique de virtual-core est son domaine testé à lui.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 600 });
});
afterAll(() => {
  delete (HTMLElement.prototype as unknown as { offsetHeight?: unknown }).offsetHeight;
});

// Assertions d'état : détail (detail-id) et vue courante (view) — même
// pattern Spy que Task 5/6 ; le Spy évite de polluer App.
const Spy = () => {
  const { selectedRaindropId, view } = useAppState();
  return (
    <>
      <span data-testid="detail-id" className="hidden">{selectedRaindropId}</span>
      <span data-testid="view" className="hidden">{JSON.stringify(view)}</span>
    </>
  );
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
    // le tag cliqué déclenche patchList({search:"#rust"}) — asserté via la vue
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({ search: "#rust" });
    expect(screen.getByRole("checkbox", { name: "Sélectionner Second" })).not.toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: "Sélectionner Second" }));
    expect(screen.getByRole("checkbox", { name: "Sélectionner Second" })).toBeChecked();
  });
});
