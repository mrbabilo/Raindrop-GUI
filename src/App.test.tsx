import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import App from "./App";

// App consomme useHealth() → provider + mock du module api (jamais de fetch
// réseau). getMock est hissé pour être piloté par test (mcp connecté/déconnecté).
const getMock = vi.hoisted(() => vi.fn());

vi.mock("./lib/api", () => ({ api: { get: getMock } }));

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
    getMock.mockReset().mockResolvedValue({ status: "ok", mcp: "connected" });
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
    getMock.mockResolvedValue({ status: "ok", mcp: "disconnected" });
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
