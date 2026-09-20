import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Doublons } from "./ResultatsDoublons";
import { AppStateProvider, useAppState } from "../state/appState";

// Hooks mockés (pattern CleanupView.test.tsx) — le minimum pour la vue
// Doublons : les groupes, l'arbre des collections, et l'api (jamais appelée
// par cette vue, mockée par garde).
const { groupsMock, collectionsMock, getMock, sendMock } = vi.hoisted(() => ({
  groupsMock: vi.fn(),
  collectionsMock: vi.fn(),
  getMock: vi.fn(),
  sendMock: vi.fn(),
}));

vi.mock("../lib/api", () => ({ api: { get: getMock, send: sendMock } }));
vi.mock("../hooks/useAnalysis", () => ({
  useAnalysisStatus: () => ({ data: undefined }),
  useDuplicateGroups: groupsMock,
  useStartScan: () => ({ mutate: vi.fn() }),
}));
vi.mock("../hooks/useStaticData", () => ({
  useCollections: collectionsMock,
  useTags: () => ({ data: [] }),
}));

// Espion de navigation : le contrat des actions de doublons est un
// `go({kind:"review", action:{op:"dedupe"}, …})` — la Revue exécutera.
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

beforeEach(() => {
  getMock.mockReset().mockResolvedValue({});
  sendMock.mockReset().mockResolvedValue({});
  groupsMock.mockReset().mockReturnValue({ data: { exact: [], normalized: [], fuzzy: [] } });
  collectionsMock.mockReset().mockReturnValue({ data: [] });
});

it("les trois catégories restent séparées et étiquetées", async () => {
  const item = (id: number, url: string) => ({ id, url, title: `Article ${id}`, collectionId: 101, created: "2025-01-01T12:00:00Z" });
  groupsMock.mockReturnValue({
    data: {
      exact: [{ key: "k1", kind: "exact", items: [item(1, "https://a.example/x"), item(2, "https://a.example/x")] }],
      normalized: [],
      fuzzy: [{ key: "k2", kind: "fuzzy", items: [item(3, "https://b.example/y"), item(4, "https://b.example/y")] }],
    },
  });
  render(<Doublons />, { wrapper });
  expect(await screen.findByText(/Doublons exacts/)).toBeInTheDocument();
  expect(screen.getByText(/Doublons flous/)).toBeInTheDocument();
  // catégorie normalisée vide : pas de section
  expect(screen.queryByText(/Doublons normalisés/)).not.toBeInTheDocument();
  // le chip compte les groupes (même sémantique que le dashboard T12)
  expect(screen.getByText("(2)")).toBeInTheDocument();
});

// La garde, le gardé, et le tri : les doublons sont actionnables — garde
// anti-double-suppression, sélection intelligente, tri global borné aux
// catégories certaines.
describe("doublons — la garde, le gardé, et le tri", () => {
  const groupe = (kind: "exact" | "normalized" | "fuzzy", items: { id: number; title: string; created: string }[]) => ({
    key: kind + items.map((i) => i.id).join(","),
    kind,
    items: items.map((i) => ({ id: i.id, url: `https://a.example/${i.id}`, title: i.title, collectionId: 101, created: i.created })),
  });
  const deuxGroupes = {
    exact: [groupe("exact", [
      { id: 1, title: "Ancienne page", created: "2020-01-01T00:00:00Z" },
      { id: 2, title: "Copie récente", created: "2024-06-01T00:00:00Z" },
    ])],
    normalized: [],
    fuzzy: [groupe("fuzzy", [
      { id: 5, title: "Flou A", created: "2020-01-01T00:00:00Z" },
      { id: 6, title: "Flou B", created: "2024-06-01T00:00:00Z" },
    ])],
  };

  it("LA GARDE : cocher une copie sur deux verrouille la dernière restante", async () => {
    groupsMock.mockReturnValue({ data: deuxGroupes });
    render(<Doublons />, { wrapper });
    await screen.findByText("Ancienne page");
    await userEvent.click(screen.getByRole("checkbox", { name: /Copie récente/ }));
    // Il ne reste qu'un exemplaire non coché : sa case se verrouille — un
    // groupe ne perd jamais son dernier représentant.
    expect(screen.getByRole("checkbox", { name: /Ancienne page/ })).toBeDisabled();
    // Un item DÉJÀ coché reste décochable : la garde porte sur ce qui
    // restera, pas sur le geste.
    await userEvent.click(screen.getByRole("checkbox", { name: /Copie récente/ }));
    expect(screen.getByRole("checkbox", { name: /Ancienne page/ })).toBeEnabled();
  });

  it("« Garder le meilleur » coche la copie, pas l'originale", async () => {
    groupsMock.mockReturnValue({ data: deuxGroupes });
    render(<Doublons />, { wrapper });
    await screen.findByText("Ancienne page");
    // Deux cartes portent le même bouton (exact et flou) : on cible la carte
    // du groupe exact par son conteneur.
    const carte = screen.getByText("Ancienne page").closest("div.bg-app-panel") as HTMLElement;
    await userEvent.click(within(carte).getByRole("button", { name: "Garder le meilleur" }));
    expect(screen.getByRole("checkbox", { name: /Copie récente/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Ancienne page/ })).not.toBeChecked();
  });

  it("la corbeille du groupe part en Revue dedupe, gardé porté par chaque copie", async () => {
    groupsMock.mockReturnValue({ data: deuxGroupes });
    render(<Doublons />, { wrapper });
    await screen.findByText("Ancienne page");
    const carte = screen.getByText("Ancienne page").closest("div.bg-app-panel") as HTMLElement;
    await userEvent.click(within(carte).getByRole("button", { name: "Garder le meilleur" }));
    await userEvent.click(within(carte).getByRole("button", { name: "Corbeille (1)" }));
    const vue = JSON.parse(screen.getByTestId("view").textContent ?? "{}") as {
      action: { op: string };
      items: { id: number; dedupeGarde: { id: number; title: string } }[];
    };
    expect(vue.action).toEqual({ op: "dedupe" });
    expect(vue.items[0]!.dedupeGarde).toEqual({ id: 1, title: "Ancienne page" });
  });

  it("le tri GLOBAL est borné aux catégories certaines — le flou reste manuel", async () => {
    groupsMock.mockReturnValue({ data: deuxGroupes });
    render(<Doublons />, { wrapper });
    await screen.findByText("Ancienne page");
    // 1 copie : la paire exacte seulement. Les 2 copies floues n'y sont pas.
    await userEvent.click(screen.getByRole("button", { name: "Trier les doublons (1)" }));
    const vue = JSON.parse(screen.getByTestId("view").textContent ?? "{}") as {
      items: { id: number }[];
    };
    expect(vue.items.map((i) => i.id)).toEqual([2]);
  });
});

// Le retour d'usage du 2026-09-20 : l'écran des doublons doit dire vrai
// après une suppression, la sélection de PLUSIEURS groupes part en une
// Revue, et chaque vue de traitement a son retour.
describe("doublons — la corbeille globale de la sélection, et le retour", () => {
  const groupe = (kind: "exact" | "normalized" | "fuzzy", items: { id: number; title: string; created: string }[]) => ({
    key: kind + items.map((i) => i.id).join(","),
    kind,
    items: items.map((i) => ({ id: i.id, url: `https://a.example/${i.id}`, title: i.title, collectionId: 101, created: i.created })),
  });
  const deux = {
    exact: [groupe("exact", [
      { id: 1, title: "Ancienne page", created: "2020-01-01T00:00:00Z" },
      { id: 2, title: "Copie récente", created: "2024-06-01T00:00:00Z" },
    ])],
    normalized: [],
    fuzzy: [groupe("fuzzy", [
      { id: 5, title: "Flou A", created: "2020-01-01T00:00:00Z" },
      { id: 6, title: "Flou B", created: "2024-06-01T00:00:00Z" },
    ])],
  };

  it("des copies de DEUX groupes partent en UNE Revue, chacune vers son gardé", async () => {
    groupsMock.mockReturnValue({ data: deux });
    render(<Doublons />, { wrapper });
    await screen.findByText("Ancienne page");
    // Une copie du groupe exact, une du flou : la sélection traverse les
    // groupes, la garde désigne le gardé de CHACUN.
    await userEvent.click(screen.getByRole("checkbox", { name: /Copie récente/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Flou B/ }));
    await userEvent.click(screen.getByRole("button", { name: "Corbeille de la sélection (2)" }));
    const vue = JSON.parse(screen.getByTestId("view").textContent ?? "{}") as {
      action: { op: string };
      items: { id: number; dedupeGarde: { id: number; title: string } }[];
    };
    expect(vue.action).toEqual({ op: "dedupe" });
    expect(vue.items).toHaveLength(2);
    expect(vue.items.map((i) => i.dedupeGarde.id)).toEqual([1, 5]);
  });

  // Les cochés survivent aux données : un refetch de scan (ou l'élagage
  // d'après-corbeille) peut changer les items d'un groupe à clé inchangée
  // PENDANT que la vue est montée. Deux conséquences à couvrir :
  // — le gardé peut disparaître (l'ensemble vivant est alors ENTIEREMENT
  //   coché) : le rendu ne doit pas casser, et rien ne part sans gardé ;
  // — des cochés peuvent devenir fantômes (ids disparus) : ils ne comptent
  //   plus dans la garde, qui ne verrouille que sur ce qui reste.
  it("le gardé disparaît des données sous une sélection pleine : rendu tenu, rien ne part", async () => {
    const trois = groupe("exact", [
      { id: 1, title: "Première", created: "2020-01-01T00:00:00Z" },
      { id: 2, title: "Deuxième", created: "2021-01-01T00:00:00Z" },
      { id: 3, title: "Troisième", created: "2022-01-01T00:00:00Z" },
    ]);
    groupsMock.mockReturnValue({ data: { exact: [trois], normalized: [], fuzzy: [] } });
    const { rerender } = render(<Doublons />, { wrapper });
    await screen.findByText("Première");
    await userEvent.click(screen.getByRole("checkbox", { name: /Deuxième/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Troisième/ }));
    // Refetch : le 1 (l'ancien gardé) a disparu, le key est inchangé.
    const deuxItems = { ...trois, items: trois.items.slice(1) };
    groupsMock.mockReturnValue({ data: { exact: [deuxItems], normalized: [], fuzzy: [] } });
    rerender(<Doublons />);
    // Sans crash — et aucun départ possible : aucun gardé ne se désigne
    // tout seul, l'utilisateur décoche pour avancer.
    expect(screen.queryByRole("button", { name: "Corbeille de la sélection (2)" })).not.toBeInTheDocument();
  });

  it("les cochés fantômes ne comptent plus dans la garde", async () => {
    // La clé du groupe est STABLE (elle dérive du contenu groupé, pas des
    // ids présents) : on la fige, sinon le refetch ferait un NOUVEAU groupe
    // et le test ne porterait plus sur le même.
    const trois = { ...groupe("exact", [
      { id: 1, title: "Première", created: "2020-01-01T00:00:00Z" },
      { id: 2, title: "Deuxième", created: "2021-01-01T00:00:00Z" },
      { id: 3, title: "Troisième", created: "2022-01-01T00:00:00Z" },
    ]), key: "k-stable" };
    groupsMock.mockReturnValue({ data: { exact: [trois], normalized: [], fuzzy: [] } });
    const { rerender } = render(<Doublons />, { wrapper });
    await screen.findByText("Première");
    await userEvent.click(screen.getByRole("checkbox", { name: /Première/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Deuxième/ }));
    // Refetch : le 1 a disparu, un 4 est apparu. Cochés réels : {2} — les
    // cases 3 et 4 restent libres (sans quoi la garde verrouille sur des
    // fantômes et interdit de cocher ce qui reste).
    const quatre = { ...groupe("exact", [
      { id: 2, title: "Deuxième", created: "2021-01-01T00:00:00Z" },
      { id: 3, title: "Troisième", created: "2022-01-01T00:00:00Z" },
      { id: 4, title: "Quatrième", created: "2023-01-01T00:00:00Z" },
    ]), key: "k-stable" };
    groupsMock.mockReturnValue({ data: { exact: [quatre], normalized: [], fuzzy: [] } });
    rerender(<Doublons />);
    expect(screen.getByRole("checkbox", { name: /Troisième/ })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: /Quatrième/ })).toBeEnabled();
    // La sélection réelle dit 1, pas 2 : le fantôme ne part pas en Revue.
    expect(screen.getByRole("button", { name: "Corbeille de la sélection (1)" })).toBeInTheDocument();
  });

  it("la vue a son retour vers le tableau de bord", async () => {
    groupsMock.mockReturnValue({ data: deux });
    render(<Doublons />, { wrapper });
    await screen.findByText("Ancienne page");
    await userEvent.click(screen.getByRole("button", { name: "Retour" }));
    const vue = JSON.parse(screen.getByTestId("view").textContent ?? "{}");
    expect(vue).toEqual({ kind: "cleanup" });
  });
});
