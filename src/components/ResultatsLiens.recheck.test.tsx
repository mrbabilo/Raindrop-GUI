// La revérification des indéterminés — détaché de ResultatsLiens.test.tsx (plafond dur de 400 lignes,
// audit du 2026-09-23) : même harnais, recopié à dessein.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { CleanupView } from "./CleanupView";
import { AppStateProvider, useAppState } from "../state/appState";

// Hooks et api mockés (pattern CleanupDashboard.test.tsx) : les mocks sont
// hisés (vi.hoisted) et rechargés par test via mockReturnValue — les branches
// de CleanupView lisent des hooks différents selon `type`.
const { resultsMock, groupsMock, raindropsMock, collectionsMock, getMock, sendMock, statutMock, scanMock, recheckMock, cancelMock } = vi.hoisted(() => ({
  resultsMock: vi.fn(),
  groupsMock: vi.fn(),
  raindropsMock: vi.fn(),
  collectionsMock: vi.fn(),
  getMock: vi.fn(),
  sendMock: vi.fn(),
  // Défaut « déjà analysé » : sans cela, les vues affichent l'invite au
  // premier scan au lieu de leurs listes.
  statutMock: vi.fn<() => { data: { links: { lastScan: string | null; running: boolean }; duplicates: { lastScan: string | null; running: boolean } } }>(() => ({
    data: {
      links: { lastScan: "2026-09-19T08:00:00.000Z", running: false },
      duplicates: { lastScan: "2026-09-19T08:00:00.000Z", running: false },
    },
  })),
  scanMock: vi.fn(),
  recheckMock: vi.fn(),
  cancelMock: vi.fn(),
}));

vi.mock("../lib/api", () => ({ api: { get: getMock, send: sendMock } }));
vi.mock("../hooks/useAnalysis", () => ({
  useAnalysisResults: resultsMock,
  useDuplicateGroups: groupsMock,
  useAnalysisStatus: statutMock,
  useStartScan: () => ({ mutate: scanMock }),
  useRecheckIndetermine: () => ({ mutate: recheckMock, isPending: false, isError: false, error: null }),
  useCancelJob: () => ({ mutate: cancelMock }),
}));
vi.mock("../hooks/useRaindrops", () => ({ useRaindrops: raindropsMock }));
vi.mock("../hooks/useBackup", () => ({ useJobsEnVol: () => ({ data: undefined }) }));
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
  recheckMock.mockReset().mockResolvedValue({});
  cancelMock.mockReset().mockResolvedValue({});
});

// La revérification des indéterminés (ROADMAP 2026-09-22) : LE bouton de la
// vue « À vérifier à la main » — il POSTe au sidecar et n'existe nulle part
// ailleurs. « L'aller ne prouve rien sans le retour » : on vérifie aussi son
// ABSENCE sur les vues qui n'en ont pas.
describe("la revérification des indéterminés", () => {
  it("la vue indeterminate porte « Revérifier (n) » et le clic part au sidecar", async () => {
    resultsMock.mockReturnValue({
      data: {
        items: [
          {
            raindropId: 2000, url: "https://bloque.example/", status: "indeterminate",
            httpStatus: 403, redirectChain: [], finalUrl: null, redirectKind: null,
            reason: "http_403", checkedAt: "2026-09-19T00:00:00Z",
            title: "Bloqué", collectionId: 101,
          },
        ],
        total: 3, page: 0, perPage: 50,
      },
    });
    render(<CleanupView type="indeterminate" />, { wrapper });
    const bouton = await screen.findByRole("button", { name: /Revérifier/ });
    expect(bouton).toHaveTextContent("3");
    await userEvent.click(bouton);
    expect(recheckMock).toHaveBeenCalledTimes(1);
  });

  it("mort et redirection ne portent pas le bouton", async () => {
    resultsMock.mockReturnValue({ data: redirectPage });
    const { unmount } = render(<CleanupView type="dead" />, { wrapper });
    await screen.findByText("Page déplacée");
    expect(screen.queryByRole("button", { name: /Revérifier/ })).toBeNull();
    unmount();
    render(<CleanupView type="redirect" />, { wrapper });
    await screen.findByText("Page déplacée");
    expect(screen.queryByRole("button", { name: /Revérifier/ })).toBeNull();
  });
});
