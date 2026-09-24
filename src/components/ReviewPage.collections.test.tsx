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

describe("ReviewPage — suppression de collections individuelles (niveau 2)", () => {
  const revue: View = {
    kind: "review",
    items: [],
    action: { op: "delete-collections", ids: [301, 302] },
    sourceLabel: "Collections vides",
    totalServer: 2,
    returnView: { kind: "cleanupView", type: "empty-collections" },
  };

  it("la frappe ouvre Exécuter, qui envoie UN DELETE par id — pas le cleanup global", async () => {
    sendMock.mockResolvedValue({});
    renderReview(revue);
    expect(screen.getByText(/2 éléments concernés/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exécuter" })).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText(/SUPPRIMER/), "SUPPRIMER");
    await userEvent.click(screen.getByRole("button", { name: "Exécuter" }));
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalledWith("DELETE", "/api/collections/301"));
    expect(sendMock).toHaveBeenCalledWith("DELETE", "/api/collections/302");
    expect(sendMock).not.toHaveBeenCalledWith("POST", "/api/collections/cleanup", expect.anything());
    expect(goBack).toHaveBeenCalled();
  });

  it("un échec reste inline, la Revue tient, pas de retour", async () => {
    // Les DELETE partent dans l'ordre des ids : 301 passe, 302 rejette.
    sendMock.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("http 500"));
    renderReview(revue);
    await userEvent.type(screen.getByPlaceholderText(/SUPPRIMER/), "SUPPRIMER");
    await userEvent.click(screen.getByRole("button", { name: "Exécuter" }));
    // Le premier rejeté se dit (role="alert") et R8P-1 tient : pas de
    // goBack, la Revue reste affichée.
    await vi.waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(goBack).not.toHaveBeenCalled();
  });
});

// L'action de masse (« Supprimer les collections vides ») porte les ids de
// collectionsVides, DÉJÀ ORDONNÉS feuilles d'abord (triPourSuppression) :
// la Revue les exécute SÉQUENTIELLEMENT — au moment où un parent part, sa
// descendance a déjà répondu, et le comportement de Raindrop face aux
// enfants restants devient sans objet. Un allSettled parallèle ne serait
// qu'une intention d'ordre.
describe("ReviewPage — delete-empty-collections : DELETE séquentiels dans l'ordre reçu", () => {
  const revue: View = {
    kind: "review",
    items: [],
    action: { op: "delete-empty-collections", ids: [312, 311, 310] },
    sourceLabel: "Collections vides",
    totalServer: 3,
    returnView: { kind: "cleanupView", type: "empty-collections" },
  };

  it("le second DELETE n'existe pas avant la réponse du premier — puis l'ordre est respecté", async () => {
    // Le premier DELETE ne répond que quand le test le libère : en
    // parallèle (allSettled), les trois seraient en vol dès le clic.
    let libere!: () => void;
    const premier = new Promise<void>((r) => { libere = r; });
    sendMock.mockImplementationOnce(() => premier.then(() => ({}))).mockResolvedValue({});
    renderReview(revue);
    await userEvent.type(screen.getByPlaceholderText(/SUPPRIMER/), "SUPPRIMER");
    await userEvent.click(screen.getByRole("button", { name: "Exécuter" }));
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1));
    expect(sendMock).toHaveBeenCalledWith("DELETE", "/api/collections/312");
    // LA assertion du contrat séquentiel : 311 n'est pas parti.
    expect(sendMock).not.toHaveBeenCalledWith("DELETE", "/api/collections/311");
    libere();
    await vi.waitFor(() => expect(goBack).toHaveBeenCalled());
    const deletes = sendMock.mock.calls.filter((c) => c[0] === "DELETE").map((c) => c[1]);
    expect(deletes).toEqual(["/api/collections/312", "/api/collections/311", "/api/collections/310"]);
    // Le cleanup GLOBAL n'est plus un chemin d'exécution.
    expect(sendMock).not.toHaveBeenCalledWith("POST", "/api/collections/cleanup", expect.anything());
  });

  // Audit du 2026-09-23 : `pending` ignorait la boucle des DELETE —
  // Exécuter et Retour restaient actifs sur un geste IRRÉVERSIBLE en vol.
  it("pendant la chaîne, Exécuter et Retour sont désactivés", async () => {
    let libere!: () => void;
    const premier = new Promise<void>((r) => { libere = r; });
    sendMock.mockImplementationOnce(() => premier.then(() => ({}))).mockResolvedValue({});
    renderReview(revue);
    await userEvent.type(screen.getByPlaceholderText(/SUPPRIMER/), "SUPPRIMER");
    const executer = screen.getByRole("button", { name: "Exécuter" });
    expect(executer).toBeEnabled(); // témoin : prêt avant le clic
    await userEvent.click(executer);
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1));
    expect(executer).toBeDisabled();
    expect(screen.getByRole("button", { name: "Retour" })).toBeDisabled();
    libere();
    await vi.waitFor(() => expect(goBack).toHaveBeenCalled());
  });

  it("un échec en cours de chaîne se dit inline, les suivants tentent quand même, pas de retour", async () => {
    // 312 (feuille) rejette : 311 et 310 tentent quand même — un id déjà
    // parti (404) ne doit pas bloquer le reste de la chaîne. Le premier
    // échec est celui qui se dit.
    sendMock.mockRejectedValueOnce(new Error("http 404")).mockResolvedValue({}).mockResolvedValue({});
    renderReview(revue);
    await userEvent.type(screen.getByPlaceholderText(/SUPPRIMER/), "SUPPRIMER");
    await userEvent.click(screen.getByRole("button", { name: "Exécuter" }));
    await vi.waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(goBack).not.toHaveBeenCalled();
    const deletes = sendMock.mock.calls.filter((c) => c[0] === "DELETE").map((c) => c[1]);
    expect(deletes).toEqual(["/api/collections/312", "/api/collections/311", "/api/collections/310"]);
  });
});
