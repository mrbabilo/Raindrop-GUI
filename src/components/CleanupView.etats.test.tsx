import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { CleanupView } from "./CleanupView";
import { AppStateProvider } from "../state/appState";

// Les ÉTATS honnêtes de la vue (audit du 2026-09-23) : ce qu'elle dit quand
// elle ne sait pas encore, quand l'analyse tourne, quand l'arbre manque.
// Fichier à part : CleanupView.test.tsx dépasse déjà la cible de 300 lignes.
// Même harnais (hooks mockés, pattern CleanupDashboard.test.tsx).
const { resultsMock, groupsMock, collectionsMock, statutMock, scanMock, pendingMock } = vi.hoisted(() => ({
  resultsMock: vi.fn(),
  groupsMock: vi.fn(),
  collectionsMock: vi.fn(),
  statutMock: vi.fn(),
  scanMock: vi.fn(),
  pendingMock: vi.fn(() => false),
}));

vi.mock("../lib/api", () => ({ api: { get: vi.fn(), send: vi.fn() } }));
vi.mock("../hooks/useAnalysis", () => ({
  useAnalysisResults: resultsMock,
  useDuplicateGroups: groupsMock,
  useAnalysisStatus: statutMock,
  useStartScan: () => ({ mutate: scanMock, isPending: pendingMock() }),
}));
vi.mock("../hooks/useRaindrops", () => ({ useRaindrops: () => ({ data: undefined }) }));
vi.mock("../hooks/useStaticData", () => ({
  useCollections: collectionsMock,
  useTags: () => ({ data: [] }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AppStateProvider>{children}</AppStateProvider>
  </QueryClientProvider>
);

const JAMAIS = { lastScan: null, running: false };
const FAIT = { lastScan: "2026-09-19T08:00:00.000Z", running: false };
const statut = (links: object, duplicates: object = FAIT) => ({ data: { links, duplicates } });

beforeEach(() => {
  resultsMock.mockReset().mockReturnValue({ data: { items: [], total: 0, page: 0, perPage: 50 } });
  groupsMock.mockReset().mockReturnValue({ data: { exact: [], normalized: [], fuzzy: [] } });
  collectionsMock.mockReset().mockReturnValue({ data: [] });
  statutMock.mockReset().mockReturnValue(statut(FAIT));
  scanMock.mockReset();
  pendingMock.mockReset().mockReturnValue(false);
});

describe("CleanupView — collections vides, arbre absent", () => {
  // Témoin : l'arbre chargé ET vide affiche bien « (0) » — sans lui, les deux
  // assertions d'absence ci-dessous passeraient sur un en-tête muet.
  it("arbre chargé sans collection vide : « (0) » est un fait", () => {
    render(<CleanupView type="empty-collections" />, { wrapper });
    expect(screen.getByText("(0)")).toBeInTheDocument();
  });

  it("échec du chargement : l'alerte, jamais un « (0) » inventé", async () => {
    collectionsMock.mockReturnValue({ data: undefined, isError: true, error: { message: "http 500" }, refetch: vi.fn() });
    render(<CleanupView type="empty-collections" />, { wrapper });
    expect(await screen.findByRole("alert")).toHaveTextContent("http 500");
    expect(screen.queryByText("(0)")).not.toBeInTheDocument();
  });

  it("chargement en cours : pas de « (0) »", () => {
    collectionsMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<CleanupView type="empty-collections" />, { wrapper });
    expect(screen.getByText("Chargement…")).toBeInTheDocument();
    expect(screen.queryByText("(0)")).not.toBeInTheDocument();
  });
});

describe("CleanupView — une analyse qui tourne sans avoir jamais abouti", () => {
  // Témoin : jamais analysé, rien ne tourne → l'invite ET son bouton.
  it("jamais analysé, rien en cours : on propose de lancer", () => {
    statutMock.mockReturnValue(statut(JAMAIS));
    render(<CleanupView type="dead" />, { wrapper });
    expect(screen.getByRole("button", { name: "Lancer l'analyse" })).toBeEnabled();
  });

  it("scan de liens en cours (sidecar) : « Analyse en cours », aucun bouton pour relancer", () => {
    statutMock.mockReturnValue(statut({ lastScan: null, running: true }));
    render(<CleanupView type="dead" />, { wrapper });
    expect(screen.getByText("Analyse en cours")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lancer l'analyse" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Aucune analyse n'a encore été lancée/)).not.toBeInTheDocument();
  });

  it("scan lancé d'ici, avant la sonde suivante (isPending) : même état", () => {
    statutMock.mockReturnValue(statut(JAMAIS));
    pendingMock.mockReturnValue(true);
    render(<CleanupView type="redirect" />, { wrapper });
    expect(screen.getByText("Analyse en cours")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lancer l'analyse" })).not.toBeInTheDocument();
  });

  it("doublons : un scan en cours ne se relance pas non plus", () => {
    statutMock.mockReturnValue(statut(FAIT, { lastScan: null, running: true }));
    render(<CleanupView type="duplicates" />, { wrapper });
    expect(screen.getByText("Analyse en cours")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lancer l'analyse" })).not.toBeInTheDocument();
  });
});

describe("CleanupView — statut d'analyse pas encore reçu", () => {
  // Témoin : statut connu, scan fait, page vide → « Rien ici » est vrai.
  it("analysé, rien trouvé : « Rien ici » et le compte", () => {
    render(<CleanupView type="dead" />, { wrapper });
    expect(screen.getByText("Rien ici")).toBeInTheDocument();
    expect(screen.getByText("(0)")).toBeInTheDocument();
  });

  it("liens : ni « Rien ici » ni « (0) » tant qu'on ne sait pas si l'analyse a tourné", () => {
    statutMock.mockReturnValue({ data: undefined });
    render(<CleanupView type="dead" />, { wrapper });
    expect(screen.getByText("Chargement…")).toBeInTheDocument();
    expect(screen.queryByText("Rien ici")).not.toBeInTheDocument();
    expect(screen.queryByText("(0)")).not.toBeInTheDocument();
  });

  // Les deux entrées sont lues à chaque rendu : celle qui manque ne doit pas
  // démonter l'arbre (attrapé par App.test, dont le mock rend `{}`).
  it("une entrée de statut absente vaut « inconnu », jamais un écran blanc", () => {
    statutMock.mockReturnValue({ data: { links: FAIT } });
    render(<CleanupView type="dead" />, { wrapper });
    expect(screen.getByText("Rien ici")).toBeInTheDocument();
  });

  it("doublons : même contrat", () => {
    statutMock.mockReturnValue({ data: undefined });
    render(<CleanupView type="duplicates" />, { wrapper });
    expect(screen.getByText("Chargement…")).toBeInTheDocument();
    expect(screen.queryByText("Rien ici")).not.toBeInTheDocument();
  });
});
