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
const { resultsMock, groupsMock, raindropsMock, collectionsMock, getMock, sendMock, statutMock, scanMock } = vi.hoisted(() => ({
  resultsMock: vi.fn(),
  groupsMock: vi.fn(),
  raindropsMock: vi.fn(),
  collectionsMock: vi.fn(),
  getMock: vi.fn(),
  sendMock: vi.fn(),
  statutMock: vi.fn(() => ({
    data: {
      links: { lastScan: "2026-09-19T08:00:00.000Z", running: false },
      duplicates: { lastScan: "2026-09-19T08:00:00.000Z", running: false },
    },
  })),
  scanMock: vi.fn(),
}));

vi.mock("../lib/api", () => ({ api: { get: getMock, send: sendMock } }));
vi.mock("../hooks/useAnalysis", () => ({
  useAnalysisResults: resultsMock,
  useDuplicateGroups: groupsMock,
  // La vue sait désormais si une analyse a jamais tourné, et porte l'action
  // qui corrige le manque. Défaut : « déjà analysé », pour que les tests
  // existants lisent des listes et non l'invite au premier scan.
  useAnalysisStatus: statutMock,
  useStartScan: () => ({ mutate: scanMock }),
}));
vi.mock("../hooks/useRaindrops", () => ({ useRaindrops: raindropsMock }));
vi.mock("../hooks/useStaticData", () => ({
  useCollections: collectionsMock,
  useTags: () => ({ data: [] }),
}));

// Espion de navigation : le contrat des actions niveau 2 (vider, supprimer
// les vides) est un `go({kind:"review", …})` — la Revue (T15) exécutera.
// `selection` : la fiche ouverte (selectRaindrop), lisible depuis les tests
// de ligne (la vue NonTaggues ouvre la fiche, les autres non).
const Spy = () => {
  const { view, selectedRaindropId } = useAppState();
  return (
    <>
      <span data-testid="view">{JSON.stringify(view)}</span>
      <span data-testid="selection">{selectedRaindropId ?? ""}</span>
    </>
  );
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AppStateProvider>
      <Spy />
      {children}
    </AppStateProvider>
  </QueryClientProvider>
);

beforeEach(() => {
  getMock.mockReset().mockResolvedValue({ items: [], count: 0 });
  sendMock.mockReset().mockResolvedValue({});
  resultsMock.mockReset().mockReturnValue({ data: { items: [], total: 0, page: 0, perPage: 50 } });
  groupsMock.mockReset().mockReturnValue({ data: { exact: [], normalized: [], fuzzy: [] } });
  raindropsMock.mockReset().mockReturnValue({ data: undefined });
  collectionsMock.mockReset().mockReturnValue({ data: [] });
});

describe("CleanupView", () => {
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

  // Garde de la spec inversion §2 : l'inversion ne touche que la bibliothèque.
  // Le clic d'une ligne de Nettoyage ouvre la FICHE et laisse la vue — le
  // branchement de useOuvrirSignet sur ces lignes serait un défaut. (Adapté
  // au harnais : pages[] pour useRaindrops, et la vue se lit AVANT le clic —
  // le provider démarre sur « list », la garde porte sur l'ABSENCE de
  // navigation au clic, pas sur la vue cleanupView elle-même.)
  it("clic sur une ligne : la fiche s'ouvre, la vue reste — jamais la lecture", async () => {
    raindropsMock.mockReturnValue({
      data: { pages: [{ items: [raindrop({ id: 1000, collectionId: -99 })], count: 1, page: 0, perPage: 50 }] },
    });
    render(<CleanupView type="trash" />, { wrapper });
    const titre = await screen.findByText("Article exemple");
    const vueAvant = screen.getByTestId("view").textContent;
    await userEvent.click(titre);
    expect(screen.getByTestId("selection").textContent).toBe("1000");
    // Aucun go() au clic : la vue ne change pas d'un octet — un branchement
    // lecture ferait go({kind:"lecture", …}) et se lirait ici.
    expect(screen.getByTestId("view").textContent).toBe(vueAvant);
    expect(screen.queryByRole("button", { name: "Fermer la lecture" })).not.toBeInTheDocument();
  });

  // La garde au second type DE LISTE RAINDROPS : Non-taggés (les types
  // liens morts/redirections rendent depuis les résultats de scan, pas
  // depuis la liste — leur clic vit dans un autre composant). Même
  // contrat attendu : fiche, vue stable, jamais la lecture.
  it("clic sur une ligne de Non-taggés : fiche, vue stable — jamais la lecture", async () => {
    raindropsMock.mockReturnValue({
      data: { pages: [{ items: [raindrop({ id: 1000 })], count: 1, page: 0, perPage: 50 }] },
    });
    render(<CleanupView type="untagged" />, { wrapper });
    const titre = await screen.findByText("Article exemple");
    const vueAvant = screen.getByTestId("view").textContent;
    await userEvent.click(titre);
    expect(screen.getByTestId("selection").textContent).toBe("1000");
    expect(screen.getByTestId("view").textContent).toBe(vueAvant);
    expect(screen.queryByRole("button", { name: "Fermer la lecture" })).not.toBeInTheDocument();
  });

  // DOMAINE.md : supprimer des collections est IRRÉVERSIBLE (niveau 2 —
  // frappe SUPPRIMER). Le clic passait le DELETE en direct, sans aucun
  // garde : il part en Revue, qui porte la frappe.
  it("collections vides : la suppression INDIVIDUELLE part en Revue niveau 2 (op delete-collections)", async () => {
    collectionsMock.mockReturnValue({
      data: [{ id: 301, title: "Vide", parentId: null, count: 0, public: false, view: "list", cover: null, color: null }],
    });
    render(<CleanupView type="empty-collections" />, { wrapper });
    await userEvent.click(await screen.findByRole("button", { name: "Supprimer la collection" }));
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({
      kind: "review",
      action: { op: "delete-collections", ids: [301] },
      totalServer: 1,
      returnView: { kind: "cleanupView", type: "empty-collections" },
    });
    // Aucune écriture directe : rien n'a été envoyé au sidecar.
    expect(sendMock).not.toHaveBeenCalled();
  });

  // Une collection « vide » peut être un PARENT (d'enfants eux-mêmes vides) :
  // son DELETE à lui seul laisserait Raindrop emporter ou déraciner les
  // enfants. La ligne emporte la CHAÎNE, déjà ordonnée feuilles d'abord, et
  // la Revue annonce les ids réels — pas 1.
  it("collections vides : la suppression d'un parent emporte sa chaîne, feuilles d'abord", async () => {
    const vide = (id: number, parentId: number | null = null) => ({ id, title: `V${id}`, parentId, count: 0, public: false, view: "list", cover: null, color: null });
    collectionsMock.mockReturnValue({ data: [vide(301), vide(302, 301), vide(303, 302)] });
    render(<CleanupView type="empty-collections" />, { wrapper });
    // La chaîne de 301 (V301) : deux boutons « Supprimer la collection »
    // existent aussi pour V302/V303 — viser la ligne dont le titre est V301.
    const ligne = screen.getByText("V301").closest('[role="row"]')!;
    await userEvent.click(ligne.querySelector("button")!);
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({
      kind: "review",
      action: { op: "delete-collections", ids: [303, 302, 301] },
      totalServer: 3,
    });
  });

  // L'action de masse porte ses ids DÉJÀ ORDONNÉS (triPourSuppression,
  // feuilles d'abord) : la Revue les exécute tels quels, et un parent ne
  // part jamais avant sa descendance.
  it("collections vides : « Supprimer les collections vides » va en Revue niveau 2, ids ordonnés des feuilles vers la racine", async () => {
    const vide = (id: number, parentId: number | null = null) => ({ id, title: `V${id}`, parentId, count: 0, public: false, view: "list", cover: null, color: null });
    collectionsMock.mockReturnValue({
      data: [
        vide(301), // racine vide isolée
        vide(310), vide(311, 310), vide(312, 311), // chaîne de trois, sans signets
        { id: 303, title: "Pleine", parentId: null, count: 4, public: false, view: "list", cover: null, color: null },
      ],
    });
    render(<CleanupView type="empty-collections" />, { wrapper });
    await userEvent.click(await screen.findByRole("button", { name: "Supprimer les collections vides" }));
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({
      kind: "review",
      action: { op: "delete-empty-collections", ids: [312, 311, 301, 310] },
      totalServer: 4, // les QUATRE vides — pas 0 (items de Revue vides pour cette action)
    });
  });

  // L'échec du chargement laissait un « Chargement… » ÉTERNEL (chargement =
  // data undefined, qui reste vrai en erreur) — l'erreur doit se dire, avec
  // le bouton qui corrige (même contrat que les autres vues).
  it("collections vides : un échec du chargement se dit, avec Réessayer", async () => {
    collectionsMock.mockReturnValue({ data: undefined, isError: true, error: new Error("http 500") });
    render(<CleanupView type="empty-collections" />, { wrapper });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
  });

  // Définition tranchée (2026-09-20) : une chaîne SANS AUCUN signet est vide
  // ENTIÈRE — le `count` de Raindrop ne voit que les signets directs, mais le
  // verdict est récursif. Le compteur et la liste le disent tous les deux.
  it("collections vides : une chaîne parent-enfant sans AUCUN signet est vide entière", () => {
    const c = (id: number, titre: string, parentId: number | null) => ({ id, title: titre, parentId, count: 0, public: false, view: "list", cover: null, color: null });
    collectionsMock.mockReturnValue({ data: [c(301, "Parent", null), c(302, "Enfant", 301)] });
    render(<CleanupView type="empty-collections" />, { wrapper });
    expect(screen.getByText("(2)")).toBeInTheDocument();
    expect(screen.getByText("Parent")).toBeInTheDocument();
    expect(screen.getByText("Enfant")).toBeInTheDocument();
  });
});

// Les non-taggés deviennent étiquetables depuis la vue (Revue op tag).
describe("non-taggés — étiqueter en masse", () => {
  const items = () => ({
    data: { pages: [{ items: [
      { id: 3000, url: "https://n.example/a", title: "Signet nu", domain: "n.example", collectionId: 5 },
    ], count: 1, page: 0, perPage: 50 }] },
  });

  it("cases + étiquettes → Revue op tag", async () => {
    raindropsMock.mockReturnValue(items());
    render(<CleanupView type="untagged" />, { wrapper });
    await screen.findByText("Signet nu");
    await userEvent.type(screen.getByLabelText("Étiquettes à ajouter"), "a-lire");
    // La case sélectionne SANS ouvrir la fiche — la ligne, elle, ouvre.
    await userEvent.click(screen.getByRole("checkbox", { name: "Sélectionner Signet nu" }));
    await userEvent.click(screen.getByRole("button", { name: "Étiqueter (1)" }));
    const vue = JSON.parse(screen.getByTestId("view").textContent ?? "{}") as {
      action: { op: string; tags: string[] };
      items: { id: number }[];
    };
    expect(vue.action).toEqual({ op: "tag", tags: ["a-lire"] });
    expect(vue.items.map((i) => i.id)).toEqual([3000]);
  });

  // Même grief que le lot a11y : la vue était hors du patron « ligne
  // activable » — un arrêt de tabulation PAR case, et la fiche inatteignable
  // au clavier. La LIGNE est l'arrêt ; Enter/F2 ouvrent ses contrôles.
  it("la ligne est l'arrêt, ses contrôles s'ouvrent à Enter et se referment à Échap", async () => {
    raindropsMock.mockReturnValue(items());
    render(<CleanupView type="untagged" />, { wrapper });
    const ligne = screen.getByRole("row");
    const coche = screen.getByRole("checkbox", { name: "Sélectionner Signet nu" });
    // Au repos : la ligne est l'unique arrêt, la case est hors Tab.
    expect(ligne.getAttribute("tabindex")).toBe("0");
    expect(coche.getAttribute("tabindex")).toBe("-1");
    ligne.focus();
    await userEvent.keyboard("{Enter}");
    expect(coche).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(ligne).toHaveFocus();
  });

  it("la fiche s'ouvre au clic de la ligne — et au clavier, le titre en est le bouton", async () => {
    // DEUX items : l'assert final doit distinguer — la fiche du second
    // ouverte au clavier après celle du premier à la souris, sinon le test
    // célèbre un état déjà atteint.
    const item = (id: number, titre: string) => ({ id, url: `https://n.example/${id}`, title: titre, domain: "n.example", collectionId: 5 });
    raindropsMock.mockReturnValue({
      data: { pages: [{ items: [item(3000, "Signet nu"), item(3100, "Autre sans étiquette")], count: 2, page: 0, perPage: 50 }] },
    });
    render(<CleanupView type="untagged" />, { wrapper });
    const lignes = screen.getAllByRole("row");
    // Souris : le clic de la LIGNE ouvre la fiche (comportement existant).
    await userEvent.click(lignes[0]!);
    expect(screen.getByTestId("selection").textContent).toBe("3000");
    // Clavier sur la seconde ligne : Enter ouvre la ligne, Tab atteint le
    // titre-bouton, Entrée ouvre CETTE fiche.
    lignes[1]!.focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Autre sans étiquette" }).getAttribute("tabindex")).toBe("0");
    await userEvent.keyboard("{Tab}");
    expect(screen.getByRole("button", { name: "Autre sans étiquette" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByTestId("selection").textContent).toBe("3100");
  });

  it("les non-taggés ont leur corbeille — même contrat Revue que la liste", async () => {
    raindropsMock.mockReturnValue(items());
    render(<CleanupView type="untagged" />, { wrapper });
    await screen.findByText("Signet nu");
    await userEvent.click(screen.getByRole("checkbox", { name: "Sélectionner Signet nu" }));
    await userEvent.click(screen.getByRole("button", { name: "Mettre à la corbeille (1)" }));
    const vue = JSON.parse(screen.getByTestId("view").textContent ?? "{}") as {
      action: { op: string };
      items: { id: number; collectionId: number }[];
    };
    expect(vue.action).toEqual({ op: "trash" });
    expect(vue.items[0]).toMatchObject({ id: 3000, collectionId: 5 });
  });
});
