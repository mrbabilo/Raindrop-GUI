import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ReviewPage } from "./ReviewPage";
import type { View } from "../state/appState";

// api mocké : les mutations passent par api.send — les assertions portent
// les corps exacts (vi.hoisted : la factory est hisée au-dessus des imports,
// même piège TDZ que BulkBar.test).
const sendMock = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("../lib/api", () => ({ api: { send: sendMock } }));

type ReviewView = Extract<View, { kind: "review" }>;

const items = [
  { id: 1, url: "https://a.example", title: "Alpha", collectionId: 0 },
  { id: 2, url: "https://b.example", title: "Beta", collectionId: 0 },
  { id: 3, url: "https://c.example", title: "Gamma", collectionId: 0 },
];
const goBack = vi.fn();
const review: ReviewView = { kind: "review", items, action: { op: "trash" }, sourceLabel: "sélection" };

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);
const renderReview = (r: ReviewView = review) => render(<ReviewPage review={r} goBack={goBack} />, { wrapper });

beforeEach(() => {
  sendMock.mockClear();
  goBack.mockClear();
});

describe("ReviewPage — niveau 1 (corbeille)", () => {
  it("compteur exact + désélection item par item met le compteur à jour", async () => {
    renderReview();
    expect(screen.getByText(/3 item\(s\) affecté\(s\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: /Beta/ }));
    expect(screen.getByText(/2 item\(s\) affecté\(s\)/)).toBeInTheDocument();
  });

  it("la recherche filtre l'aperçu localement", async () => {
    renderReview();
    await userEvent.type(screen.getByPlaceholderText(/Filtrer dans l'aperçu/), "Gam");
    expect(screen.getByText("Gamma")).toBeInTheDocument();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });

  it("le bouton est inactif avant la case de confirmation (niveau 1)", async () => {
    renderReview();
    expect(screen.getByRole("button", { name: "Exécuter" })).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: /Je confirme l'action sur 3/ }));
    expect(screen.getByRole("button", { name: "Exécuter" })).toBeEnabled();
  });

  it("exécute bulk delete sur les items restants puis revient", async () => {
    renderReview();
    await userEvent.click(screen.getByRole("checkbox", { name: /Je confirme l'action sur 3/ }));
    await userEvent.click(screen.getByRole("button", { name: "Exécuter" }));
    await vi.waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith("POST", "/api/raindrops/bulk", {
        operation: "delete",
        collection_id: 0,
        ids: [1, 2, 3],
      }),
    );
    expect(goBack).toHaveBeenCalled();
  });

  it("exporte la sélection courante en CSV", async () => {
    // jsdom n'implémente ni createObjectURL ni revokeObjectURL : stubs posés
    // à la main (vi.spyOn exige une propriété existante). Le contrat précis
    // du CSV (BOM, a[download], revoke) est prouvé dans csv.test.ts.
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:test" });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
    const click = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click);
    renderReview();
    await userEvent.click(screen.getByRole("button", { name: /Exporter en CSV/ }));
    expect(click).toHaveBeenCalled();
  });
});

describe("ReviewPage — niveau 2 (vider la corbeille)", () => {
  const reviewL2: ReviewView = {
    kind: "review",
    items: items.map((i) => ({ ...i })),
    action: { op: "empty-trash" },
    sourceLabel: "corbeille",
  };

  it("exige la frappe exacte de SUPPRIMER", async () => {
    renderReview(reviewL2);
    const input = screen.getByPlaceholderText(/SUPPRIMER/);
    expect(screen.getByRole("button", { name: "Exécuter" })).toBeDisabled();
    await userEvent.type(input, "supprimer");
    expect(screen.getByRole("button", { name: "Exécuter" })).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, "SUPPRIMER");
    expect(screen.getByRole("button", { name: "Exécuter" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Exécuter" }));
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalledWith("POST", "/api/maintenance/empty-trash", { confirm: true }));
  });

  // R15P-1 : les jetons `app-danger` du snippet n'existent pas dans
  // styles.css — l'input du niveau 2 est en border-app-broken (§6 : le rouge
  // est un diagnostic, pas une teinte d'action ; la frappe SUPPRIMER est la
  // garde) et le bouton Exécuter prend la surface sel. Même garde-fou que
  // BulkBar.test (R9P-2), avec preuve de non-vacuité du scan.
  it("aucun jeton fantôme : garde app-broken, action engageante app-sel (R15P-1)", () => {
    const { container } = renderReview(reviewL2);
    expect(container.querySelector("[class*='app-danger']")).toBeNull();
    expect(screen.getByPlaceholderText(/SUPPRIMER/)).toHaveClass("border-app-broken");
    expect(screen.getByRole("button", { name: "Exécuter" })).toHaveClass("bg-app-sel");
  });
});

describe("ReviewPage — rulings", () => {
  it("la Revue move exécute bulk move avec la destination embarquée (R15P-4)", async () => {
    renderReview({ ...review, action: { op: "move", toCollectionId: 102 } });
    await userEvent.click(screen.getByRole("checkbox", { name: /Je confirme l'action sur 3/ }));
    await userEvent.click(screen.getByRole("button", { name: "Exécuter" }));
    await vi.waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith("POST", "/api/raindrops/bulk", {
        operation: "move",
        collection_id: 0,
        ids: [1, 2, 3],
        to_collection_id: 102,
      }),
    );
  });

  it("la Revue tag exécute bulk update avec les tags embarqués", async () => {
    renderReview({ ...review, action: { op: "tag", tags: ["lutin", "elfe"] } });
    await userEvent.click(screen.getByRole("checkbox", { name: /Je confirme l'action sur 3/ }));
    await userEvent.click(screen.getByRole("button", { name: "Exécuter" }));
    await vi.waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith("POST", "/api/raindrops/bulk", {
        operation: "update",
        collection_id: 0,
        ids: [1, 2, 3],
        tags: ["lutin", "elfe"],
      }),
    );
  });

  // R8P-1 (extension) : execute() sans catch laissait un échec silencieux —
  // l'erreur reste inline (role="alert"), la Revue reste affichée.
  it("échec d'action : erreur inline role=alert, pas de retour (R8P-1)", async () => {
    sendMock.mockRejectedValueOnce(new Error("réseau"));
    renderReview();
    await userEvent.click(screen.getByRole("checkbox", { name: /Je confirme l'action sur 3/ }));
    await userEvent.click(screen.getByRole("button", { name: "Exécuter" }));
    await vi.waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Erreur : réseau"));
    expect(goBack).not.toHaveBeenCalled();
  });
});
