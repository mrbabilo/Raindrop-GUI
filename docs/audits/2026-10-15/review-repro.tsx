import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ReviewPage } from "./ReviewPage";
import type { View } from "../state/appState";

// Tests transférés de ReviewPage.test.tsx (plafond de 400, cliquet
// ed563f1) — même frontière que ReviewPage.archive / ReviewPage.dedupe :
// ce fichier porte les deux op de suppression de collections.
// DOMAINE.md : supprimer des collections est IRRÉVERSIBLE (niveau 2). La
// suppression INDIVIDUELLE (une ligne de CollectionsVides) emprunte la même
// Revue que la masse — la frappe SUPPRIMER la porte, chaque id part par son
// DELETE, jamais par le cleanup GLOBAL.

// api mocké : les DELETE passent par api.send — les assertions portent les
// chemins exacts. Les trois arguments sont NOMMÉS : sans eux, vitest type
// chaque appel comme un tuple vide et `calls[i][1]` ne compile plus (TS2493).
const sendMock = vi.hoisted(() =>
  vi.fn(async (_methode: string, _chemin: string, _corps?: unknown) => ({})),
);
vi.mock("../lib/api", () => ({ api: { send: sendMock, get: vi.fn() } }));

const goBack = vi.fn();

type ReviewView = Extract<View, { kind: "review" }>;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);
const renderReview = (r: ReviewView) => render(<ReviewPage review={r} goBack={goBack} />, { wrapper });

beforeEach(() => {
  sendMock.mockClear();
  goBack.mockClear();
});

it("audit : Exécuter reste désactivé pendant un DELETE de collection", async () => {
  sendMock.mockImplementation(() => new Promise(() => {}));
  renderReview({kind: "review", items: [], action: {op: "delete-collections", ids: [301]}, sourceLabel: "audit", totalServer: 1});
  await userEvent.type(screen.getByPlaceholderText(/SUPPRIMER/), "SUPPRIMER");
  const button = screen.getByRole("button", {name: "Exécuter"});
  await userEvent.click(button);
  await vi.waitFor(() => expect(sendMock).toHaveBeenCalledWith("DELETE", "/api/collections/301"));
  expect(button).toBeDisabled();
});
