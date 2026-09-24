import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { raindrop, collections, tags } from "./test/fixtures";
import App from "./App";
import { AppStateProvider } from "./state/appState";
import { DragProvider } from "./state/drag";

// Raccourcis macOS attendus (audit UX du 2026-09-23, proposition 4) : ⌘F
// mène à la recherche, et l'infobulle des Réglages annonce ⌘,.
const getMock = vi.hoisted(() => vi.fn());
vi.mock("./lib/api", () => ({ api: { get: getMock, send: vi.fn() } }));

beforeEach(() => {
  getMock.mockReset().mockImplementation((path: string) => {
    if (path === "/api/raindrops") return Promise.resolve({ items: [raindrop()], count: 1, page: 0, perPage: 50 });
    if (path === "/api/jobs") return Promise.resolve([]);
    if (path === "/api/backup/archives") return Promise.resolve({ ids: [], octets: 0 });
    if (path === "/api/collections") return Promise.resolve({ items: collections });
    if (path === "/api/tags") return Promise.resolve({ items: tags });
    if (path === "/api/smartlists") return Promise.resolve({ items: [] });
    return Promise.resolve({ status: "ok", mcp: "connected" });
  });
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AppStateProvider><DragProvider>{children}</DragProvider></AppStateProvider>
  </QueryClientProvider>
);

describe("App — raccourcis", () => {
  it("⌘F place le focus dans la recherche", () => {
    render(<App onEtat={vi.fn()} />, { wrapper });
    const recherche = screen.getByRole("textbox", { name: "Rechercher" });
    expect(recherche).not.toHaveFocus();
    fireEvent.keyDown(window, { key: "f", metaKey: true });
    expect(recherche).toHaveFocus();
  });

  it("l'infobulle des Réglages annonce ⌘,", () => {
    render(<App onEtat={vi.fn()} />, { wrapper });
    expect(screen.getByRole("button", { name: "Réglages" })).toHaveAttribute("title", "Réglages (⌘,)");
  });

  // Proposition 5 : un dialogue rend le focus à ce qui l'avait ouvert —
  // il tombait sur `body`, et le clavier repartait du haut de la fenêtre.
  it("fermer les Réglages rend le focus au bouton qui les avait ouverts", async () => {
    render(<App onEtat={vi.fn()} />, { wrapper });
    const engrenage = screen.getByRole("button", { name: "Réglages" });
    engrenage.focus();
    fireEvent.click(engrenage);
    // Le clic de l'utilisateur met le focus sur « Fermer » AVANT de démonter
    // le dialogue (fireEvent ne le fait pas — sans cette ligne, le test
    // passait sans le hook).
    const fermer = await screen.findByRole("button", { name: "Fermer" });
    fermer.focus();
    fireEvent.click(fermer);
    expect(screen.queryByRole("dialog", { name: "Réglages" })).not.toBeInTheDocument();
    expect(engrenage).toHaveFocus();
  });

  // Audit d'ergonomie du 2026-09-24 : revenir à la vue précédente, et
  // relire ce que le site Raindrop a changé, sans quitter le clavier.
  it("⌘[ recule, ⌘] avance — et ⌘← / ⌘→ hors d'un champ de saisie", async () => {
    render(<App onEtat={vi.fn()} />, { wrapper });
    fireEvent.click(await screen.findByText("Design"));
    const recherche = () => screen.getByRole("textbox", { name: "Rechercher" });
    expect(recherche()).toHaveAttribute("placeholder", "Rechercher dans « Design »… (⌘F)");
    fireEvent.keyDown(window, { key: "[", metaKey: true });
    expect(recherche()).toHaveAttribute("placeholder", "Rechercher… (⌘F)");
    fireEvent.keyDown(window, { key: "]", metaKey: true });
    expect(recherche()).toHaveAttribute("placeholder", "Rechercher dans « Design »… (⌘F)");
    fireEvent.keyDown(window, { key: "ArrowLeft", metaKey: true });
    expect(recherche()).toHaveAttribute("placeholder", "Rechercher… (⌘F)");
    // Dans un champ, ⌘→ va en fin de ligne : il n'appartient pas à l'historique.
    fireEvent.keyDown(recherche(), { key: "ArrowRight", metaKey: true });
    expect(recherche()).toHaveAttribute("placeholder", "Rechercher… (⌘F)");
  });

  it("⌘R relit la liste depuis Raindrop", async () => {
    render(<App onEtat={vi.fn()} />, { wrapper });
    const lectures = () => getMock.mock.calls.filter(([p]) => p === "/api/raindrops").length;
    await waitFor(() => expect(lectures()).toBe(1));
    const avant = lectures();
    fireEvent.keyDown(window, { key: "r", metaKey: true });
    await waitFor(() => expect(lectures()).toBe(avant + 1));
  });
});
