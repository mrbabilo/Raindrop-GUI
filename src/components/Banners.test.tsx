import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Banners } from "./Banners";

// Contrat du plan : Banners ne passe que par deux portes — useHealth
// (lecture) et api.send (POST restart). Les deux sont mockées ici, jamais
// de réseau. `health()` pilote l'état par test, comme mockApi dans App.test.
const healthMock = vi.hoisted(() => vi.fn());
vi.mock("../hooks/useStaticData", () => ({ useHealth: healthMock }));
const sendMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/api", () => ({ api: { send: sendMock } }));

const refetch = vi.fn();
function health(mcp: string) {
  refetch.mockReset().mockResolvedValue(undefined);
  sendMock.mockReset().mockResolvedValue({});
  healthMock.mockReset().mockReturnValue({ data: { status: "ok", mcp }, refetch });
}
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

afterEach(() => vi.unstubAllGlobals());

describe("Banners", () => {
  it("mcp crashed → bannière + bouton redémarre (POST /api/mcp/restart)", async () => {
    health("crashed");
    render(<Banners />, { wrapper });
    expect(screen.getByText(/Connexion Raindrop interrompue/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Redémarrer la connexion/ }));
    await waitFor(() => expect(sendMock).toHaveBeenCalledWith("POST", "/api/mcp/restart"));
    // « puis invalidate health » (plan) : le rafraîchissement suit le POST.
    await waitFor(() => expect(refetch).toHaveBeenCalled());
  });

  it("échec du redémarrage → erreur inline sur la bannière (R8P-1)", async () => {
    health("crashed");
    sendMock.mockRejectedValue(new Error("reconnexion impossible"));
    render(<Banners />, { wrapper });
    await userEvent.click(screen.getByRole("button", { name: /Redémarrer la connexion/ }));
    expect(await screen.findByText("Erreur : reconnexion impossible")).toBeInTheDocument();
    // La bannière reste posée : l'échec n'éjecte pas l'information d'état.
    expect(screen.getByText(/Connexion Raindrop interrompue/)).toBeInTheDocument();
    expect(refetch).not.toHaveBeenCalled();
  });

  it("hors-ligne → bannière sans bouton, retour en ligne → disparaît", async () => {
    health("connected");
    vi.stubGlobal("navigator", { onLine: false });
    render(<Banners />, { wrapper });
    expect(screen.getByText(/Hors-ligne/)).toBeInTheDocument();
    // Hors-ligne, rien à redémarrer : pas de bouton sur cette bannière.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() =>
      expect(screen.queryByText(/Hors-ligne/)).not.toBeInTheDocument(),
    );
  });

  it("connecté et en ligne → aucune bannière", () => {
    health("connected");
    render(<Banners />, { wrapper });
    expect(screen.queryByText(/Connexion Raindrop interrompue/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hors-ligne/)).not.toBeInTheDocument();
  });
});
