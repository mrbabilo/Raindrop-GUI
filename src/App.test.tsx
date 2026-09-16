import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
// fixtures AVANT App (TDZ — même remarque que Sidebar.test.tsx) : mockApi
// les référence dans l'implémentation du mock.
import { raindrop, collections, tags } from "./test/fixtures";
import App from "./App";

// App consomme useHealth() et — depuis que ListPane est monté (Task 7) —
// useRaindrops() : provider + mock du module api ROUTÉ PAR CHEMIN, chaque
// endpoint recevant la forme de son DTO (jamais de fetch réseau). Seule la
// réponse health est pilotée par test (mcp connecté/déconnecté).
const getMock = vi.hoisted(() => vi.fn());

vi.mock("./lib/api", () => ({ api: { get: getMock } }));

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
    mockApi("disconnected");
    render(<App />, { wrapper });
    await waitFor(() =>
      expect(screen.getByText("Connexion Raindrop interrompue")).toBeInTheDocument(),
    );
  });

  it("n'affiche pas d'alerte quand MCP est connecté", () => {
    render(<App />, { wrapper });
    expect(screen.queryByText("Connexion Raindrop interrompue")).not.toBeInTheDocument();
  });
});
