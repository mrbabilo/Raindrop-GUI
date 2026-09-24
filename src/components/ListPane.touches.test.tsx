import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
// fixtures AVANT ListPane (TDZ — les factories vi.mock les référencent).
import { raindrop, collections } from "../test/fixtures";
import { ListPane } from "./ListPane";
import { AppStateProvider, useAppState } from "../state/appState";
import { DragProvider } from "../state/drag";
import { consommerEdition } from "../lib/demandeEdition";

// Audit d'ergonomie du 2026-09-24 : la liste ne connaissait que la
// navigation (flèches, Espace, Entrée). Sur la ligne ACTIVE : ⌫ met à la
// corbeille (avis + Annuler), F bascule le favori, E ouvre la fiche en
// édition. Les verbes sont ceux du dépôt (useDragBookmark.agir).
const items = [raindrop({ id: 2000, title: "Signet 0" }), raindrop({ id: 2001, title: "Signet 1", important: true })];
vi.mock("../hooks/useAnalysis", () => ({ useEtatsAnalyse: () => ({ data: undefined }) }));
vi.mock("../hooks/useRaindrops", () => ({
  useRaindrops: () => ({
    data: { pages: [{ items, count: items.length, page: 0, perPage: 50 }] },
    isError: false, isFetching: false, refetch: vi.fn(),
    fetchNextPage: vi.fn(), hasNextPage: false, isFetchingNextPage: false,
  }),
}));
vi.mock("../hooks/useStaticData", () => ({ useCollections: () => ({ data: collections, isLoading: false }) }));
const { sendApi } = vi.hoisted(() => ({ sendApi: vi.fn() }));
// Chaque route lue a SA réponse : une route absente du mock rend la forme
// d'une autre, et l'arbre se démonte (piège déjà payé deux fois).
vi.mock("../lib/api", () => ({
  api: { get: vi.fn(async (chemin: string) => (chemin === "/api/jobs" ? [] : { ids: [], octets: 0 })), send: sendApi },
}));

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 600 });
});
afterAll(() => {
  delete (HTMLElement.prototype as unknown as { offsetHeight?: unknown }).offsetHeight;
});
beforeEach(() => {
  sendApi.mockReset().mockImplementation(async (_m: string, chemin: string) =>
    chemin === "/api/raindrops/bulk-trash" ? { corbeille: 1, deja: 0, echecs: [] } : {});
});

const Spy = () => {
  const { selectedRaindropId, go } = useAppState();
  return (
    <>
      <span data-testid="fiche">{selectedRaindropId ?? ""}</span>
      <button type="button" onClick={() => go({ kind: "list", collectionId: -99, label: "Corbeille" })}>corbeille</button>
    </>
  );
};
const monter = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppStateProvider><DragProvider><Spy /><ListPane /></DragProvider></AppStateProvider>
    </QueryClientProvider>,
  );
/** La ligne active : son enveloppe porte le focus (un seul arrêt). */
const activer = (id: number) => act(() => { screen.getByTestId(`row-${id}`).parentElement!.focus(); });
const touche = async (t: string) => {
  await userEvent.keyboard(t);
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};

describe("ListPane — touches d'action sur la ligne active", () => {
  it("⌫ met la ligne active à la corbeille, l'avis le dit et offre Annuler", async () => {
    monter();
    activer(2001);
    await touche("{Backspace}");
    expect(sendApi).toHaveBeenCalledWith("POST", "/api/raindrops/bulk-trash", { ids: [2001] });
    expect(screen.getByRole("status")).toHaveTextContent("1 signet mis à la corbeille");
    expect(screen.getByRole("button", { name: "Annuler" })).toBeInTheDocument();
  });

  it("F bascule le favori — dans les deux sens", async () => {
    monter();
    activer(2000);
    await touche("f");
    expect(sendApi).toHaveBeenLastCalledWith("POST", "/api/raindrops/bulk", { operation: "update", collection_id: 0, ids: [2000], important: true });
    activer(2001); // déjà favori : F le retire
    await touche("f");
    expect(sendApi).toHaveBeenLastCalledWith("POST", "/api/raindrops/bulk", { operation: "update", collection_id: 0, ids: [2001], important: false });
    expect(screen.getByRole("status")).toHaveTextContent("1 signet retiré des favoris");
  });

  it("E ouvre la fiche de la ligne active et y demande l'édition", async () => {
    monter();
    activer(2000);
    await touche("e");
    expect(screen.getByTestId("fiche").textContent).toBe("2000");
    expect(consommerEdition(2000)).toBe(true);
  });

  it("une touche née dans un contrôle de la ligne ne la vise pas", async () => {
    monter();
    act(() => { screen.getByRole("checkbox", { name: "Sélectionner Signet 0" }).focus(); });
    await touche("{Backspace}");
    await touche("f");
    expect(sendApi).not.toHaveBeenCalled();
  });

  it("dans la corbeille, ⌫ ne fait rien — y remettre un signet serait le détruire", async () => {
    monter();
    await userEvent.click(screen.getByText("corbeille"));
    activer(2000);
    await touche("{Backspace}");
    expect(sendApi).not.toHaveBeenCalled();
  });
});
