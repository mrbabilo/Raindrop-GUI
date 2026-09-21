import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { SectionVersion } from "./SectionVersion";
import { useVersionInstallee } from "../hooks/useReleases";

// La version installée vient du shell (getVersion) et la dernière publiée
// de l'API GitHub — deux mocks, deux sources de vérité testées séparément.
const { getVersionMock, releasesMock } = vi.hoisted(() => ({
  getVersionMock: vi.fn(),
  releasesMock: vi.fn(),
}));

// La version installée vient du VRAI hook (useVersionInstallee → getVersion,
// mocké à la source @tauri-apps/api/app) : seul l'appel externe GitHub est
// mocké. Le mock partiel exige importOriginal — SectionVersion consomme les
// deux exports du module.
vi.mock("@tauri-apps/api/app", () => ({ getVersion: getVersionMock }));
vi.mock("../hooks/useReleases", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks/useReleases")>()),
  useReleases: releasesMock,
}));

const release = (tag: string, body = "notes de la version") => ({
  tag_name: tag,
  name: tag,
  body,
  html_url: `https://github.com/mrbabilo/Raindrop-GUI/releases/tag/${tag}`,
  prerelease: true,
  published_at: "2026-09-21T00:00:00Z",
});

const renderVersion = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SectionVersion />
    </QueryClientProvider>,
  );

beforeEach(() => {
  getVersionMock.mockReset().mockResolvedValue("0.1.0-pre.15");
  releasesMock.mockReset().mockReturnValue({ data: [release("v0.1.0-pre.15")] });
});

describe("SectionVersion", () => {
  it("affiche la version installée et la dernière publiée", async () => {
    renderVersion();
    expect(screen.getByText("Installée :")).toBeInTheDocument();
    expect(await screen.findByText("0.1.0-pre.15")).toBeInTheDocument();
    expect(screen.getAllByText("v0.1.0-pre.15").length).toBeGreaterThan(0);
    // Même version : pas de badge de mise à jour.
    expect(screen.queryByText(/mise à jour disponible/)).not.toBeInTheDocument();
  });

  it("une version plus récente publiée : badge + notes affichées", async () => {
    releasesMock.mockReturnValue({ data: [release("v0.1.0-pre.16", "Les puces filtrent.")] });
    renderVersion();
    expect(await screen.findByText(/mise à jour disponible/i)).toBeInTheDocument();
    expect(screen.getByText(/v0\.1\.0-pre\.16/)).toBeInTheDocument();
    expect(screen.getByText("Les puces filtrent.")).toBeInTheDocument();
  });

  it("l'API GitHub en échec : la version installée seule, jamais d'alerte", async () => {
    releasesMock.mockReturnValue({ data: undefined });
    renderVersion();
    expect(await screen.findByText("0.1.0-pre.15")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/Dernière/)).not.toBeInTheDocument();
  });
});

describe("useVersionInstallee", () => {
  it("rend la version portée par le shell", async () => {
    getVersionMock.mockReset().mockResolvedValue("0.1.0-pre.16");
    const { result } = renderHook(() => useVersionInstallee(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
      ),
    });
    await waitFor(() => expect(result.current.data).toBe("0.1.0-pre.16"));
  });
});
