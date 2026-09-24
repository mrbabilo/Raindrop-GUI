// Le patron « ligne activable » — détaché de ResultatsLiens.test.tsx (plafond dur de 400 lignes,
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
  useUser: () => ({ data: undefined }),
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

// Le grief du lot a11y : chaque ligne de traitement portait un arrêt de
// tabulation PAR CONTRÔLE (Restaurer, select, liens). La LIGNE est
// l'arrêt ; ses contrôles n'existent pour Tab qu'une fois la ligne
// activée (Enter), et Échap rend la ligne.
describe("le patron « ligne activable »", () => {
  it("la ligne est l'arrêt, ses contrôles s'ouvrent à Enter et se referment à Échap", async () => {
    const user = userEvent.setup();
    resultsMock.mockReturnValue({ data: redirectPage });
    render(<CleanupView type="redirect" />, { wrapper });
    const ligne = screen.getByRole("row");
    const remplacer = screen.getByRole("button", { name: "Remplacer par l'URL finale" });
    // Au repos : la ligne est l'unique arrêt, le contrôle est hors Tab.
    expect(ligne.getAttribute("tabindex")).toBe("0");
    expect(remplacer.getAttribute("tabindex")).toBe("-1");

    ligne.focus();
    await user.keyboard("{Enter}");
    expect(remplacer).toHaveFocus();
    expect(remplacer.getAttribute("tabindex")).toBe("0");

    // Échap rend la ligne, les contrôles se referment.
    await user.keyboard("{Escape}");
    expect(ligne).toHaveFocus();
    expect(remplacer.getAttribute("tabindex")).toBe("-1");
  });

  // Sortir du focus (flèches vers une autre ligne, clic ailleurs) désarme
  // aussi : l'état activé ne survit pas à la ligne.
  it("quitter la ligne désarme ses contrôles", async () => {
    const user = userEvent.setup();
    resultsMock.mockReturnValue({ data: redirectPage });
    render(<CleanupView type="redirect" />, { wrapper });
    const ligne = screen.getByRole("row");
    const remplacer = screen.getByRole("button", { name: "Remplacer par l'URL finale" });
    ligne.focus();
    await user.keyboard("{Enter}");
    expect(remplacer.getAttribute("tabindex")).toBe("0");
    await user.click(screen.getByRole("heading", { name: /Redirections/i }));
    expect(remplacer.getAttribute("tabindex")).toBe("-1");
  });
});
