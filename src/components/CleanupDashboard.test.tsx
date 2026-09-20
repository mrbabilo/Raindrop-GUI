import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
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
// Variante "error" : event terminal {kind:"error", message} (jobs/store.ts
// fail() → pas de champ `result`), puis fermeture — le job n'est plus running.
function stubSse(jobId: string, kind: "progress" | "error" = "progress") {
  const encoder = new TextEncoder();
  return vi.fn((url: unknown) => {
    if (String(url).includes(`/api/jobs/${jobId}/events`)) {
      return Promise.resolve(new Response(new ReadableStream({
        start(controller) {
          if (kind === "progress") {
            controller.enqueue(encoder.encode(
              `event: progress\ndata: ${JSON.stringify({ kind: "progress", progress: { done: 1, total: 2, label: null } })}\n\n`,
            ));
          } else {
            controller.enqueue(encoder.encode(
              `event: error\ndata: ${JSON.stringify({ kind: "error", message: "bibliothèque injoignable" })}\n\n`,
            ));
            controller.close();
          }
        },
      }), { status: 200, headers: { "Content-Type": "text/event-stream" } }));
    }
    return Promise.reject(new Error(`URL inattendue : ${String(url)}`));
  });
}

// Comme stubSse, mais le flux HONORE le signal : l'abort rejette la lecture
// du corps avec AbortError — ce que fait le fetch réel (undici) et ce qui
// produit, sans garde, la fausse alerte à chaque annulation volontaire.
function stubSseAbordable(jobId: string) {
  const encoder = new TextEncoder();
  return vi.fn((url: unknown, init?: { signal?: AbortSignal }) => {
    if (String(url).includes(`/api/jobs/${jobId}/events`)) {
      return Promise.resolve(new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(
            `event: progress\ndata: ${JSON.stringify({ kind: "progress", progress: { done: 1, total: 2, label: null } })}\n\n`,
          ));
          init?.signal?.addEventListener("abort", () =>
            controller.error(new DOMException("The operation was aborted.", "AbortError")),
          );
        },
      }), { status: 200, headers: { "Content-Type": "text/event-stream" } }));
    }
    return Promise.reject(new Error(`URL inattendue : ${String(url)}`));
  });
}

function mockApi(opts: { linksRunning?: boolean; jamais?: boolean; enVol?: unknown[]; reprise?: { verifies: number; total: number } } = {}) {
  // `jamais` : aucune analyse n'a jamais tourné. Le défaut est l'inverse —
  // une bibliothèque déjà analysée — pour que les tests de compteurs lisent
  // des NOMBRES, et que le cas « jamais » ait son test à lui.
  const scanne = opts.jamais === true ? null : "2026-09-19T08:00:00.000Z";
  getMock.mockReset().mockImplementation((path: string, query?: Record<string, unknown>) => {
    // La route RÉELLE rend un TABLEAU. Elle manquait ici, et le `{}` du repli
    // faisait jeter `.find` — l'arbre entier se démontait, et le compteur
    // absent passait pour un défaut du composant.
    if (path === "/api/jobs") return Promise.resolve(opts.enVol ?? []);
    if (path === "/api/analysis/status")
      return Promise.resolve({
        links: { lastScan: scanne, running: opts.linksRunning ?? false, ...(opts.reprise ?? {}) },
        duplicates: { lastScan: scanne, running: false },
      });
    if (path === "/api/analysis/results/links")
      return Promise.resolve({
        items: [],
        total: query?.filter === "redirect" ? 7 : query?.filter === "indeterminate" ? 3 : 12,
        page: 0,
        perPage: 1,
      });
    if (path === "/api/analysis/results/duplicates")
      // Un groupe de DEUX signets : le compteur doit dire les deux nombres.
      return Promise.resolve({
        exact: [{ key: "k", kind: "exact", items: [{ id: 1 }, { id: 2 }] }],
        normalized: [],
        fuzzy: [],
      });
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
  it("affiche les 7 compteurs avec leurs valeurs", async () => {
    renderDashboard();
    // L'élément existe dès le premier rendu (valeur « … » en attendant les
    // queries) : c'est le CONTENU qui signale la résolution, d'où waitFor.
    await waitFor(() => {
      expect(screen.getByTestId("compteur-dead")).toHaveTextContent("12");
      expect(screen.getByTestId("compteur-redirect")).toHaveTextContent("7");
      // DOMAINE.md en fait une catégorie à part — « jamais classé mort ».
      expect(screen.getByTestId("compteur-indeterminate")).toHaveTextContent("3");
      // GROUPES et SIGNETS : « 1 » seul se lisait « 1 signet en double ».
      expect(screen.getByTestId("compteur-duplicates")).toHaveTextContent("1 groupe · 2 signets");
      expect(screen.getByTestId("compteur-untagged")).toHaveTextContent("42");
      expect(screen.getByTestId("compteur-empty-collections")).toHaveTextContent("0");
      expect(screen.getByTestId("compteur-trash")).toHaveTextContent("5");
    });
  });

  // « 0 lien mort » se lit « bibliothèque saine ». Le sidecar rend
  // honnêtement `total: 0` sur un cache vierge — c'est l'écran qui mentait.
  it("aucune analyse jamais lancée : les compteurs qui en dépendent ne disent PAS zéro", async () => {
    mockApi({ jamais: true });
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByTestId("compteur-dead")).toHaveTextContent("jamais analysé");
    });
    expect(screen.getByTestId("compteur-redirect")).toHaveTextContent("jamais analysé");
    expect(screen.getByTestId("compteur-indeterminate")).toHaveTextContent("jamais analysé");
    expect(screen.getByTestId("compteur-duplicates")).toHaveTextContent("jamais analysé");
    // Les comptes VIVANTS, eux, restent des nombres : ils ne dépendent
    // d'aucune analyse et sont vrais à tout instant.
    expect(screen.getByTestId("compteur-untagged")).toHaveTextContent("42");
    expect(screen.getByTestId("compteur-trash")).toHaveTextContent("5");
    expect(screen.getAllByText(/jamais$/)).toHaveLength(2); // la fraîcheur des deux blocs
  });

  // Une analyse de 12 210 liens dure longtemps. Quitter la vue démontait ce
  // composant : au retour, un bouton grisé, ni progression ni annulation —
  // alors que `/api/jobs` porte tout (mesuré : 300/12210 avec son libellé).
  it("un scan qu'on n'a pas lancé soi-même est ADOPTÉ : progression et annulation", async () => {
    mockApi({
      linksRunning: true,
      enVol: [{ id: "job-9", type: "scan-links", status: "running", progress: { done: 300, total: 12210, label: null } }],
    });
    sendMock.mockImplementation(async () => ({ cancelled: true }));
    renderDashboard();
    expect(await screen.findByText("Analyse en cours… 300/12210")).toBeInTheDocument();
    const blocLiens = screen.getByRole("region", { name: "Liens" });
    await userEvent.click(within(blocLiens).getByRole("button", { name: "Annuler le scan" }));
    expect(sendMock).toHaveBeenCalledWith("POST", "/api/jobs/job-9/cancel");
  });

  // La reprise après coupure fonctionnait déjà ; elle ne se voyait pas.
  it("une vérification déjà entamée est annoncée avant de relancer", async () => {
    mockApi({ jamais: true, reprise: { verifies: 9400, total: 12210 } });
    renderDashboard();
    expect(await screen.findByText(/9400 \/ 12210 liens déjà vérifiés/)).toBeInTheDocument();
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
    mockApi({ jamais: true });
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
    mockApi({ jamais: true });
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

  // Revue finale : l'abort coupe le flux SSE → la mutation rejette en
  // AbortError — une annulation VOLONTAIRE n'est pas une erreur, l'alerte
  // inline ne doit jamais apparaître.
  it("Annuler n'affiche aucune alerte (l'AbortError est filtré)", async () => {
    mockApi({ jamais: true }); // le bouton se nomme « Lancer l'analyse »
    vi.stubGlobal("fetch", stubSseAbordable("job-1"));
    sendMock.mockImplementation(async (_m: string, p: string) =>
      p === "/api/analysis/scan" ? { jobId: "job-1" } : { cancelled: true });
    renderDashboard();
    const blocLiens = await screen.findByRole("region", { name: "Liens" });
    await userEvent.click(within(blocLiens).getByRole("button", { name: "Lancer l'analyse" }));
    await screen.findByText("Analyse en cours… 1/2");
    await userEvent.click(screen.getByRole("button", { name: "Annuler le scan" }));
    // Le suivi s'est refermé (retour au repos) — sans jamais alerter.
    await waitFor(() => expect(sendMock).toHaveBeenCalledWith("POST", "/api/jobs/job-1/cancel"));
    expect(await within(blocLiens).findByRole("button", { name: "Lancer l'analyse" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // R12P-1 : un échec de lancement ne doit pas être silencieux (pattern T8 :
  // erreur inline, brouillon non détruit). Ex. scan déjà en cours côté
  // sidecar après un quit/retour sur la vue.
  // Quitter le Nettoyage pendant un scan ne doit pas laisser la connexion
  // SSE ouverte jusqu'à la fin du job : le composant qui la lisait est
  // démonté, le controller doit couper le flux au démontage. (Le job
  // sidecar, lui, continue — le retour ré-adopte par /api/jobs.)
  it("quitter le Nettoyage pendant un scan coupe le suivi SSE", async () => {
    sendMock.mockResolvedValue({ jobId: "j1" });
    let recu: AbortSignal | undefined;
    const interne = stubSseAbordable("j1");
    vi.stubGlobal("fetch", (url: unknown, init?: { signal?: AbortSignal }) => {
      if (String(url).includes("/api/jobs/j1/events")) recu = init?.signal;
      return interne(url as string, init);
    });
    const { unmount } = renderDashboard();
    const blocLiens = await screen.findByRole("region", { name: "Liens" });
    await userEvent.click(within(blocLiens).getByRole("button", { name: "Lancer l'analyse" }));
    await within(blocLiens).findByRole("status"); // progression affichée : le suivi est ouvert
    unmount();
    expect(recu?.aborted).toBe(true);
  });

  it("affiche l'erreur inline quand le lancement échoue", async () => {
    sendMock.mockRejectedValue(new Error("scan links déjà en cours"));
    renderDashboard();
    const blocLiens = await screen.findByRole("region", { name: "Liens" });
    await userEvent.click(within(blocLiens).getByRole("button", { name: "Lancer l'analyse" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Erreur : scan links déjà en cours");
  });

  // R12P-1 cas (ii) : l'event SSE `error` est un échec, pas une fin normale —
  // le suivi rejette, la mutation passe en erreur, le message s'affiche.
  it("l'event SSE error rejette le suivi et s'affiche inline", async () => {
    vi.stubGlobal("fetch", stubSse("job-1", "error"));
    sendMock.mockImplementation(async (_m: string, p: string) =>
      p === "/api/analysis/scan" ? { jobId: "job-1" } : { cancelled: true });
    renderDashboard();
    const blocLiens = await screen.findByRole("region", { name: "Liens" });
    await userEvent.click(within(blocLiens).getByRole("button", { name: "Lancer l'analyse" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Erreur : bibliothèque injoignable");
  });

  // R12P-1 complément : le champ `running` du status (pollé toutes les 5 s)
  // ferme le trou du remount — le lancement est désactivé tant que le
  // sidecar signale un scan en cours pour ce type.
  it("désactive le lancement quand le sidecar signale un scan en cours", async () => {
    mockApi({ linksRunning: true, jamais: true });
    renderDashboard();
    const blocLiens = await screen.findByRole("region", { name: "Liens" });
    // La region existe dès le premier rendu : c'est le BOUTON (posé par la
    // réponse status) qui porte la résolution — d'où findBy.
    expect(await within(blocLiens).findByRole("button", { name: "Analyse en cours" })).toBeDisabled();
    // L'autre type, lui, reste lançable.
    const blocDupes = screen.getByRole("region", { name: "Doublons" });
    expect(within(blocDupes).getByRole("button", { name: "Lancer l'analyse" })).toBeEnabled();
  });
});
