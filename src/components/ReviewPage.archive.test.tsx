import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ReviewPage } from "./ReviewPage";
import type { View } from "../state/appState";

// La branche ARCHIVE de la Revue : ce qu'elle annonce, ce qu'elle écarte, et
// ce qu'elle refuse. Fichier à part — ReviewPage.test.tsx couvre les actions
// d'écriture (corbeille, déplacement, étiquettes) et les deux niveaux de
// confirmation ; l'archivage n'écrit rien chez Raindrop et suit un job, il a
// ses propres contrats. (Le cœur pur et le suivi du job sont dans
// RevueArchive.test.tsx.)
const sendMock = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("../lib/api", () => ({ api: { send: sendMock, get: vi.fn() } }));

// L'inventaire des archives : injecté par test. Le reste du module (les
// formateurs, la borne) reste le VRAI — c'est sa sortie que l'écran montre.
const archivesMock = vi.hoisted(() => vi.fn());
// Le suivi du job : piloté par test pour jouer son TERME (null = en attente).
const suivreMock = vi.hoisted(() => vi.fn((): unknown => null));
vi.mock("../lib/suiviSauvegarde", () => ({ suivreJob: suivreMock, annuler: vi.fn() }));
vi.mock("../hooks/useBackup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks/useBackup")>()),
  useArchives: archivesMock,
  useJobsEnVol: vi.fn(() => ({ data: [] })),
  useInvalidateSauvegarde: () => vi.fn(),
}));

type ReviewView = Extract<View, { kind: "review" }>;

const goBack = vi.fn();
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);
const renderReview = (r: ReviewView) => render(<ReviewPage review={r} goBack={goBack} />, { wrapper });

beforeEach(() => {
  sendMock.mockClear();
  goBack.mockClear();
  archivesMock.mockReset().mockReturnValue({ data: undefined });
  suivreMock.mockReset().mockReturnValue(null);
});

// jsdom ne fait pas de layout : sans hauteur, le virtualizer rend une plage
// vide (même shim que ReviewPage.test et ListPane.test).
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 600 });
});
afterAll(() => {
  delete (HTMLElement.prototype as unknown as { offsetHeight?: unknown }).offsetHeight;
});

describe("ReviewPage — archivage des copies permanentes", () => {
  const avecCache = (id: number, cache: { status: string; size?: number } | null) => ({
    id,
    url: `https://${id}.example`,
    title: `T${id}`,
    collectionId: 0,
    cache,
  });
  const revueArchive = (items: ReturnType<typeof avecCache>[]): ReviewView => ({
    kind: "review",
    items,
    action: { op: "archive" },
    sourceLabel: "sélection",
  });

  // La règle du lot : l'identifiant 2 est DANS la sélection — on le montre —
  // et c'est l'inventaire qui l'écarte du POST.
  it("les déjà-archivés sont écartés du job ET comptés à l'écran", async () => {
    archivesMock.mockReturnValue({ data: { set: new Set([2]), octets: 0 } });
    const revue = revueArchive([
      avecCache(1, { status: "ready" }),
      avecCache(2, { status: "ready" }),
      avecCache(3, { status: "ready" }),
    ]);
    expect(revue.items.map((i) => i.id)).toContain(2); // il était bien là
    renderReview(revue);
    expect(screen.getByText(/2 copie\(s\) à archiver · 1 déjà archivée\(s\)/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: /Je confirme/ }));
    await userEvent.click(screen.getByRole("button", { name: "Exécuter" }));
    await vi.waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith("POST", "/api/backup/archive", { ids: [1, 3] }),
    );
  });

  it("la confirmation compte ce qui sera VRAIMENT archivé", () => {
    archivesMock.mockReturnValue({ data: { set: new Set([2, 3]), octets: 0 } });
    renderReview(
      revueArchive([avecCache(1, { status: "ready" }), avecCache(2, { status: "ready" }), avecCache(3, { status: "ready" })]),
    );
    // 3 cochés, mais 1 seul à archiver : c'est lui que la confirmation porte.
    expect(screen.getByLabelText("Je confirme l'action sur 1 élément")).toBeInTheDocument();
  });

  it("annonce le volume et la durée quand les tailles sont connues", () => {
    renderReview(revueArchive([avecCache(1, { status: "ready", size: 3 * 2 ** 20 })]));
    expect(screen.getByText(/Environ 3 Mo/)).toBeInTheDocument();
  });

  it("une vue qui ignore l'état des copies le DIT", () => {
    // Construite comme la vue Liens morts : aucun `cache` sur les items.
    renderReview({
      kind: "review",
      items: [{ id: 1, url: "u", title: "t", collectionId: 0 }],
      action: { op: "archive" },
      sourceLabel: "liens morts",
    });
    expect(screen.getByText(/ne connaît pas l'état des copies/)).toBeInTheDocument();
  });

  // Pas de découpe silencieuse en lots : ce serait le « tout archiver » que
  // la spec écarte, réintroduit par la porte de derrière.
  it("au-delà de la borne, un refus AFFICHÉ et rien d'envoyé", async () => {
    const trop = Array.from({ length: 501 }, (_, i) => avecCache(i + 1, { status: "ready" }));
    renderReview(revueArchive(trop));
    expect(screen.getByText(/501 sélectionnés : la borne est de 500/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: /Je confirme/ }));
    expect(screen.getByRole("button", { name: "Exécuter" })).toBeDisabled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rien à archiver : rien à exécuter", async () => {
    renderReview(revueArchive([avecCache(1, null)]));
    await userEvent.click(screen.getByRole("checkbox", { name: /Je confirme/ }));
    expect(screen.getByRole("button", { name: "Exécuter" })).toBeDisabled();
  });

  // R8P-1 : un terme portant un DÉFICIT tient la Revue pour se lire. Le
  // retour immédiat rendait le bilan (échecs, non tentés) invisible — il
  // n'existait qu'une frame (audit du 2026-09-23).
  const terme = (echecs: { id: number; raison: string }[], nonTentes = 0) => ({
    jobId: "j1", type: "archive", done: 1, total: 1, label: null,
    fin: { kind: "done", resultat: { demandes: 1, faits: 1, echecs, annule: false, nonTentes } },
  });
  const lancerArchive = async () => {
    renderReview(revueArchive([avecCache(1, { status: "ready" })]));
    await userEvent.click(screen.getByRole("checkbox", { name: /Je confirme/ }));
    await userEvent.click(screen.getByRole("button", { name: "Exécuter" }));
  };

  it("témoin : un terme sans déficit revient à la vue d'origine", async () => {
    suivreMock.mockReturnValue(terme([]));
    await lancerArchive();
    await vi.waitFor(() => expect(goBack).toHaveBeenCalled());
  });

  it("des échecs : la Revue tient, le bilan se lit", async () => {
    suivreMock.mockReturnValue(terme([{ id: 1, raison: "http 404" }]));
    await lancerArchive();
    expect(await screen.findByText(/1 en échec/)).toBeInTheDocument();
    expect(screen.getByText("http 404")).toBeInTheDocument();
    expect(goBack).not.toHaveBeenCalled();
  });
});
