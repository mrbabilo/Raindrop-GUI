import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { CleanupView } from "./CleanupView";
import { AppStateProvider, useAppState } from "../state/appState";
import { raindrop, collections } from "../test/fixtures";

// Hooks et api mockés (pattern CleanupDashboard.test.tsx) : les mocks sont
// hisés (vi.hoisted) et rechargés par test via mockReturnValue — les branches
// de CleanupView lisent des hooks différents selon `type`.
const { resultsMock, groupsMock, raindropsMock, collectionsMock, getMock, sendMock } = vi.hoisted(() => ({
  resultsMock: vi.fn(),
  groupsMock: vi.fn(),
  raindropsMock: vi.fn(),
  collectionsMock: vi.fn(),
  getMock: vi.fn(),
  sendMock: vi.fn(),
}));

vi.mock("../lib/api", () => ({ api: { get: getMock, send: sendMock } }));
vi.mock("../hooks/useAnalysis", () => ({
  useAnalysisResults: resultsMock,
  useDuplicateGroups: groupsMock,
}));
vi.mock("../hooks/useRaindrops", () => ({ useRaindrops: raindropsMock }));
vi.mock("../hooks/useStaticData", () => ({
  useCollections: collectionsMock,
  useTags: () => ({ data: [] }),
}));

// Espion de navigation : le contrat des actions niveau 2 (vider, supprimer
// les vides) est un `go({kind:"review", …})` — la Revue (T15) exécutera.
const Spy = () => {
  const { view } = useAppState();
  return <span data-testid="view">{JSON.stringify(view)}</span>;
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AppStateProvider>
      <Spy />
      {children}
    </AppStateProvider>
  </QueryClientProvider>
);

// Page de résultats « links » au format LinksResultsPage (sidecar analysis.ts).
const redirectPage = {
  items: [
    {
      raindropId: 1000,
      url: "https://old.example/a",
      status: "redirect",
      redirectKind: "permanent",
      finalUrl: "https://new.example/a",
      httpStatus: 301,
      redirectChain: [],
      reason: null,
      checkedAt: "2026-09-16T00:00:00Z",
      title: "Page déplacée",
      collectionId: 101,
    },
  ],
  total: 1,
  page: 0,
  perPage: 50,
};

beforeEach(() => {
  getMock.mockReset().mockResolvedValue({ items: [], count: 0 });
  sendMock.mockReset().mockResolvedValue({});
  resultsMock.mockReset().mockReturnValue({ data: { items: [], total: 0, page: 0, perPage: 50 } });
  groupsMock.mockReset().mockReturnValue({ data: { exact: [], normalized: [], fuzzy: [] } });
  raindropsMock.mockReset().mockReturnValue({ data: undefined });
  collectionsMock.mockReset().mockReturnValue({ data: [] });
});

describe("ResultatsLiens — liens morts et redirections", () => {
  it("redirections : remplace par l'URL finale (PATCH)", async () => {
    resultsMock.mockReturnValue({ data: redirectPage });
    render(<CleanupView type="redirect" />, { wrapper });
    expect(await screen.findByText("Page déplacée")).toBeInTheDocument();
    expect(screen.getByText("https://old.example/a")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Remplacer par l'URL finale/ }));
    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith("PATCH", "/api/raindrops/1000", { url: "https://new.example/a" }),
    );
  });

  it("liens morts : chip d'entête comptée + piste Wayback Machine", async () => {
    resultsMock.mockReturnValue({
      data: {
        items: [
          {
            raindropId: 2000,
            url: "https://mort.example/page",
            status: "dead",
            redirectKind: null,
            finalUrl: null,
            httpStatus: null,
            redirectChain: null,
            reason: "http_404",
            checkedAt: "2026-09-16T00:00:00Z",
            title: "Page disparue",
            collectionId: 101,
          },
        ],
        total: 23,
        page: 0,
        perPage: 50,
      },
    });
    render(<CleanupView type="dead" />, { wrapper });
    expect(await screen.findByText("Liens morts")).toBeInTheDocument();
    expect(screen.getByText("(23)")).toBeInTheDocument();
    // buku §12 : la Wayback Machine est un simple <a> externe sur l'URL morte.
    expect(screen.getByRole("link", { name: "Chercher une copie archivée" })).toHaveAttribute(
      "href",
      "https://web.archive.org/web/*/https://mort.example/page",
    );
  });

  // L'archive vaut le plus sur un lien mort : la page n'existe plus, la copie
  // permanente est tout ce qui en reste (spec sélection §4.2).
  it("liens morts : cocher des lignes arme l'archivage, et la Revue le porte", async () => {
    const mort = (id: number, titre: string) => ({
      raindropId: id,
      url: `https://mort.example/${id}`,
      status: "dead",
      redirectKind: null,
      finalUrl: null,
      httpStatus: null,
      redirectChain: null,
      reason: "http_404",
      checkedAt: "2026-09-16T00:00:00Z",
      title: titre,
      collectionId: 101,
    });
    resultsMock.mockReturnValue({
      data: { items: [mort(2000, "Alpha"), mort(2001, "Beta")], total: 2, page: 0, perPage: 50 },
    });
    render(<CleanupView type="dead" />, { wrapper });

    // Sans sélection, le bouton est là mais mort : rien à archiver.
    const bouton = await screen.findByRole("button", { name: "Archiver la copie (0)" });
    expect(bouton).toBeDisabled();

    await userEvent.click(screen.getByRole("checkbox", { name: "Alpha" }));
    await userEvent.click(screen.getByRole("button", { name: "Archiver la copie (1)" }));

    const vue = JSON.parse(screen.getByTestId("view").textContent ?? "{}") as {
      kind: string;
      action: { op: string };
      items: { id: number; cache?: unknown }[];
    };
    expect(vue.kind).toBe("review");
    expect(vue.action).toEqual({ op: "archive" });
    expect(vue.items.map((i) => i.id)).toEqual([2000]);
    // L'analyse ne porte PAS l'état des copies : la Revue le dira plutôt que
    // de laisser croire qu'elle le sait.
    expect(vue.items[0]).not.toHaveProperty("cache");
  });

  // Les redirections se corrigent, elles ne s'archivent pas : la page vit
  // encore, c'est son URL qui a bougé.
  it("redirections : aucune sélection, aucun archivage", async () => {
    resultsMock.mockReturnValue({ data: redirectPage });
    render(<CleanupView type="redirect" />, { wrapper });
    await screen.findByText("Redirections");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Archiver/ })).not.toBeInTheDocument();
  });

});
