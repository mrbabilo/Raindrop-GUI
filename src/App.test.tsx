import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
// fixtures AVANT App (TDZ — même remarque que Sidebar.test.tsx) : mockApi
// les référence dans l'implémentation du mock.
import { raindrop, collections, tags } from "./test/fixtures";
import App from "./App";
import { AppStateProvider, useAppState } from "./state/appState";
import type { View } from "./state/appState";

// App consomme useHealth() et — depuis que ListPane est monté (Task 7) —
// useRaindrops() : provider + mock du module api ROUTÉ PAR CHEMIN, chaque
// endpoint recevant la forme de son DTO (jamais de fetch réseau). Seule la
// réponse health est pilotée par test (mcp connecté/déconnecté). Le send est
// mocké pour les tests Revue (R15P-3 : execute() passe par useBulk).
const getMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());

vi.mock("./lib/api", () => ({ api: { get: getMock, send: sendMock } }));

function mockApi(mcp: string) {
  getMock.mockReset().mockImplementation((path: string) => {
    if (path === "/api/raindrops")
      return Promise.resolve({ items: [raindrop()], count: 1, page: 0, perPage: 50 });
    if (path === "/api/collections") return Promise.resolve({ items: collections });
    if (path === "/api/tags") return Promise.resolve({ items: tags });
    return Promise.resolve({ status: "ok", mcp });
  });
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {children}
    </QueryClientProvider>
  );
}

// Reproduit le stub par défaut de src/test/setup.ts, mais avec
// prefers-color-scheme: dark — le cas "aucune préférence enregistrée,
// OS en sombre" (mode "system" stocké implicitement).
function matchMediaPrefersDark() {
  return ((query: string) => ({
    matches: query.includes("dark"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as never;
}

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    mockApi("connected");
    sendMock.mockReset().mockResolvedValue({});
  });

  it("affiche le titre de l'app", () => {
    render(<App />, { wrapper });
    expect(screen.getByText("Raindrop GUI")).toBeInTheDocument();
  });

  it("affiche le shell trois panneaux (navigation, liste, détail)", () => {
    render(<App />, { wrapper });
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("complementary")).toBeInTheDocument();
  });

  // Task 10 : ⌘E amène le focus dans le composer, quel que soit le champ
  // occupé — le data-testid="composer-input" est le contrat du focus (plan).
  it("⌘E met le focus dans le composer", () => {
    render(<App />, { wrapper });
    const input = document.querySelector<HTMLInputElement>('[data-testid="composer-input"]');
    expect(input).not.toBeNull();
    expect(document.activeElement).not.toBe(input);
    fireEvent.keyDown(window, { key: "e", metaKey: true });
    expect(document.activeElement).toBe(input);
  });

  // Task 11 : ⌘K ouvre la palette (montage conditionnel — état frais à
  // chaque ouverture), Échap la referme. Même discipline que ⌘E :
  // événements réels sur window, pas de simulation du handler. L'input se
  // cherche par son placeholder : le <select> de tri de la TopBar porte lui
  // aussi le rôle ARIA implicite « combobox ».
  it("⌘K ouvre la palette, Échap la referme", () => {
    render(<App />, { wrapper });
    const input = () => screen.queryByPlaceholderText("Rechercher bookmarks, collections, tags, commandes…");
    expect(input()).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(input()).toBeInTheDocument();
    fireEvent.keyDown(input()!, { key: "Escape" });
    expect(input()).not.toBeInTheDocument();
  });

  it("bascule le thème sombre au clic sur le bouton de thème", async () => {
    const user = userEvent.setup();
    render(<App />, { wrapper });
    const toggle = screen.getByRole("button", { name: "Passer au thème sombre" });
    await user.click(toggle);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(
      screen.getByRole("button", { name: "Passer au thème clair" }),
    ).toBeInTheDocument();
  });

  it("annonce le thème clair dès le premier rendu quand le système préfère le sombre", () => {
    window.matchMedia = matchMediaPrefersDark();
    render(<App />, { wrapper });
    // L'app est déjà sombre (mode "system" + OS sombre) : le bouton doit
    // annoncer l'action inverse dès le premier rendu, pas seulement après
    // un clic — DESIGN.md §10, « un bouton nomme ce qui va se produire ».
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(
      screen.getByRole("button", { name: "Passer au thème clair" }),
    ).toBeInTheDocument();
  });

  it("signale l'interruption MCP quand health le rapporte", async () => {
    // « crashed » : un état RÉEL de LifecycleState, sans ambiguïté dès la
    // première réponse (l'ancien fixture « disconnected » n'existe pas dans
    // le vocabulaire du sidecar, et la règle Task 11 — bannière muette tant
    // qu'on n'a pas vu connected, sauf crashed — le laissait à juste titre
    // se taire).
    mockApi("crashed");
    render(<App />, { wrapper });
    await waitFor(() =>
      expect(screen.getByText("Connexion Raindrop interrompue")).toBeInTheDocument(),
    );
  });

  it("n'affiche pas d'alerte quand MCP est connecté", () => {
    render(<App />, { wrapper });
    expect(screen.queryByText("Connexion Raindrop interrompue")).not.toBeInTheDocument();
  });

  // R15P-3 : App construit goBack depuis la returnView portée par la vue
  // review — après exécution, retour à la vue d'origine (posée par les
  // constructeurs BulkBar/CleanupView) ; sans origine notée, repli « Tous ».
  const Spy = () => {
    const { view } = useAppState();
    return <span data-testid="view">{JSON.stringify(view)}</span>;
  };
  const OuvreRevue = ({ returnView }: { returnView?: View }) => {
    const { go } = useAppState();
    return (
      <button
        type="button"
        onClick={() =>
          go({
            kind: "review",
            items: [{ id: 1, url: "https://a.example", title: "Alpha", collectionId: 0 }],
            action: { op: "trash" },
            sourceLabel: "sélection",
            ...(returnView ? { returnView } : {}),
          })
        }
      >
        ouvrir-revue
      </button>
    );
  };
  const renderAppAvecDriver = (returnView?: View) =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AppStateProvider>
          <OuvreRevue returnView={returnView} />
          <Spy />
          <App />
        </AppStateProvider>
      </QueryClientProvider>,
    );
  const executeRevue = async () => {
    await userEvent.click(screen.getByText("ouvrir-revue"));
    await userEvent.click(screen.getByRole("checkbox", { name: /Je confirme l'action sur 1/ }));
    await userEvent.click(screen.getByRole("button", { name: "Exécuter" }));
  };

  it("revue : après exécution, retour à la vue d'origine (R15P-3)", async () => {
    renderAppAvecDriver({ kind: "cleanupView", type: "trash" });
    await executeRevue();
    await waitFor(() =>
      // Revue finale : le bulk delete emporte l'origine de l'item (§4.2).
      expect(sendMock).toHaveBeenCalledWith("POST", "/api/raindrops/bulk", {
        operation: "delete",
        collection_id: 0,
        ids: [1],
        origins: [{ id: 1, from: 0 }],
      }),
    );
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toEqual({ kind: "cleanupView", type: "trash" });
  });

  it("revue sans origine notée : repli sur « Tous » (R15P-3)", async () => {
    renderAppAvecDriver();
    await executeRevue();
    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId("view").textContent!)).toEqual({
        kind: "list",
        collectionId: 0,
        label: "Tous",
      }),
    );
  });
});
