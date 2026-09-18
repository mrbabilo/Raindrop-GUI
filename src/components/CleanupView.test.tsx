import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { CleanupView } from "./CleanupView";
import { AppStateProvider, useAppState } from "../state/appState";
import { raindrop, collections } from "../test/fixtures";

// Hooks et api mockés (pattern CleanupDashboard.test.tsx) : les mocks sont
// hisés (vi.hoisted) et rechargés par test via mockReturnValue — les branches
// de CleanupView lisent des hooks différents selon `type`.
const { resultsMock, groupsMock, raindropsMock, collectionsMock, getMock, sendMock } = vi.hoisted(() => ({
  resultsMock: vi.fn(),
  groupsMock: vi.fn(),
  raindropsMock: vi.fn(),
  collectionsMock: vi.fn(),
  getMock: vi.fn(),
  sendMock: vi.fn(),
}));

vi.mock("../lib/api", () => ({ api: { get: getMock, send: sendMock } }));
vi.mock("../hooks/useAnalysis", () => ({
  useAnalysisResults: resultsMock,
  useDuplicateGroups: groupsMock,
}));
vi.mock("../hooks/useRaindrops", () => ({ useRaindrops: raindropsMock }));
vi.mock("../hooks/useStaticData", () => ({
  useCollections: collectionsMock,
  useTags: () => ({ data: [] }),
}));

// Espion de navigation : le contrat des actions niveau 2 (vider, supprimer
// les vides) est un `go({kind:"review", …})` — la Revue (T15) exécutera.
const Spy = () => {
  const { view } = useAppState();
  return <span data-testid="view">{JSON.stringify(view)}</span>;
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AppStateProvider>
      <Spy />
      {children}
    </AppStateProvider>
  </QueryClientProvider>
);

// Page de résultats « links » au format LinksResultsPage (sidecar analysis.ts).
const redirectPage = {
  items: [
    {
      raindropId: 1000,
      url: "https://old.example/a",
      status: "redirect",
      redirectKind: "permanent",
      finalUrl: "https://new.example/a",
      httpStatus: 301,
      redirectChain: [],
      reason: null,
      checkedAt: "2026-09-16T00:00:00Z",
      title: "Page déplacée",
      collectionId: 101,
    },
  ],
  total: 1,
  page: 0,
  perPage: 50,
};

beforeEach(() => {
  getMock.mockReset().mockResolvedValue({ items: [], count: 0 });
  sendMock.mockReset().mockResolvedValue({});
  resultsMock.mockReset().mockReturnValue({ data: { items: [], total: 0, page: 0, perPage: 50 } });
  groupsMock.mockReset().mockReturnValue({ data: { exact: [], normalized: [], fuzzy: [] } });
  raindropsMock.mockReset().mockReturnValue({ data: undefined });
  collectionsMock.mockReset().mockReturnValue({ data: [] });
});

describe("CleanupView", () => {
  it("redirections : remplace par l'URL finale (PATCH)", async () => {
    resultsMock.mockReturnValue({ data: redirectPage });
    render(<CleanupView type="redirect" />, { wrapper });
    expect(await screen.findByText("Page déplacée")).toBeInTheDocument();
    expect(screen.getByText("https://old.example/a")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Remplacer par l'URL finale/ }));
    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith("PATCH", "/api/raindrops/1000", { url: "https://new.example/a" }),
    );
  });

  it("liens morts : chip d'entête comptée + piste Wayback Machine", async () => {
    resultsMock.mockReturnValue({
      data: {
        items: [
          {
            raindropId: 2000,
            url: "https://mort.example/page",
            status: "dead",
            redirectKind: null,
            finalUrl: null,
            httpStatus: null,
            redirectChain: null,
            reason: "http_404",
            checkedAt: "2026-09-16T00:00:00Z",
            title: "Page disparue",
            collectionId: 101,
          },
        ],
        total: 23,
        page: 0,
        perPage: 50,
      },
    });
    render(<CleanupView type="dead" />, { wrapper });
    expect(await screen.findByText("Liens morts")).toBeInTheDocument();
    expect(screen.getByText("(23)")).toBeInTheDocument();
    // buku §12 : la Wayback Machine est un simple <a> externe sur l'URL morte.
    expect(screen.getByRole("link", { name: "Chercher une copie archivée" })).toHaveAttribute(
      "href",
      "https://web.archive.org/web/*/https://mort.example/page",
    );
  });

  // L'archive vaut le plus sur un lien mort : la page n'existe plus, la copie
  // permanente est tout ce qui en reste (spec sélection §4.2).
  it("liens morts : cocher des lignes arme l'archivage, et la Revue le porte", async () => {
    const mort = (id: number, titre: string) => ({
      raindropId: id,
      url: `https://mort.example/${id}`,
      status: "dead",
      redirectKind: null,
      finalUrl: null,
      httpStatus: null,
      redirectChain: null,
      reason: "http_404",
      checkedAt: "2026-09-16T00:00:00Z",
      title: titre,
      collectionId: 101,
    });
    resultsMock.mockReturnValue({
      data: { items: [mort(2000, "Alpha"), mort(2001, "Beta")], total: 2, page: 0, perPage: 50 },
    });
    render(<CleanupView type="dead" />, { wrapper });

    // Sans sélection, le bouton est là mais mort : rien à archiver.
    const bouton = await screen.findByRole("button", { name: "Archiver la copie (0)" });
    expect(bouton).toBeDisabled();

    await userEvent.click(screen.getByRole("checkbox", { name: "Alpha" }));
    await userEvent.click(screen.getByRole("button", { name: "Archiver la copie (1)" }));

    const vue = JSON.parse(screen.getByTestId("view").textContent ?? "{}") as {
      kind: string;
      action: { op: string };
      items: { id: number; cache?: unknown }[];
    };
    expect(vue.kind).toBe("review");
    expect(vue.action).toEqual({ op: "archive" });
    expect(vue.items.map((i) => i.id)).toEqual([2000]);
    // L'analyse ne porte PAS l'état des copies : la Revue le dira plutôt que
    // de laisser croire qu'elle le sait.
    expect(vue.items[0]).not.toHaveProperty("cache");
  });

  // Les redirections se corrigent, elles ne s'archivent pas : la page vit
  // encore, c'est son URL qui a bougé.
  it("redirections : aucune sélection, aucun archivage", async () => {
    resultsMock.mockReturnValue({ data: redirectPage });
    render(<CleanupView type="redirect" />, { wrapper });
    await screen.findByText("Redirections");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Archiver/ })).not.toBeInTheDocument();
  });

  it("doublons : les trois catégories restent séparées et étiquetées", async () => {
    const item = (id: number, url: string) => ({ id, url, title: `Article ${id}`, collectionId: 101, created: "2025-01-01T12:00:00Z" });
    groupsMock.mockReturnValue({
      data: {
        exact: [{ key: "k1", kind: "exact", items: [item(1, "https://a.example/x"), item(2, "https://a.example/x")] }],
        normalized: [],
        fuzzy: [{ key: "k2", kind: "fuzzy", items: [item(3, "https://b.example/y"), item(4, "https://b.example/y")] }],
      },
    });
    render(<CleanupView type="duplicates" />, { wrapper });
    expect(await screen.findByText(/Doublons exacts/)).toBeInTheDocument();
    expect(screen.getByText(/Doublons flous/)).toBeInTheDocument();
    // catégorie normalisée vide : pas de section
    expect(screen.queryByText(/Doublons normalisés/)).not.toBeInTheDocument();
    // le chip compte les groupes (même sémantique que le dashboard T12)
    expect(screen.getByText("(2)")).toBeInTheDocument();
  });

  it("corbeille : restaure un item par POST /api/raindrops/unrestore", async () => {
    raindropsMock.mockReturnValue({
      data: {
        pages: [{ items: [raindrop({ id: 2001, url: "https://exemple.fr/vieille", title: "Vieille page", collectionId: -99 })], count: 1, page: 0, perPage: 50 }],
      },
    });
    render(<CleanupView type="trash" />, { wrapper });
    await userEvent.click(await screen.findByRole("button", { name: "Restaurer" }));
    await waitFor(() => expect(sendMock).toHaveBeenCalledWith("POST", "/api/raindrops/unrestore", { ids: [2001] }));
  });

  // §4.2 / plan Task 8 : un item mis à la corbeille HORS de l'app n'a pas
  // d'origine mémorisée — le sidecar le renvoie dans `unknown` SANS le
  // restaurer ; le front demande alors une destination et rappelle.
  it("corbeille : origine inconnue → sélecteur de destination, rappel avec toCollectionId (§4.2)", async () => {
    raindropsMock.mockReturnValue({
      data: {
        pages: [{ items: [raindrop({ id: 2001, collectionId: -99 })], count: 1, page: 0, perPage: 50 }],
      },
    });
    sendMock.mockImplementation(async (_m: string, p: string, body?: { ids?: number[]; toCollectionId?: number }) =>
      p === "/api/raindrops/unrestore" && !body?.toCollectionId
        ? { restored: 0, unknown: [2001] }
        : { restored: 1, unknown: [] },
    );
    collectionsMock.mockReturnValue({ data: collections });
    render(<CleanupView type="trash" />, { wrapper });
    await userEvent.click(await screen.findByRole("button", { name: "Restaurer" }));
    expect(await screen.findByText(/Origine inconnue/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Destination"), "102");
    await userEvent.click(screen.getByRole("button", { name: "Restaurer" }));
    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith("POST", "/api/raindrops/unrestore", { ids: [2001], toCollectionId: 102 }),
    );
    // restauré : la demande de destination se referme
    await waitFor(() => expect(screen.queryByText(/Origine inconnue/)).not.toBeInTheDocument());
  });

  it("corbeille : « Vider la corbeille » va en Revue niveau 2 (op empty-trash, total serveur porté)", async () => {
    raindropsMock.mockReturnValue({
      // 1 page chargée (aperçu) pour 60 items réels : la Revue doit connaître
      // le TOTAL SERVEUR, sinon son compteur dirait « 1 » avant de tout vider.
      data: { pages: [{ items: [raindrop({ id: 2001, collectionId: -99 })], count: 60, page: 0, perPage: 50 }] },
    });
    render(<CleanupView type="trash" />, { wrapper });
    await userEvent.click(await screen.findByRole("button", { name: "Vider la corbeille" }));
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({
      kind: "review",
      action: { op: "empty-trash" },
      totalServer: 60,
    });
  });

  it("collections vides : supprime une collection par DELETE /api/collections/:id", async () => {
    collectionsMock.mockReturnValue({
      data: [{ id: 301, title: "Vide", parentId: null, count: 0, public: false, view: "list", cover: null, color: null }],
    });
    render(<CleanupView type="empty-collections" />, { wrapper });
    await userEvent.click(await screen.findByRole("button", { name: "Supprimer la collection" }));
    await waitFor(() => expect(sendMock).toHaveBeenCalledWith("DELETE", "/api/collections/301"));
  });

  it("collections vides : « Supprimer les collections vides » va en Revue niveau 2 (total porté)", async () => {
    const vide = (id: number, titre: string) => ({ id, title: titre, parentId: null, count: 0, public: false, view: "list", cover: null, color: null });
    collectionsMock.mockReturnValue({ data: [vide(301, "Vide"), vide(302, "Vide aussi"), { id: 303, title: "Pleine", parentId: null, count: 4, public: false, view: "list", cover: null, color: null }] });
    render(<CleanupView type="empty-collections" />, { wrapper });
    await userEvent.click(await screen.findByRole("button", { name: "Supprimer les collections vides" }));
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({
      kind: "review",
      action: { op: "delete-empty-collections" },
      totalServer: 2, // les DEUX vides — pas 0 (items de Revue vides pour cette action)
    });
  });

  // Le grief du lot a11y : chaque ligne de traitement portait un arrêt de
  // tabulation PAR CONTRÔLE (Restaurer, select, liens). La LIGNE est
  // l'arrêt ; ses contrôles n'existent pour Tab qu'une fois la ligne
  // activée (Enter), et Échap rend la ligne.
  it("la ligne est l'arrêt, ses contrôles s'ouvrent à Enter et se referment à Échap", async () => {
    const user = userEvent.setup();
    resultsMock.mockReturnValue({ data: redirectPage });
    render(<CleanupView type="redirect" />, { wrapper });
    const ligne = screen.getByRole("row");
    const remplacer = screen.getByRole("button", { name: "Remplacer par l'URL finale" });
    // Au repos : la ligne est l'unique arrêt, le contrôle est hors Tab.
    expect(ligne.getAttribute("tabindex")).toBe("0");
    expect(remplacer.getAttribute("tabindex")).toBe("-1");

    ligne.focus();
    await user.keyboard("{Enter}");
    expect(remplacer).toHaveFocus();
    expect(remplacer.getAttribute("tabindex")).toBe("0");

    // Échap rend la ligne, les contrôles se referment.
    await user.keyboard("{Escape}");
    expect(ligne).toHaveFocus();
    expect(remplacer.getAttribute("tabindex")).toBe("-1");
  });

  // Sortir du focus (flèches vers une autre ligne, clic ailleurs) désarme
  // aussi : l'état activé ne survit pas à la ligne.
  it("quitter la ligne désarme ses contrôles", async () => {
    const user = userEvent.setup();
    resultsMock.mockReturnValue({ data: redirectPage });
    render(<CleanupView type="redirect" />, { wrapper });
    const ligne = screen.getByRole("row");
    const remplacer = screen.getByRole("button", { name: "Remplacer par l'URL finale" });
    ligne.focus();
    await user.keyboard("{Enter}");
    expect(remplacer.getAttribute("tabindex")).toBe("0");
    await user.click(screen.getByRole("heading", { name: /Redirections/i }));
    expect(remplacer.getAttribute("tabindex")).toBe("-1");
  });
});
