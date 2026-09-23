import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
// fixtures AVANT CommandPalette : la factory vi.mock (hisée au-dessus des
// imports) référence `collections`/`tags` — voir la note de Sidebar.test.tsx
// (TDZ).
import { collections, tags } from "../test/fixtures";
import { CommandPalette } from "./CommandPalette";
import { AppStateProvider, useAppState } from "../state/appState";

vi.mock("../hooks/useStaticData", () => ({
  useCollections: () => ({ data: collections }),
  useTags: () => ({ data: tags }),
}));

// Faux serveur routé par recherche : il ne renvoie le bookmark que pour une
// requête « rust », les autres reviennent vides — comme un vrai serveur.
// (Ruling 2a : le mock unique du brief rendait le test « Design » non
// déterministe — le bookmark « rust async » passait en tête de rangées.)
const getMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/api", () => ({ api: { get: getMock } }));

const rustBookmark = {
  id: 555, title: "rust async", url: "https://x", domain: "x", tags: [],
  excerpt: "", created: "2025-01-01", lastUpdate: "2025-01-01",
  important: false, type: "link", cover: null, collectionId: 101, note: "",
};

function mockApi() {
  getMock.mockReset().mockImplementation((path: string, query?: { search?: string }) => {
    if (path === "/api/raindrops" && (query?.search ?? "").toLowerCase().includes("rust"))
      return Promise.resolve({ items: [rustBookmark] });
    return Promise.resolve({ items: [] });
  });
}

// Le Spy sérialise la vue ENTIÈRE : les assertions portent sur la navigation
// (collectionId, search), pas sur un fragment (ruling 2a). R11P-2 : il
// expose aussi selectedRaindropId pour la sélection de fiche par la palette.
const Spy = () => {
  const { view, selectedRaindropId } = useAppState();
  return (
    <>
      <span data-testid="view">{JSON.stringify(view)}</span>
      <span data-testid="selection">{String(selectedRaindropId)}</span>
    </>
  );
};

const renderPalette = (query = "", onClose: () => void = () => undefined) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppStateProvider><Spy /><CommandPalette open onClose={onClose} initialQuery={query} /></AppStateProvider>
    </QueryClientProvider>,
  );

describe("CommandPalette", () => {
  beforeEach(mockApi);

  it("filtre collections et tags localement, et lance la recherche serveur", async () => {
    renderPalette("rust");
    await waitFor(() => expect(screen.getByText("rust async")).toBeInTheDocument());
    expect(screen.getByText("Rust")).toBeInTheDocument();   // collection (filtre local)
    expect(screen.getByText("#rust")).toBeInTheDocument();  // tag (filtre local)
    expect(getMock).toHaveBeenCalledWith("/api/raindrops", { search: "rust", per_page: 8 });
  });

  // La file du sidecar est SÉQUENTIELLE (550 ms) : une requête par frappe
  // y occupait ~4 s pour « raindrop » (audit du 2026-09-23). La recherche
  // attend une pause de saisie, comme la TopBar et le Composer.
  it("la recherche serveur attend la pause de saisie — pas une requête par frappe", async () => {
    renderPalette();
    await userEvent.type(screen.getByRole("combobox"), "rustacean");
    await waitFor(() => expect(getMock).toHaveBeenCalledWith("/api/raindrops", { search: "rustacean", per_page: 8 }));
    expect(getMock.mock.calls.filter((c) => c[0] === "/api/raindrops")).toHaveLength(1);
  });

  it("ne déclenche la recherche serveur qu'à partir de 2 caractères", () => {
    renderPalette("r");
    // Le filtre local travaille dès 1 caractère…
    expect(screen.getByText("Rust")).toBeInTheDocument();
    expect(screen.getByText("#rust")).toBeInTheDocument();
    // …mais le serveur reste au repos (contrat porté seul par `enabled`,
    // ruling 2b — l'ancien filtre mort du snippet ne disait rien).
    expect(screen.queryByText("rust async")).not.toBeInTheDocument();
    expect(getMock).not.toHaveBeenCalled();
  });

  it("Entrée sur une collection navigue (collectionId 102) et ferme", async () => {
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AppStateProvider><Spy /><CommandPalette open onClose={onClose} initialQuery="Design" /></AppStateProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("Design")).toBeInTheDocument());
    await userEvent.type(screen.getByRole("combobox"), "{Enter}");
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({
      kind: "list", collectionId: 102, label: "Design",
    });
    expect(onClose).toHaveBeenCalled();
  });

  // R11P-1 : la navigation tag porte le filtre lui-même — sinon listQuery
  // lit une vue sans étiquette et affiche « Tous » non filtré. Le filtre a
  // cessé d'être un `search: "#tag"` : il vit dans `tags`, un champ à part,
  // pour qu'une seconde étiquette s'y ajoute au lieu de l'écraser.
  it("cliquer un tag navigue vers la vue filtrée sur ce tag", async () => {
    renderPalette("rust");
    await waitFor(() => expect(screen.getByText("#rust")).toBeInTheDocument());
    await userEvent.click(screen.getByText("#rust"));
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({
      kind: "list", collectionId: 0, label: "#rust", tags: ["rust"],
    });
  });

  // R11P-2 : choisir un bookmark sélectionne sa fiche dans le détail —
  // même geste qu'un clic sur une ligne de liste, l'URL y est cliquable ;
  // pas de changement de vue, pas d'ouverture externe.
  it("Entrée sur un bookmark sélectionne sa fiche sans changer de vue", async () => {
    renderPalette("rust");
    // La fiche attendue en tête de rangées : on attend sa présence avant
    // d'appuyer sur Entrée (sinon le curseur pointerait encore la première
    // ligne locale — collections/tags — le temps de la réponse serveur).
    await waitFor(() => expect(screen.getByText("rust async")).toBeInTheDocument());
    await userEvent.type(screen.getByRole("combobox"), "{Enter}");
    expect(screen.getByTestId("selection").textContent).toBe("555");
    // La vue reste intacte : la palette ne redirige pas.
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({ kind: "list", collectionId: 0 });
  });

  // R15P-5 : la vue tags (T14) est joignable depuis la palette — elle
  // n'avait plus aucune entrée (vue inatteignable depuis T14).
  it("l'entrée Tags navigue vers la vue tags (R15P-5)", async () => {
    renderPalette("tags");
    // Filtre local « tags » : aucune collection ni tag fixtures ne matche —
    // l'entrée de vue est seule (le serveur renvoie vide, sans « rust »).
    await userEvent.click(screen.getByText("Tags"));
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({ kind: "tags" });
  });

  // Motif combobox d'ARIA 1.2 : le focus ne quitte jamais le champ, et c'est
  // la chaîne `aria-controls` → listbox → `aria-activedescendant` → option
  // qui dit au lecteur d'écran ce qui est sélectionné. Sans elle, les
  // flèches déplacent une surbrillance que rien n'annonce.
  it("la chaîne ARIA relie le champ à l'option courante", async () => {
    renderPalette("");
    const champ = screen.getByRole("combobox");
    const liste = screen.getByRole("listbox");
    // Le champ commande bien CETTE liste.
    expect(champ).toHaveAttribute("aria-controls", liste.id);
    expect(liste.id).not.toBe("");
    // Et il désigne l'option sélectionnée, par son identifiant.
    const actif = () => document.getElementById(champ.getAttribute("aria-activedescendant")!);
    expect(actif()).toHaveAttribute("aria-selected", "true");
    await userEvent.type(champ, "{ArrowDown}");
    expect(actif()).toHaveAttribute("aria-selected", "true");
    expect(actif()).toBe(screen.getAllByRole("option")[1]);
    // Les options sont filles DIRECTES de la listbox : un élément nu entre
    // les deux romprait la filiation qu'attend un lecteur d'écran.
    for (const o of screen.getAllByRole("option")) expect(o.parentElement).toBe(liste);
  });

  it("les flèches déplacent la sélection, Échap ferme sans naviguer", async () => {
    const onClose = vi.fn();
    renderPalette("", onClose);
    // Requête vide : tout le local matche — 3 collections + 3 tags + 5 vues
    // (nettoyage, morts, doublons, tags, corbeille), serveur au repos.
    expect(screen.getAllByRole("option")).toHaveLength(11);
    await userEvent.type(screen.getByRole("combobox"), "{ArrowDown}{ArrowDown}");
    expect(screen.getAllByRole("option")[2]).toHaveAttribute("aria-selected", "true");
    await userEvent.type(screen.getByRole("combobox"), "{ArrowUp}");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    await userEvent.type(screen.getByRole("combobox"), "{Escape}");
    expect(onClose).toHaveBeenCalled();
    // Aucune navigation déclenchée : la vue initiale est intacte.
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({ kind: "list", collectionId: 0 });
  });
});
