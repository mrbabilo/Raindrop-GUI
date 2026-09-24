import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
// fixtures AVANT ListPane (TDZ — les factories vi.mock les référencent).
import { raindrop, collections } from "../test/fixtures";
import { ListPane } from "./ListPane";
import { AppStateProvider, useAppState } from "../state/appState";

// Audit d'ergonomie du 2026-09-24 : cocher trente signets coûtait trente
// clics. Maj-clic coche la PLAGE depuis la dernière case, comme partout sur
// macOS ; la barre de sélection offre « Tout sélectionner » sur ce qui est
// chargé.
const items = Array.from({ length: 6 }, (_, i) => raindrop({ id: 2000 + i, title: `Signet ${i}` }));
vi.mock("../hooks/useAnalysis", () => ({ useEtatsAnalyse: () => ({ data: undefined }) }));
vi.mock("../hooks/useRaindrops", () => ({
  useRaindrops: () => ({
    data: { pages: [{ items, count: items.length, page: 0, perPage: 50 }] },
    isError: false, isFetching: false, refetch: vi.fn(),
    fetchNextPage: vi.fn(), hasNextPage: false, isFetchingNextPage: false,
  }),
}));
vi.mock("../hooks/useStaticData", () => ({ useCollections: () => ({ data: collections, isLoading: false }) }));

// jsdom ne fait pas de mise en page : sans hauteur, le virtualiseur ne
// monte aucune ligne (même contournement que ListPane.test).
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 600 });
});
afterAll(() => {
  delete (HTMLElement.prototype as unknown as { offsetHeight?: unknown }).offsetHeight;
});

const Spy = () => {
  const { selectedIds } = useAppState();
  return <span data-testid="sel">{[...selectedIds].sort().join(",")}</span>;
};
const monter = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppStateProvider><Spy /><ListPane /></AppStateProvider>
    </QueryClientProvider>,
  );
const cocher = (i: number) => userEvent.click(screen.getByRole("checkbox", { name: `Sélectionner Signet ${i}` }));
const selection = () => screen.getByTestId("sel").textContent;

describe("ListPane — sélectionner plusieurs signets sans les cocher un à un", () => {
  it("Maj-clic coche toute la plage depuis la dernière case cochée", async () => {
    monter();
    // UNE session user-event : les appels directs en ouvrent chacun une
    // neuve, et la touche Maj enfoncée ne survivrait pas au clic suivant.
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: "Sélectionner Signet 1" }));
    await user.keyboard("{Shift>}");
    await user.click(screen.getByRole("checkbox", { name: "Sélectionner Signet 4" }));
    await user.keyboard("{/Shift}");
    expect(selection()).toBe("2001,2002,2003,2004");
  });

  it("témoin : un clic simple ne coche que sa case", async () => {
    monter();
    await cocher(1);
    await cocher(4);
    expect(selection()).toBe("2001,2004");
  });

  it("« Tout sélectionner » coche tous les signets chargés, puis s'efface", async () => {
    monter();
    await cocher(0);
    await userEvent.click(screen.getByRole("button", { name: "Tout sélectionner (6)" }));
    expect(selection()).toBe("2000,2001,2002,2003,2004,2005");
    expect(screen.queryByRole("button", { name: /Tout sélectionner/ })).not.toBeInTheDocument();
  });
});
