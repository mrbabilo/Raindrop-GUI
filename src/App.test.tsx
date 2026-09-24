import { afterAll, beforeAll } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
// fixtures AVANT App (TDZ — même remarque que Sidebar.test.tsx) : mockApi
// les référence dans l'implémentation du mock.
import { raindrop, collections, tags } from "./test/fixtures";
import App from "./App";
import { AppStateProvider, useAppState } from "./state/appState";
import { DragProvider } from "./state/drag";
import type { View } from "./state/appState";

// App consomme useHealth() et — depuis que ListPane est monté (Task 7) —
// useRaindrops() : provider + mock du module api ROUTÉ PAR CHEMIN, chaque
// endpoint recevant la forme de son DTO (jamais de fetch réseau). Seule la
// réponse health est pilotée par test (mcp connecté/déconnecté). Le send est
// mocké pour les tests Revue (R15P-3 : execute() passe par useBulk).
const getMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
const chargerMock = vi.hoisted(() => vi.fn());

vi.mock("./lib/api", () => ({ api: { get: getMock, send: sendMock } }));

// La lecture : seul `chargerContenu` (le fetch du sidecar) est mocké —
// `extraireBlocs` reste RÉEL (pur, marche en jsdom).
vi.mock("./lib/lecture", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/lecture")>()),
  chargerContenu: chargerMock,
}));

function mockApi(mcp: string, archivesIds: number[] = []) {
  getMock.mockReset().mockImplementation((path: string) => {
    if (path === "/api/raindrops")
      return Promise.resolve({ items: [raindrop()], count: 1, page: 0, perPage: 50 });
    // Le détail d'un signet : sans lui, DetailPane recevait la réponse de
    // health et jetait sur `r.highlights.length` — l'arbre se démontait, et
    // l'absence du volet passait pour un défaut du composant.
    if (path.startsWith("/api/raindrops/")) return Promise.resolve(raindrop());
    // ActionsLecture (montée dans la fiche) sonde les jobs en vol et
    // l'inventaire des archives — sans ces branches, les deux tombaient
    // dans la réponse de health : `jobs.some` jetait et l'arbre entier se
    // démontait (troisième occurrence du piège « route absente du mock »).
    if (path === "/api/jobs") return Promise.resolve([]);
    if (path === "/api/backup/archives") return Promise.resolve({ ids: archivesIds, octets: archivesIds.length * 5 });
    if (path === "/api/collections") return Promise.resolve({ items: collections });
    if (path === "/api/tags") return Promise.resolve({ items: tags });
    // Vues sauvegardées (smart lists) : la Sidebar les rend — sans cette
    // branche, la section recevrait la réponse de health (piège documenté
    // « route absente du mock »).
    if (path === "/api/smartlists") return Promise.resolve({ items: [] });
    return Promise.resolve({ status: "ok", mcp });
  });
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {/* Le provider d'état est indispensable : sans lui, `useAppState` rend
          le contexte PAR DÉFAUT, dont `selectRaindrop` est un no-op — un
          clic sur un signet n'ouvrirait jamais le détail, et le test le
          prendrait pour un défaut du composant. `main.tsx` le pose de même. */}
      <AppStateProvider>
        {/* `DragProvider` aussi : la ligne tire ses handlers de
            `useDragBookmark`, qui consomme ce contexte. main.tsx pose les
            deux — un test qui n'en pose qu'un teste une autre application. */}
        <DragProvider>{children}</DragProvider>
      </AppStateProvider>
    </QueryClientProvider>
  );
}

// Reproduit le stub par défaut de src/test/setup.ts, mais avec
// prefers-color-scheme: dark — le cas "aucune préférence enregistrée,
// OS en sombre" (mode "system" stocké implicitement).
function matchMediaPrefersDark() {
  return ((query: string) => ({
    matches: query.includes("dark"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as never;
}

// jsdom ne fait aucun layout : offsetHeight vaut 0, et le virtualizer de la
// liste en déduit une plage vide — aucune ligne montée. Même fenêtre simulée
// que ListPane.test, pour que les tests qui OUVRENT un signet aient une ligne
// à cliquer.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 600 });
});
afterAll(() => {
  delete (HTMLElement.prototype as unknown as { offsetHeight?: unknown }).offsetHeight;
});

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    mockApi("connected");
    chargerMock.mockReset().mockResolvedValue({
      html: "<html><body><p>Lu.</p></body></html>",
      dateArchive: "2026-09-20T08:00:00.000Z",
    });
    sendMock.mockReset().mockResolvedValue({});
  });

  it("affiche le titre de l'app", () => {
    render(<App onEtat={vi.fn()} />, { wrapper });
    expect(screen.getByText("Raindrop GUI")).toBeInTheDocument();
  });

  // Le troisième panneau ne s'affiche QUE sur un signet ouvert : 320 px
  // occupés par « Sélectionnez un bookmark » coûtent le tiers de la largeur
  // utile pour ne rien dire.
  //
  // Le contrat testé ICI est « le volet suit la sélection ». Que le CLIC sur
  // une ligne pose cette sélection appartient à `useDragBookmark`, qui le
  // teste chez lui — d'où le pilote, plutôt qu'un clic à travers un
  // virtualiseur et un seuil de glissement.
  it("affiche la navigation et la liste ; le détail attend qu'on ouvre un signet", async () => {
    const Ouvre = () => {
      const { selectRaindrop } = useAppState();
      return (
        <button type="button" onClick={() => selectRaindrop(1000)}>
          ouvrir-signet
        </button>
      );
    };
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AppStateProvider>
          <Ouvre />
          <App onEtat={vi.fn()} />
        </AppStateProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();

    // Et il s'ouvre — sans quoi l'assertion d'absence ci-dessus célébrerait
    // un panneau qui ne sait pas apparaître.
    await userEvent.click(screen.getByText("ouvrir-signet"));
    expect(await screen.findByRole("complementary")).toBeInTheDocument();

    // Puis se referme, sans passer par un autre signet.
    await userEvent.click(screen.getByRole("button", { name: "Fermer le détail" }));
    await waitFor(() => expect(screen.queryByRole("complementary")).not.toBeInTheDocument());
  });

  // Le défaut d'origine : l'en-tête qui porte ce bouton était la cellule
  // ligne 1 / colonne 1 de la grille, donc de la largeur de la barre
  // latérale. La replier réduisait l'en-tête avec elle — le bouton
  // disparaissait, et il n'y avait plus aucun moyen de la rouvrir.
  it("repliée, la barre latérale disparaît ET peut être rouverte", async () => {
    render(<App onEtat={vi.fn()} />, { wrapper });
    expect(screen.getByRole("navigation")).toBeInTheDocument();

    const replier = screen.getByRole("button", { name: "Replier la barre latérale" });
    expect(replier).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(replier);

    // La navigation n'est pas seulement invisible : elle n'est plus rendue.
    // Une colonne à zéro laisserait ses liens atteignables au clavier.
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();

    // Et le geste inverse reste offert — c'est là que le défaut vivait.
    const deplier = screen.getByRole("button", { name: "Déplier la barre latérale" });
    expect(deplier).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(deplier);
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  // Les réglages et le thème sont à l'APPLICATION, pas au panneau de gauche :
  // replier celui-ci ne doit pas les emporter.
  it("replier la barre latérale n'emporte ni les réglages ni le thème", async () => {
    render(<App onEtat={vi.fn()} />, { wrapper });
    const avant = screen.getByRole("button", { name: "Réglages" });
    expect(avant).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Replier la barre latérale" }));
    expect(screen.getByRole("button", { name: "Réglages" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /thème/ })).toBeInTheDocument();
  });

  // Task 10 : ⌘E amène le focus dans le composer, quel que soit le champ
  // occupé — le data-testid="composer-input" est le contrat du focus (plan).
  it("⌘E met le focus dans le composer", () => {
    render(<App onEtat={vi.fn()} />, { wrapper });
    const input = document.querySelector<HTMLInputElement>('[data-testid="composer-input"]');
    expect(input).not.toBeNull();
    expect(document.activeElement).not.toBe(input);
    fireEvent.keyDown(window, { key: "e", metaKey: true });
    expect(document.activeElement).toBe(input);
  });

  // Task 11 : ⌘K ouvre la palette (montage conditionnel — état frais à
  // chaque ouverture), Échap la referme. Même discipline que ⌘E :
  // événements réels sur window, pas de simulation du handler. L'input se
  // cherche par son placeholder : le <select> de tri de la TopBar porte lui
  // aussi le rôle ARIA implicite « combobox ».
  it("⌘K ouvre la palette, Échap la referme", () => {
    render(<App onEtat={vi.fn()} />, { wrapper });
    const input = () => screen.queryByPlaceholderText("Rechercher signets, collections, étiquettes, commandes…");
    expect(input()).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(input()).toBeInTheDocument();
    fireEvent.keyDown(input()!, { key: "Escape" });
    expect(input()).not.toBeInTheDocument();
  });

  it("bascule le thème sombre au clic sur le bouton de thème", async () => {
    const user = userEvent.setup();
    render(<App onEtat={vi.fn()} />, { wrapper });
    const toggle = screen.getByRole("button", { name: "Passer au thème sombre" });
    // Icône seule : carrée comme ses voisines (§9) — elle seule de l'en-tête
    // n'avait pas `btn-icone`, donc 10 px de padding de chaque côté.
    expect(toggle).toHaveClass("btn", "btn-icone");
    await user.click(toggle);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(
      screen.getByRole("button", { name: "Passer au thème clair" }),
    ).toBeInTheDocument();
  });

  it("annonce le thème clair dès le premier rendu quand le système préfère le sombre", () => {
    window.matchMedia = matchMediaPrefersDark();
    render(<App onEtat={vi.fn()} />, { wrapper });
    // L'app est déjà sombre (mode "system" + OS sombre) : le bouton doit
    // annoncer l'action inverse dès le premier rendu, pas seulement après
    // un clic — DESIGN.md §10, « un bouton nomme ce qui va se produire ».
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(
      screen.getByRole("button", { name: "Passer au thème clair" }),
    ).toBeInTheDocument();
  });

  it("signale l'interruption MCP quand health le rapporte", async () => {
    // « crashed » : un état RÉEL de LifecycleState, sans ambiguïté dès la
    // première réponse (l'ancien fixture « disconnected » n'existe pas dans
    // le vocabulaire du sidecar, et la règle Task 11 — bannière muette tant
    // qu'on n'a pas vu connected, sauf crashed — le laissait à juste titre
    // se taire).
    mockApi("crashed");
    render(<App onEtat={vi.fn()} />, { wrapper });
    await waitFor(() =>
      expect(screen.getByText("Connexion Raindrop interrompue")).toBeInTheDocument(),
    );
  });

  it("n'affiche pas d'alerte quand MCP est connecté", () => {
    render(<App onEtat={vi.fn()} />, { wrapper });
    expect(screen.queryByText("Connexion Raindrop interrompue")).not.toBeInTheDocument();
  });

  // R15P-3 : App construit goBack depuis la returnView portée par la vue
  // review — après exécution, retour à la vue d'origine (posée par les
  // constructeurs BulkBar/CleanupView) ; sans origine notée, repli « Tous ».
  const Spy = () => {
    const { view } = useAppState();
    return <span data-testid="view">{JSON.stringify(view)}</span>;
  };
  const OuvreRevue = ({ returnView }: { returnView?: View }) => {
    const { go } = useAppState();
    return (
      <button
        type="button"
        onClick={() =>
          go({
            kind: "review",
            items: [{ id: 1, url: "https://a.example", title: "Alpha", collectionId: 0 }],
            action: { op: "trash" },
            sourceLabel: "sélection",
            ...(returnView ? { returnView } : {}),
          })
        }
      >
        ouvrir-revue
      </button>
    );
  };
  const renderAppAvecDriver = (returnView?: View) =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AppStateProvider>
          <OuvreRevue returnView={returnView} />
          <Spy />
          <App onEtat={vi.fn()} />
        </AppStateProvider>
      </QueryClientProvider>,
    );
  const executeRevue = async () => {
    await userEvent.click(screen.getByText("ouvrir-revue"));
    await userEvent.click(screen.getByRole("checkbox", { name: /Je confirme l'action sur 1/ }));
    await userEvent.click(screen.getByRole("button", { name: "Exécuter" }));
  };

  it("revue : après exécution, retour à la vue d'origine (R15P-3)", async () => {
    renderAppAvecDriver({ kind: "cleanupView", type: "trash" });
    await executeRevue();
    await waitFor(() =>
      // Revue finale : le bulk delete emporte l'origine de l'item (§4.2).
      expect(sendMock).toHaveBeenCalledWith("POST", "/api/raindrops/bulk", {
        operation: "delete",
        collection_id: 0,
        ids: [1],
        origins: [{ id: 1, from: 0 }],
      }),
    );
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toEqual({ kind: "cleanupView", type: "trash" });
  });

  it("revue sans origine notée : repli sur « Tous » (R15P-3)", async () => {
    renderAppAvecDriver();
    await executeRevue();
    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId("view").textContent!)).toEqual({
        kind: "list",
        collectionId: 0,
        label: "Tous",
      }),
    );
  });

  // Spec inversion §3/§4 : le clic ouvre la LECTURE et la fiche l'accompagne.
  // Le clic passe par la VRAIE ligne (poignee → useDragBookmark → le futur
  // useOuvrirSignet) — un pilote selectRaindrop court-circuiterait la décision.
  it("clic sur une ligne archivée : lecture ouverte ET fiche toujours là", async () => {
    mockApi("connected", [1000]); // l'archive locale existe → le clic lit
    render(<App onEtat={vi.fn()} />, { wrapper });
    await userEvent.click(await screen.findByTestId("row-1000"));
    // La lecture est ouverte…
    expect(await screen.findByRole("button", { name: "Fermer la lecture" })).toBeInTheDocument();
    // …et la fiche l'accompagne (App ne l'exclut plus pendant la lecture).
    expect(screen.getByRole("button", { name: "Fermer le détail" })).toBeInTheDocument();
  });

  // Le retour de lecture (revue finale : l'aller ne prouve rien sans le
  // retour) — fermer la lecture rend la vue d'origine, la fiche est encore
  // là, et « Lire » est revenu : `dejaLue` ne survit pas à la fermeture.
  it("fermer la lecture : vue d'origine, fiche encore là, « Lire » revenu", async () => {
    mockApi("connected", [1000]);
    render(<App onEtat={vi.fn()} />, { wrapper });
    await userEvent.click(await screen.findByTestId("row-1000"));
    await screen.findByRole("button", { name: "Fermer la lecture" });
    await userEvent.click(screen.getByRole("button", { name: "Fermer la lecture" }));
    // La vue d'origine (la liste) est rendue…
    expect(screen.getByTestId("row-1000")).toBeInTheDocument();
    // …la fiche accompagne toujours…
    expect(screen.getByRole("button", { name: "Fermer le détail" })).toBeInTheDocument();
    // …et « Lire » est revenu.
    expect(screen.getByRole("button", { name: "Lire" })).toBeInTheDocument();
  });

  // La garde du périmètre : non lisible → clic = fiche, la vue reste. Avant le
  // lot c'était le SEUL comportement du clic ; il doit survivre à l'inversion.
  it("clic sur une ligne non lisible : fiche seule, la liste reste", async () => {
    render(<App onEtat={vi.fn()} />, { wrapper }); // archives [] par défaut
    await userEvent.click(await screen.findByTestId("row-1000"));
    expect(await screen.findByRole("button", { name: "Fermer le détail" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fermer la lecture" })).not.toBeInTheDocument();
    expect(screen.getByTestId("row-1000")).toBeInTheDocument();
  });

  // La course au chargement (revue Task 2, mineur a) : au clic, l'inventaire
  // d'archives peut ne pas être résolu — la décision l'ATTEND au lieu de
  // lire `undefined` comme « pas d'archive » (fiche au lieu de lecture).
  it("clic pendant le chargement de l'inventaire : la décision attend, la lecture s'ouvre", async () => {
    let liberer!: (v: unknown) => void;
    const enAttente = new Promise((resolve) => {
      liberer = resolve;
    });
    mockApi("connected", [1000]);
    // La branche archives seule devient la promesse différée ; le reste du
    // mock passe par l'implémentation d'origine.
    const anterieure = getMock.getMockImplementation()!;
    getMock.mockImplementation((path: string) =>
      path === "/api/backup/archives" ? enAttente : anterieure(path),
    );
    render(<App onEtat={vi.fn()} />, { wrapper });
    await userEvent.click(await screen.findByTestId("row-1000"));
    liberer({ ids: [1000], octets: 5 });
    expect(await screen.findByRole("button", { name: "Fermer la lecture" })).toBeInTheDocument();
  });
});
