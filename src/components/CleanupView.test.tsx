import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { CleanupView } from "./CleanupView";
import { AppStateProvider, useAppState } from "../state/appState";
import { raindrop } from "../test/fixtures";

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

describe("CleanupView", () => {
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

  it("doublons : les trois catégories restent séparées et étiquetées", async () => {
    const item = (id: number, url: string) => ({ id, url, title: `Article ${id}`, collectionId: 101, created: "2025-01-01T12:00:00Z" });
    groupsMock.mockReturnValue({
      data: {
        exact: [{ key: "k1", kind: "exact", items: [item(1, "https://a.example/x"), item(2, "https://a.example/x")] }],
        normalized: [],
        fuzzy: [{ key: "k2", kind: "fuzzy", items: [item(3, "https://b.example/y"), item(4, "https://b.example/y")] }],
      },
    });
    render(<CleanupView type="duplicates" />, { wrapper });
    expect(await screen.findByText(/Doublons exacts/)).toBeInTheDocument();
    expect(screen.getByText(/Doublons flous/)).toBeInTheDocument();
    // catégorie normalisée vide : pas de section
    expect(screen.queryByText(/Doublons normalisés/)).not.toBeInTheDocument();
    // le chip compte les groupes (même sémantique que le dashboard T12)
    expect(screen.getByText("(2)")).toBeInTheDocument();
  });

  it("corbeille : restaure un item par POST /api/raindrops/unrestore", async () => {
    raindropsMock.mockReturnValue({
      data: {
        pages: [{ items: [raindrop({ id: 2001, url: "https://exemple.fr/vieille", title: "Vieille page", collectionId: -99 })], count: 1, page: 0, perPage: 50 }],
      },
    });
    render(<CleanupView type="trash" />, { wrapper });
    await userEvent.click(await screen.findByRole("button", { name: "Restaurer" }));
    await waitFor(() => expect(sendMock).toHaveBeenCalledWith("POST", "/api/raindrops/unrestore", { ids: [2001] }));
  });

  it("corbeille : « Vider la corbeille » va en Revue niveau 2 (op empty-trash)", async () => {
    raindropsMock.mockReturnValue({
      data: { pages: [{ items: [raindrop({ id: 2001, collectionId: -99 })], count: 1, page: 0, perPage: 50 }] },
    });
    render(<CleanupView type="trash" />, { wrapper });
    await userEvent.click(await screen.findByRole("button", { name: "Vider la corbeille" }));
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({
      kind: "review",
      action: { op: "empty-trash" },
    });
  });

  it("collections vides : supprime une collection par DELETE /api/collections/:id", async () => {
    collectionsMock.mockReturnValue({
      data: [{ id: 301, title: "Vide", parentId: null, count: 0, public: false, view: "list", cover: null, color: null }],
    });
    render(<CleanupView type="empty-collections" />, { wrapper });
    await userEvent.click(await screen.findByRole("button", { name: "Supprimer la collection" }));
    await waitFor(() => expect(sendMock).toHaveBeenCalledWith("DELETE", "/api/collections/301"));
  });

  it("collections vides : « Supprimer les collections vides » va en Revue niveau 2", async () => {
    collectionsMock.mockReturnValue({
      data: [{ id: 301, title: "Vide", parentId: null, count: 0, public: false, view: "list", cover: null, color: null }],
    });
    render(<CleanupView type="empty-collections" />, { wrapper });
    await userEvent.click(await screen.findByRole("button", { name: "Supprimer les collections vides" }));
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({
      kind: "review",
      action: { op: "delete-empty-collections" },
    });
  });
});
