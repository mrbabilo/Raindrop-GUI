import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
// fixtures AVANT ListPane : la factory vi.mock (hisée au-dessus des imports)
// référence `raindrop` — piège TDZ documenté dans useStaticData.test.tsx.
import { raindrop, collections } from "../test/fixtures";
import { ListPane } from "./ListPane";
import { AppStateProvider, useAppState } from "../state/appState";

// `etatListe` pilote la réponse par test : sans lui, on ne pourrait pas
// éprouver l'ÉCHEC, qui s'affichait jusqu'ici comme « Rien ici ».
const { etatListe } = vi.hoisted(() => ({ etatListe: { valeur: null as null | Record<string, unknown> } }));
vi.mock("../hooks/useRaindrops", () => ({
  useRaindrops: () =>
    etatListe.valeur ?? {
      data: { pages: [{ items: [raindrop({ id: 1000 }), raindrop({ id: 1001, title: "Second", tags: ["rust", "design"], collectionId: 201 })], count: 2, page: 0, perPage: 50 }] },
      fetchNextPage: vi.fn(), hasNextPage: false, isFetchingNextPage: false,
    },
}));

// L'arbre des collections sert la signalétique §4 (la couleur appartient à la
// racine) : ListPane le résout et passe le titre résolu à chaque ligne.
// Mocké comme useRaindrops — aucun fetch réseau dans un test de composant.
vi.mock("../hooks/useStaticData", () => ({
  useCollections: () => ({ data: collections, isLoading: false }),
}));

// jsdom ne fait pas de layout : offsetHeight vaut 0 et le virtualizer en
// déduit une plage vide (virtual-core : outerSize === 0 → range null →
// getVirtualItems []). On simule une fenêtre de défilement de 600 px, le
// temps du fichier — l'ombre sur HTMLElement.prototype masque le getter
// d'Element.prototype et `delete` la retire sans toucher à l'original.
// Reste représentatif avec measureElement (R7P) : les lignes mesurent aussi
// 600 px sous jsdom — géométrie irréaliste, mais ce que le fichier asserte
// est QUELS items se rendent (contenu, sélection, filtre, détail), pas la
// métrique ; le câblage mesure→position (data-index + ref) s'exerce
// réellement (mesures enregistrées, translateY recalculé sans crash), et la
// précision numérique de virtual-core est son domaine testé à lui.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 600 });
});
afterAll(() => {
  delete (HTMLElement.prototype as unknown as { offsetHeight?: unknown }).offsetHeight;
});

// Assertions d'état : détail (detail-id) et vue courante (view) — même
// pattern Spy que Task 5/6 ; le Spy évite de polluer App.
const Spy = () => {
  const { selectedRaindropId, view } = useAppState();
  return (
    <>
      <span data-testid="detail-id" className="hidden">{selectedRaindropId}</span>
      <span data-testid="view" className="hidden">{JSON.stringify(view)}</span>
    </>
  );
};

const renderList = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppStateProvider><Spy /><ListPane /></AppStateProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  etatListe.valeur = null;
});

describe("ListPane", () => {
  it("affiche les items virtualisés (titre, domaine, étiquettes, date fr)", () => {
    renderList();
    expect(screen.getByText("Article exemple")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getAllByText("example.com").length).toBeGreaterThanOrEqual(2);
    // Étiquettes en pilules (DESIGN.md §2), plus en texte « #tag ».
    expect(screen.getByText("rust")).toHaveClass("tag");
    expect(screen.getAllByText("01/01/2025")).toHaveLength(2);
  });

  // §4 : « La collection racine porte la couleur de sa thématique ; ses
  // descendantes en héritent. » L'item 1001 est dans Rust (201), enfant de
  // Dev (101) : il doit prendre la teinte de Dev, pas la sienne.
  it("le carré de collection hérite de la teinte de sa racine (§4)", () => {
    renderList();
    expect(screen.getByTestId("coll-101").style.getPropertyValue("--h")).toBe("250"); // Dev → technique
    expect(screen.getByTestId("coll-201").style.getPropertyValue("--h")).toBe("250"); // Rust ⊂ Dev
    expect(screen.getByTestId("coll-201").style.getPropertyValue("--sat")).toBe("1");
  });

  it("clic = détail ; clic tag = filtre ; checkbox = sélection", async () => {
    renderList();
    await userEvent.click(screen.getByText("Article exemple"));
    expect(document.querySelector("[data-testid='detail-id']")?.textContent).toBe("1000");
    await userEvent.click(screen.getByText("rust"));
    // le tag cliqué déclenche patchList({search:"#rust"}) — asserté via la vue
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({ search: "#rust" });
    expect(screen.getByRole("checkbox", { name: "Sélectionner Second" })).not.toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: "Sélectionner Second" }));
    expect(screen.getByRole("checkbox", { name: "Sélectionner Second" })).toBeChecked();
  });

  // Le grief : une ligne par arrêt de tabulation, soit 12 000 sur la
  // bibliothèque réelle. La liste n'en prend qu'un.
  it("la liste ne prend qu'un seul arrêt de tabulation", () => {
    renderList();
    const enveloppes = [...document.querySelectorAll<HTMLElement>("[data-index]")];
    expect(enveloppes.length).toBeGreaterThan(1);
    expect(enveloppes.filter((e) => e.tabIndex === 0)).toHaveLength(1);
  });

  // L'index actif vit dans l'état, JAMAIS le focus : le virtualiseur démonte
  // la ligne dès qu'elle sort du champ, et le focus tomberait sur `body`.
  it("les flèches déplacent l'arrêt de ligne en ligne", async () => {
    renderList();
    const premiere = document.querySelector<HTMLElement>('[data-index="0"]')!;
    premiere.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(document.querySelector<HTMLElement>('[data-index="1"]')!.tabIndex).toBe(0);
    expect(premiere.tabIndex).toBe(-1);
  });

  it("Entrée ouvre la fiche de la ligne active", async () => {
    renderList();
    document.querySelector<HTMLElement>('[data-index="0"]')!.focus();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByTestId("detail-id").textContent).not.toBe("");
  });

  // Mesuré au navigateur avant correction : vingt-neuf lignes montées
  // faisaient cent vingt-six arrêts de tabulation, parce que chaque case et
  // chaque étiquette en était un. La LIGNE est l'arrêt, pas ses contrôles.
  it("les contrôles d'une ligne ne sont pas des arrêts de tabulation", () => {
    renderList();
    const dansLignes = [...document.querySelectorAll<HTMLElement>('[data-index] button, [data-index] input')];
    expect(dansLignes.length).toBeGreaterThan(2);
    expect(dansLignes.filter((e) => e.tabIndex === 0)).toHaveLength(0);
  });

  // La case sortant du parcours, le geste doit rester : l'espace la remplace.
  it("la barre d'espace coche la ligne active", async () => {
    renderList();
    document.querySelector<HTMLElement>('[data-index="0"]')!.focus();
    await userEvent.keyboard(" ");
    expect(screen.getAllByRole("checkbox")[0]).toBeChecked();
  });

  // « Après une action, le focus passe à la ligne suivante » : cocher une
  // série se fait d'une seule main, sans alterner espace et flèche.
  it("cocher fait avancer d'une ligne", async () => {
    renderList();
    document.querySelector<HTMLElement>('[data-index="0"]')!.focus();
    await userEvent.keyboard(" ");
    expect(screen.getAllByRole("checkbox")[0]).toBeChecked();
    expect(document.querySelector<HTMLElement>('[data-index="1"]')!.tabIndex).toBe(0);
  });

  // « La ligne active suit aussi le survol » — un seul état de pointeur. Mais
  // le survol ne doit pas VOLER le focus : passer la souris est sans
  // intention, et la liste sauterait sous le curseur.
  it("le survol déplace la ligne active sans prendre le focus", async () => {
    renderList();
    const premiere = document.querySelector<HTMLElement>('[data-index="0"]')!;
    premiere.focus();
    await userEvent.hover(document.querySelector<HTMLElement>('[data-index="1"]')!);
    expect(document.querySelector<HTMLElement>('[data-index="1"]')!.tabIndex).toBe(0);
    expect(premiere).toHaveFocus();
  });

  // Le grief : `items.length === 0 && !isFetching` attrapait aussi l'échec,
  // et la vue annonçait « Rien ici » — « cette collection est vide » — quand
  // la vérité était « je n'ai pas pu regarder ».
  it("un échec de chargement se dit, il ne se déguise pas en collection vide", async () => {
    const refetch = vi.fn();
    etatListe.valeur = {
      data: undefined, isError: true, error: new Error("réseau perdu"), isFetching: false,
      fetchNextPage: vi.fn(), hasNextPage: false, isFetchingNextPage: false, refetch,
    };
    renderList();
    expect(screen.getByRole("alert")).toHaveTextContent("réseau perdu");
    expect(screen.queryByText("Rien ici")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(refetch).toHaveBeenCalled();
    // Le composer reste monté : c'est LUI qui crée le premier bookmark.
    expect(screen.getByTestId("composer-input")).toBeInTheDocument();
  });

  it("une collection réellement vide dit « Rien ici »", () => {
    etatListe.valeur = {
      data: { pages: [{ items: [], count: 0, page: 0, perPage: 50 }] },
      isError: false, isFetching: false,
      fetchNextPage: vi.fn(), hasNextPage: false, isFetchingNextPage: false, refetch: vi.fn(),
    };
    renderList();
    expect(screen.getByText("Rien ici")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
