import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { raindrop } from "../test/fixtures";
import { TopBar } from "./TopBar";
import { AppStateProvider, useAppState } from "../state/appState";

// La recherche différée (300 ms) × le surlignage des vues sauvegardées
// (audit du 2026-09-23). La resynchronisation d'après navigation re-patchait
// la recherche COURANTE ; le reducer efface `smartlistId` à tout patch de
// filtre : la vue ouverte perdait son surlignage 300 ms après le clic. Deux
// chemins réels — sabordés : sans le garde d'égalité, les deux tombent.
vi.mock("../lib/api", () => ({ api: { get: vi.fn(), send: vi.fn() } }));
vi.mock("../hooks/useRaindrops", () => ({
  useRaindrops: () => ({ data: { pages: [{ items: [raindrop({ type: "article" })], count: 1, page: 0, perPage: 50 }] } }),
}));
const Spy = () => {
  const { view } = useAppState();
  return <span data-testid="view">{JSON.stringify(view)}</span>;
};
const Nav = () => {
  const { go } = useAppState();
  return (
    <>
      <button type="button" onClick={() => go({ kind: "cleanup" })}>nettoyage</button>
      <button type="button" onClick={() => go({ kind: "list", collectionId: 0, label: "Rust", search: "borrow", smartlistId: "sl-1" })}>sl-recherche</button>
      <button type="button" onClick={() => go({ kind: "list", collectionId: 0, label: "Rust", tags: ["rust"], smartlistId: "sl-2" })}>sl-etiquette</button>
    </>
  );
};
const rendre = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppStateProvider>
        <Spy />
        <Nav />
        <TopBar />
      </AppStateProvider>
    </QueryClientProvider>,
  );
const vue = () => JSON.parse(screen.getByTestId("view").textContent!);
const pause = () => act(() => new Promise((r) => setTimeout(r, 400)));

describe("TopBar — une vue sauvegardée ouverte garde son surlignage", () => {
  it("depuis une liste, vue AVEC recherche : la resynchronisation ne patche rien", async () => {
    rendre();
    await pause();
    await userEvent.click(screen.getByText("sl-recherche"));
    await pause();
    expect(vue().smartlistId).toBe("sl-1");
  });
  it("depuis le Nettoyage (TopBar sans liste), vue par étiquette : idem", async () => {
    rendre();
    await userEvent.click(screen.getByText("nettoyage"));
    await pause();
    await userEvent.click(screen.getByText("sl-etiquette"));
    await pause();
    expect(vue().smartlistId).toBe("sl-2");
  });
});
