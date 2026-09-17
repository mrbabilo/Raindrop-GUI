import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { raindrop } from "../test/fixtures";
import { TopBar } from "./TopBar";
import { AppStateProvider, useAppState } from "../state/appState";

// TopBar rend désormais NatureChips (Task 6b), qui appelle useRaindrops —
// mocké ici comme dans ListPane.test.tsx pour ne dépendre d'aucun
// QueryClientProvider ni réseau : ce fichier teste TopBar, pas le comptage
// par fréquence (couvert par NatureChips.test.tsx). La page porte un article :
// depuis §9 « masqué si nul », une nature absente de la vue n'a pas de puce —
// une page vide ne rendrait plus aucune puce à cliquer.
vi.mock("../hooks/useRaindrops", () => ({
  useRaindrops: () => ({ data: { pages: [{ items: [raindrop({ type: "article" })], count: 1, page: 0, perPage: 50 }] } }),
}));

const Spy = () => {
  const { view } = useAppState();
  return <span data-testid="view">{view.kind === "list" ? JSON.stringify(view) : view.kind}</span>;
};

const renderTop = () =>
  render(<AppStateProvider><Spy /><TopBar /></AppStateProvider>);

describe("TopBar", () => {
  it("la recherche (debounce 300 ms) met à jour la vue", async () => {
    // Vrais timers, délai réel : l'asyncWrapper de RTL-react attend un
    // setTimeout(0) après chaque appel user-event et n'avance une horloge
    // fake QUE si un global `jest` existe (helpers.js) — sous vitest, sans
    // lui, `await user.type(...)` pendrait. L'attente réelle teste le même
    // contrat : rien avant la pause de saisie, la recherche après 350 ms.
    renderTop();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Rechercher…"), "rust");
    expect(JSON.parse(screen.getByTestId("view").textContent!)).not.toMatchObject({ search: "rust" });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({ search: "rust" });
  });

  it("le tri et la bascule mosaïque mettent à jour la vue", async () => {
    renderTop();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Tri"), "title");
    await user.click(screen.getByRole("button", { name: "Afficher en mosaïque" }));
    const v = JSON.parse(screen.getByTestId("view").textContent!);
    expect(v.sort).toBe("title");
    expect(v.viewMode).toBe("mosaic");
  });

  // DESIGN.md §9 : « un seul point d'entrée par geste » et « une icône par
  // geste ». Deux boutons texte pour un seul geste deviennent une icône qui
  // montre le mode VERS LEQUEL elle bascule ; le nom accessible le dit.
  it("bascule d'affichage : une seule icône, nommée par sa destination (§9)", async () => {
    renderTop();
    const user = userEvent.setup();
    const bouton = screen.getByRole("button", { name: "Afficher en mosaïque" });
    expect(bouton.textContent).toBe("");
    expect(bouton.querySelector("svg")).not.toBeNull();
    // L'autre mode n'a pas son propre bouton : un geste, un contrôle.
    expect(screen.queryByRole("button", { name: "Afficher en liste" })).not.toBeInTheDocument();
    await user.click(bouton);
    expect(await screen.findByRole("button", { name: "Afficher en liste" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Afficher en mosaïque" })).not.toBeInTheDocument();
  });

  // §9 : le tri nomme son état courant au lieu d'occuper un champ de saisie.
  // Le contrôle reste un <select> natif — clavier, Échap et VoiceOver
  // gratuits, là où un menu maison les devrait au lot a11y.
  it("le tri est un bouton-état, pas un champ (§9)", () => {
    renderTop();
    const tri = screen.getByLabelText("Tri") as HTMLSelectElement;
    expect(tri.className).not.toContain("input");
    // Le libellé affiché EST l'état courant.
    expect(tri.selectedOptions[0]!.textContent).toBe("Récents");
    // Habillage bouton-état : le conteneur porte la classe et son chevron.
    const etat = tri.closest(".etat")!;
    expect(etat).not.toBeNull();
    expect(etat.querySelector("svg")).not.toBeNull();
  });

  it("filtres avancés : domaine, nature (puce au focus), dates → query", async () => {
    // Task 6b : le <select> de nature est remplacé par les puces de
    // NatureChips, révélées au focus du champ de recherche (DESIGN.md §11).
    renderTop();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Domaine"), "example.com");
    await user.click(screen.getByPlaceholderText("Rechercher…"));
    await user.click(screen.getByRole("button", { name: "Articles" }));
    await user.type(screen.getByLabelText("Depuis"), "2025-01-01");
    await user.type(screen.getByLabelText("Jusqu'à"), "2025-12-31");
    const v = JSON.parse(screen.getByTestId("view").textContent!);
    expect(v).toMatchObject({ domain: "example.com", media: "article", createdStart: "2025-01-01", createdEnd: "2025-12-31" });
  });
});
