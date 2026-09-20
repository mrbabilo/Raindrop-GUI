import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ReviewPage } from "./ReviewPage";
import type { View } from "../state/appState";
import { CLE_GROUPES, type DuplicateGroups } from "../hooks/useAnalysis";

// Les tests du job dedupe, extraits de ReviewPage.test.tsx (le plafond dur
// de 400 lignes). Le mock SSE vit ICI : seul le dedupe court un job dont le
// flux est suivi — les autres actions ne s'abonnent pas.
const sendMock = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("../lib/api", () => ({ api: { send: sendMock, get: vi.fn() } }));
// Signature LARGE dès le mock hoisté : les tests du terme posent des
// implémentations qui appellent aussi `onEvent` — une signature étroite
// `{ onDone }` rendrait `mockImplementation` non assignable (TS2345).
const sseMock = vi.hoisted(() => vi.fn((_jobId: string, h: { onEvent: (e: Record<string, unknown>) => void; onDone: () => void }) => {
  h.onDone();
  return Promise.resolve();
}));
vi.mock("../lib/sse", () => ({ jobEvents: sseMock }));

type ReviewView = Extract<View, { kind: "review" }>;

const goBack = vi.fn();
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);
const renderReview = (r: ReviewView) => render(<ReviewPage review={r} goBack={goBack} />, { wrapper });

beforeEach(() => {
  sendMock.mockClear();
  goBack.mockClear();
});

// Même shim que ReviewPage.test : jsdom ne fait pas de layout, le
// virtualizer déduit une plage vide de offsetHeight === 0.
import { beforeAll, afterAll } from "vitest";
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 600 });
});
afterAll(() => {
  delete (HTMLElement.prototype as unknown as { offsetHeight?: unknown }).offsetHeight;
});

describe("ReviewPage — le tri des doublons (op dedupe)", () => {
  const revueDedupe: View = {
    kind: "review",
    items: [
      { id: 2, url: "https://a.example/copie", title: "Copie récente", collectionId: 7, dedupeGarde: { id: 1, title: "Ancienne page" } },
    ],
    action: { op: "dedupe" },
    sourceLabel: "Doublons",
    returnView: { kind: "cleanupView", type: "duplicates" },
  };

  it("la ligne dit son gardé, et la note dit ce qui arrive aux étiquettes et surlignages", () => {
    renderReview(revueDedupe);
    expect(screen.getByText(/→ gardé : Ancienne page/)).toBeInTheDocument();
    expect(screen.getByText(/Les étiquettes de chaque copie remontent/)).toBeInTheDocument();
    expect(screen.getByText(/Les surlignages restent dans la corbeille/)).toBeInTheDocument();
  });

  it("exécuter POSTE les paires au job, et revient à la vue d'origine", async () => {
    sendMock.mockResolvedValue({ jobId: "j-dedupe", total: 1 });
    renderReview(revueDedupe);
    // Les items démarrent INCLUS : on ne décoche pas l'unique copie. La case
    // de confirmation, elle, arme l'exécution (niveau 1).
    await userEvent.click(screen.getByRole("checkbox", { name: /Je confirme l'action sur 1/ }));
    await userEvent.click(screen.getByRole("button", { name: "Exécuter" }));
    await vi.waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith("POST", "/api/raindrops/dedupe", {
        paires: [{ garde: 1, copies: [{ id: 2, collectionId: 7 }] }],
      }),
    );
    await vi.waitFor(() => expect(goBack).toHaveBeenCalled());
  });

  it("une copie désélectionnée SORT de sa paire — le gardé n'est jamais un item", async () => {
    sendMock.mockResolvedValue({ jobId: "j-dedupe", total: 1 });
    const deux: View = {
      ...revueDedupe,
      items: [
        revueDedupe.items[0]!,
        { id: 3, url: "https://a.example/copie2", title: "Autre copie", collectionId: 7, dedupeGarde: { id: 1, title: "Ancienne page" } },
      ],
    };
    renderReview(deux);
    await userEvent.click(screen.getByRole("checkbox", { name: "Autre copie" }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Je confirme l'action sur 1/ }));
    await userEvent.click(screen.getByRole("button", { name: "Exécuter" }));
    await vi.waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith("POST", "/api/raindrops/dedupe", {
        paires: [{ garde: 1, copies: [{ id: 2, collectionId: 7 }] }],
      }),
    );
  });
});

// Le TERME du job dedupe : le résultat (`ResultatDedupe` du sidecar, arrivé
// À PLAT sur l'event `done` — trap sse.ts) doit se LIRE à l'écran. C'est le
// défaut réel du 2026-09-20 : une corbeille dedupe qui ne faisait rien
// répondait `result: true`, et ni le sidecar ni la Revue ne pouvaient le
// dire. Un terme porte des déficits → la Revue TIENT, le résumé nomme ;
// terme propre → retour automatique (comportement inchangé).
describe("ReviewPage — le terme du job dedupe", () => {
  const revueDedupe: View = {
    kind: "review",
    items: [
      { id: 2, url: "https://a.example/copie", title: "Copie récente", collectionId: 7, dedupeGarde: { id: 1, title: "Ancienne page" } },
    ],
    action: { op: "dedupe" },
    sourceLabel: "Doublons",
    returnView: { kind: "cleanupView", type: "duplicates" },
  };

  beforeEach(() => {
    // Le défaut du fichier (job qui finit tout de suite, sans event) —
    // chaque test le remplace par LE flux qu'il décrit.
    sseMock.mockReset().mockImplementation((_jobId: string, h: { onDone: () => void }) => {
      h.onDone();
      return Promise.resolve();
    });
  });

  // Un QueryClient CONTRÔLÉ : l'élagage écrit le cache `CLE_GROUPES` — c'est
  // là qu'on lit ce que la vue a vraiment retiré, sans mocker le hook.
  const groupeAvec = (ids: number[]) => ({
    exact: [
      {
        key: "k",
        kind: "exact" as const,
        items: ids.map((id) => ({ id, url: `https://x.example/${id}`, title: `T${id}`, collectionId: 7, created: "2025-01-01T00:00:00Z" })),
      },
    ],
    normalized: [],
    fuzzy: [],
  });

  it("un échec INDIVIDUEL au terme : la Revue tient, le résumé nomme, le retour se rouvre", async () => {
    sseMock.mockImplementation((_jobId: string, h: { onEvent: (e: Record<string, unknown>) => void; onDone: () => void }) => {
      h.onEvent({ kind: "progress", progress: { done: 1, total: 1 } });
      h.onEvent({ kind: "done", paires: 1, corbeille: 0, fusionnees: 1, etiquettesAjoutees: 0, nonFusionnees: [], echecs: [{ id: 2, raison: "http 502" }], annule: false });
      h.onDone();
      return Promise.resolve();
    });
    const client = new QueryClient();
    client.setQueryData(CLE_GROUPES, groupeAvec([1, 2]));
    render(
      <QueryClientProvider client={client}>
        <ReviewPage review={revueDedupe} goBack={goBack} />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole("checkbox", { name: /Je confirme l'action sur 1/ }));
    await userEvent.click(screen.getByRole("button", { name: "Exécuter" }));
    // Le résumé NOMME ce qui a marché et ce qui a échoué — jamais un silence.
    expect(await screen.findByText(/Terminé : 0 copie corbeillée/)).toBeInTheDocument();
    expect(screen.getByText(/1 copie NON corbeillée/)).toBeInTheDocument();
    expect(screen.getByText(/http 502/)).toBeInTheDocument();
    // La Revue TIENT (R8P-1) : un terme avec échec ne repart pas en silence.
    expect(goBack).not.toHaveBeenCalled();
    // Le retour du haut se rouvre (il était verrouillé pendant la course).
    expect(screen.getByRole("button", { name: "Retour" })).toBeEnabled();
    // L'id en échec reste vivant : l'élagage ne doit PAS le retirer du cache.
    const groupes = client.getQueryData<DuplicateGroups | undefined>(CLE_GROUPES);
    expect(groupes?.exact[0]?.items.some((i) => i.id === 2)).toBe(true);
  });

  it("des étiquettes non fusionnées : le déficit est dit — les copies sont parties", async () => {
    sseMock.mockImplementation((_jobId: string, h: { onEvent: (e: Record<string, unknown>) => void; onDone: () => void }) => {
      h.onEvent({ kind: "done", paires: 1, corbeille: 1, fusionnees: 0, etiquettesAjoutees: 0, nonFusionnees: [{ id: 2, raison: "gardé illisible : http 429" }], echecs: [], annule: false });
      h.onDone();
      return Promise.resolve();
    });
    renderReview(revueDedupe);
    await userEvent.click(screen.getByRole("checkbox", { name: /Je confirme l'action sur 1/ }));
    await userEvent.click(screen.getByRole("button", { name: "Exécuter" }));
    expect(await screen.findByText(/1 copie corbeillée sans ses étiquettes/)).toBeInTheDocument();
    expect(screen.getByText(/gardé illisible : http 429/)).toBeInTheDocument();
    expect(goBack).not.toHaveBeenCalled();
  });

  it("un terme SANS défaut : retour automatique, l'élagage retire la corbeillée", async () => {
    // Garde du comportement historique, prouvé sur le nouveau chemin : le
    // résultat propre ne tient PAS la Revue, et l'id corbeillé sort du cache.
    // Trois ids : un groupe de doublons garde toujours ≥ 2 exemplaires
    // (elaguerGroupes élimine un groupe retombé à 1) — [1, 3] survivent.
    sseMock.mockImplementation((_jobId: string, h: { onEvent: (e: Record<string, unknown>) => void; onDone: () => void }) => {
      h.onEvent({ kind: "done", paires: 1, corbeille: 1, fusionnees: 1, etiquettesAjoutees: 1, nonFusionnees: [], echecs: [], annule: false });
      h.onDone();
      return Promise.resolve();
    });
    const client = new QueryClient();
    client.setQueryData(CLE_GROUPES, groupeAvec([1, 2, 3]));
    render(
      <QueryClientProvider client={client}>
        <ReviewPage review={revueDedupe} goBack={goBack} />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole("checkbox", { name: /Je confirme l'action sur 1/ }));
    await userEvent.click(screen.getByRole("button", { name: "Exécuter" }));
    await vi.waitFor(() => expect(goBack).toHaveBeenCalled());
    const groupes = client.getQueryData<DuplicateGroups | undefined>(CLE_GROUPES);
    expect(groupes?.exact[0]?.items.some((i) => i.id === 2)).toBe(false);
  });
});

