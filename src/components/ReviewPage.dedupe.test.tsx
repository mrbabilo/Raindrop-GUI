import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ReviewPage } from "./ReviewPage";
import type { View } from "../state/appState";

// Les tests du job dedupe, extraits de ReviewPage.test.tsx (le plafond dur
// de 400 lignes). Le mock SSE vit ICI : seul le dedupe court un job dont le
// flux est suivi — les autres actions ne s'abonnent pas.
const sendMock = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("../lib/api", () => ({ api: { send: sendMock, get: vi.fn() } }));
const sseMock = vi.hoisted(() => vi.fn((_jobId: string, h: { onDone: () => void }) => {
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

