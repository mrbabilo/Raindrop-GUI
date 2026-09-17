import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
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
  { id: 1, url: "https://a.example", title: "Alpha", collectionId: 101 },
  { id: 2, url: "https://b.example", title: "Beta", collectionId: 102 },
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

// jsdom ne fait pas de layout : offsetHeight vaut 0 et le virtualizer en
// déduit une plage vide (virtual-core : outerSize === 0 → getVirtualItems
// []) — même shim que ListPane.test : une fenêtre de défilement simulée de
// 600 px pour tout le fichier. Lignes FIXES 36 px (§8, sans measureElement) :
// ~16 items par fenêtre, les aperçus courts (3 items) s'y rendent entiers.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 600 });
});
afterAll(() => {
  delete (HTMLElement.prototype as unknown as { offsetHeight?: unknown }).offsetHeight;
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

  // Revue finale (changement de contrat assumé) : le bulk delete emporte les
  // ORIGINES de restauration (§4.2) — collectionId de chaque item — sinon le
  // sidecar mémoriserait « Tous » et la restauration partirait en silence au
  // mauvais endroit. L'ancien pin du corps exact est mis à jour d'autant.
  it("exécute bulk delete sur les items restants, avec leurs origines, puis revient", async () => {
    renderReview();
    await userEvent.click(screen.getByRole("checkbox", { name: /Je confirme l'action sur 3/ }));
    await userEvent.click(screen.getByRole("button", { name: "Exécuter" }));
    await vi.waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith("POST", "/api/raindrops/bulk", {
        operation: "delete",
        collection_id: 0,
        ids: [1, 2, 3],
        origins: [
          { id: 1, from: 101 },
          { id: 2, from: 102 },
          { id: 3, from: 0 },
        ],
      }),
    );
    expect(goBack).toHaveBeenCalled();
  });

  it("la désélection retire aussi l'origine de l'item écarté", async () => {
    renderReview();
    await userEvent.click(screen.getByRole("checkbox", { name: /Beta/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Je confirme l'action sur 2/ }));
    await userEvent.click(screen.getByRole("button", { name: "Exécuter" }));
    await vi.waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith("POST", "/api/raindrops/bulk", {
        operation: "delete",
        collection_id: 0,
        ids: [1, 3],
        origins: [
          { id: 1, from: 101 },
          { id: 3, from: 0 },
        ],
      }),
    );
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

  // Revue finale : sur les deux actions L2, l'aperçu chargé NE VAUT PAS la
  // portée réelle (empty-trash vide TOUTE la corbeille, delete-empty-
  // collections supprime tout) — le compteur porte le total serveur.
  it("le compteur porte le total serveur quand la vue l'a fourni (L2)", () => {
    renderReview({ ...reviewL2, totalServer: 5000 });
    expect(screen.getByText(/5000 item\(s\) affecté\(s\)/)).toBeInTheDocument();
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

  // Revue finale : le bouton se désactive PENDANT le vol — un double-clic ne
  // doit pas émettre deux bulk (empty-trash est la seule écriture définitive
  // de l'app : le vidage de corbeille, spec §3).
  it("un double-clic pendant le vol n'émet qu'un seul appel", async () => {
    let libere!: () => void;
    sendMock.mockImplementation(() => new Promise((resolve) => { libere = () => resolve({}); }));
    renderReview();
    await userEvent.click(screen.getByRole("checkbox", { name: /Je confirme l'action sur 3/ }));
    const bouton = screen.getByRole("button", { name: "Exécuter" });
    await userEvent.click(bouton);
    await userEvent.click(bouton); // second clic pendant que la requête vole
    expect(sendMock).toHaveBeenCalledTimes(1);
    libere();
    await vi.waitFor(() => expect(goBack).toHaveBeenCalled());
  });

  // §4.3 : « Liste complète scrollable (virtualisée) » — le mot s'était perdu
  // (revue finale) : la Revue peut porter des milliers d'items (empty-trash
  // sur 5 000), le map intégral les monterait tous. Même shim que
  // ListPane.test : jsdom ne fait pas de layout, le virtualizer lit
  // offsetHeight (virtual-core) — 600 px simulés.
  describe("virtualisation (§4.3)", () => {
    const many: ReviewView = {
      kind: "review",
      items: Array.from({ length: 300 }, (_, k) => ({
        id: k + 1,
        url: `https://x${k + 1}.example`,
        title: `Item ${k + 1}`,
        collectionId: 0,
      })),
      action: { op: "trash" },
      sourceLabel: "sélection",
    };

    it("la liste est virtualisée : conteneur dimensionné, seuls les items de la fenêtre se rendent", () => {
      const { container } = renderReview(many);
      // Le conteneur virtuel dimensionne le contenu TOTAL (300 × 36 px, §8).
      const liste = screen.getByTestId("review-virtual");
      expect(liste).toHaveStyle({ height: "10800px" });
      // La fenêtre (600 px simulés + overscan) ne monte PAS les 300 lignes.
      const lignes = container.querySelectorAll('[data-testid="review-virtual"] label');
      expect(lignes.length).toBeGreaterThan(0);
      expect(lignes.length).toBeLessThan(300);
      expect(screen.getByText("Item 1")).toBeInTheDocument();
      expect(screen.queryByText("Item 300")).not.toBeInTheDocument();
    });

    it("le filtre réduit la fenêtre virtualisée (un item hors fenêtre devient visible)", async () => {
      renderReview(many);
      expect(screen.queryByText("Item 299")).not.toBeInTheDocument(); // hors fenêtre
      await userEvent.type(screen.getByPlaceholderText(/Filtrer dans l'aperçu/), "Item 299");
      // Le count du virtualizer suit le filtre : l'item 299 est dans la
      // fenêtre (1 item filtré) et se rend.
      expect(screen.getByText("Item 299")).toBeInTheDocument();
      expect(screen.queryByText("Item 1")).not.toBeInTheDocument();
    });
  });

  // La Revue peut porter des milliers d'items : autant d'arrêts de
  // tabulation avant d'atteindre le bouton d'exécution. La ligne est
  // l'arrêt, sa case n'en est plus un.
  it("une seule ligne tabulable, et l'espace y coche", async () => {
    renderReview();
    const lignes = [...document.querySelectorAll<HTMLElement>("[data-index]")];
    expect(lignes.length).toBeGreaterThan(1);
    expect(lignes.filter((l) => l.tabIndex === 0)).toHaveLength(1);
    expect([...document.querySelectorAll<HTMLElement>('[data-index] input')].filter((c) => c.tabIndex === 0)).toHaveLength(0);

    const compteur = () => screen.getByText(/item\(s\) affecté/).textContent;
    const avant = compteur();
    lignes[0]!.focus();
    await userEvent.keyboard(" ");
    expect(compteur()).not.toBe(avant);
  });
});
