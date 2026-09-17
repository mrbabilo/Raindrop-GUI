import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
// fixtures AVANT CleanupDashboard : la factory vi.mock (hisée au-dessus des
// imports) référence `collections` — même note TDZ que Sidebar.test.tsx.
import { collections } from "../test/fixtures";
import { CleanupDashboard } from "./CleanupDashboard";
import { AppStateProvider, useAppState } from "../state/appState";

// api mocké routé par chemin + query (pattern App.test.tsx) ; le SSE, lui,
// n'emprunte PAS api (src/lib/sse.ts fetch directement) : fetch global stubbé.
const getMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/api", () => ({ api: { get: getMock, send: sendMock } }));
vi.mock("../hooks/useStaticData", () => ({
  useCollections: () => ({ data: collections, isLoading: false }),
  useTags: () => ({ data: [], isLoading: false }),
}));

// Forme RÉELLE du flux (sidecar/api/sse.ts : le data de progress est l'event
// complet sérialisé, la progression sous `progress`). Flux laissé ouvert :
// l'assertion porte sur l'état « en cours », jamais atteint par un done.
function stubSse(jobId: string) {
  const encoder = new TextEncoder();
  return vi.fn((url: unknown) => {
    if (String(url).includes(`/api/jobs/${jobId}/events`)) {
      return Promise.resolve(new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(
            `event: progress\ndata: ${JSON.stringify({ kind: "progress", progress: { done: 1, total: 2, label: null } })}\n\n`,
          ));
        },
      }), { status: 200, headers: { "Content-Type": "text/event-stream" } }));
    }
    return Promise.reject(new Error(`URL inattendue : ${String(url)}`));
  });
}

function mockApi() {
  getMock.mockReset().mockImplementation((path: string, query?: Record<string, unknown>) => {
    if (path === "/api/analysis/status")
      return Promise.resolve({
        links: { lastScan: null, running: false },
        duplicates: { lastScan: null, running: false },
      });
    if (path === "/api/analysis/results/links")
      return Promise.resolve({ items: [], total: query?.filter === "redirect" ? 7 : 12, page: 0, perPage: 1 });
    if (path === "/api/analysis/results/duplicates")
      return Promise.resolve({ exact: [{ key: "k", kind: "exact", items: [] }], normalized: [], fuzzy: [] });
    if (path === "/api/raindrops")
      return Promise.resolve({ items: [], count: query?.notag ? 42 : 5, page: 0, perPage: 1 });
    return Promise.resolve({});
  });
  sendMock.mockReset();
}

const Spy = () => {
  const { view } = useAppState();
  return <span data-testid="view">{JSON.stringify(view)}</span>;
};

const renderDashboard = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AppStateProvider><Spy /><CleanupDashboard /></AppStateProvider>
    </QueryClientProvider>,
  );

beforeEach(() => mockApi());
afterEach(() => vi.unstubAllGlobals());

describe("CleanupDashboard", () => {
  it("affiche les 6 compteurs avec leurs valeurs et la fraîcheur des scans", async () => {
    renderDashboard();
    // L'élément existe dès le premier rendu (valeur « … » en attendant les
    // queries) : c'est le CONTENU qui signale la résolution, d'où waitFor.
    await waitFor(() => {
      expect(screen.getByTestId("compteur-dead")).toHaveTextContent("12");
      expect(screen.getByTestId("compteur-redirect")).toHaveTextContent("7");
      expect(screen.getByTestId("compteur-duplicates")).toHaveTextContent("1");
      expect(screen.getByTestId("compteur-untagged")).toHaveTextContent("42");
      expect(screen.getByTestId("compteur-empty-collections")).toHaveTextContent("0");
      expect(screen.getByTestId("compteur-trash")).toHaveTextContent("5");
    });
    // lastScan null → « jamais » sur les deux blocs de scan.
    expect(screen.getAllByText(/jamais/)).toHaveLength(2);
  });

  it("cliquer « Liens morts » navigue vers cleanupView/dead", async () => {
    renderDashboard();
    await userEvent.click(await screen.findByText("Liens morts"));
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({
      kind: "cleanupView",
      type: "dead",
    });
  });

  it("Lancer appelle POST /api/analysis/scan et affiche la progression du SSE", async () => {
    vi.stubGlobal("fetch", stubSse("job-1"));
    sendMock.mockImplementation(async (_m: string, p: string) =>
      p === "/api/analysis/scan" ? { jobId: "job-1" } : { cancelled: true });
    renderDashboard();
    const blocLiens = await screen.findByRole("region", { name: "Liens" });
    await userEvent.click(within(blocLiens).getByRole("button", { name: "Lancer l'analyse" }));
    expect(sendMock).toHaveBeenCalledWith("POST", "/api/analysis/scan", { type: "links" });
    expect(await screen.findByText("Analyse en cours… 1/2")).toBeInTheDocument();
  });

  it("Annuler interrompt le suivi et appelle POST /api/jobs/:id/cancel", async () => {
    vi.stubGlobal("fetch", stubSse("job-1"));
    sendMock.mockImplementation(async (_m: string, p: string) =>
      p === "/api/analysis/scan" ? { jobId: "job-1" } : { cancelled: true });
    renderDashboard();
    const blocLiens = await screen.findByRole("region", { name: "Liens" });
    await userEvent.click(within(blocLiens).getByRole("button", { name: "Lancer l'analyse" }));
    await screen.findByText("Analyse en cours… 1/2");
    await userEvent.click(screen.getByRole("button", { name: "Annuler le scan" }));
    expect(sendMock).toHaveBeenCalledWith("POST", "/api/jobs/job-1/cancel");
  });
});
