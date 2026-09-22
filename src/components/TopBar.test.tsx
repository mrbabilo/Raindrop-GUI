import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { raindrop } from "../test/fixtures";
import { injecterRegles } from "../test/injectStyles";
import { TopBar } from "./TopBar";
import { AppStateProvider, useAppState } from "../state/appState";

// Le bouton « Sauvegarder la vue » porte une mutation (useCreerSmartList) :
// elle exige un QueryClientProvider — sans lui, TOUT le fichier casse au
// rendu (piège « mêmes providers que main.tsx »). Le send est espionné pour
// les tests de pose.
const sendMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/api", () => ({ api: { get: vi.fn(), send: sendMock } }));

beforeEach(() => sendMock.mockReset().mockResolvedValue({}));

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

// Pose une vue filtrée SANS passer par la saisie (le debounce de 300 ms de
// la recherche serait lourd) : le harnais navigue, comme le ferait un clic
// d'étiquette.
const Ouvre = () => {
  const { go } = useAppState();
  return (
    <>
      <button type="button" onClick={() => go({ kind: "list", collectionId: 0, label: "Tous", tags: ["rust"] })}>vue-étiquette</button>
      <button type="button" onClick={() => go({ kind: "list", collectionId: 0, label: "Tous", search: "affiche" })}>vue-recherche</button>
      <button type="button" onClick={() => go({ kind: "list", collectionId: 0, label: "Tous", sort: "title" })}>vue-tri-seul</button>
    </>
  );
};

const renderTop = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppStateProvider>
        <Spy />
        <Ouvre />
        <TopBar />
      </AppStateProvider>
    </QueryClientProvider>,
  );

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
    // Épure §9 : domaine et dates vivent désormais dans le panneau replié.
    renderTop();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Filtres avancés" }));
    await user.type(screen.getByLabelText("Domaine"), "example.com");
    await user.click(screen.getByPlaceholderText("Rechercher…"));
    await user.click(screen.getByRole("button", { name: "Articles" }));
    await user.type(screen.getByLabelText("Depuis"), "2025-01-01");
    await user.type(screen.getByLabelText("Jusqu'à"), "2025-12-31");
    const v = JSON.parse(screen.getByTestId("view").textContent!);
    expect(v).toMatchObject({ domain: "example.com", media: "article", createdStart: "2025-01-01", createdEnd: "2025-12-31" });
  });

  // Vérifié au navigateur le 2026-09-17 : avec `btn px-0`, le padding
  // horizontal de `.btn` l'emportait sur l'utilitaire Tailwind et écrasait
  // l'icône à 6 px de large pour 15 de haut. Les commandes en icône seule
  // ont donc leur propre classe, et c'est la VRAIE feuille qu'on relit ici —
  // jsdom ne fait pas de mise en page, mais il lit une déclaration.
  it("une commande en icône seule laisse la place à son icône (§9)", () => {
    injecterRegles(".btn-icone");
    renderTop();
    const bouton = screen.getByRole("button", { name: "Filtres avancés" });
    expect(bouton.className).toContain("btn-icone");
    // Aucun utilitaire de padding ou de largeur : la classe suffit, sinon
    // la cascade rejoue contre nous.
    expect(bouton.className).not.toMatch(/\bpx-|\bw-\[/);
    const style = getComputedStyle(bouton);
    expect(style.paddingLeft).toBe("0px");
    expect(style.paddingRight).toBe("0px");
    expect(style.width).toBe("28px");
  });

  // DESIGN.md §9 « révélé, pas posé » : domaine et dates servent rarement —
  // ils quittent la barre pour un panneau que l'icône de réglages déplie.
  it("domaine et dates sont repliés dans le panneau de réglages (§9)", async () => {
    renderTop();
    const user = userEvent.setup();
    expect(screen.queryByLabelText("Domaine")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Depuis")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Jusqu'à")).not.toBeInTheDocument();

    const reglages = screen.getByRole("button", { name: "Filtres avancés" });
    expect(reglages).toHaveAttribute("aria-expanded", "false");
    await user.click(reglages);
    expect(reglages).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Domaine")).toBeInTheDocument();
    // Le panneau que le bouton annonce est bien celui qu'il commande.
    expect(document.getElementById(reglages.getAttribute("aria-controls")!)).not.toBeNull();

    await user.click(reglages);
    expect(screen.queryByLabelText("Domaine")).not.toBeInTheDocument();
  });

  // Même contrat qu'en §11 pour les puces : un filtre posé ne peut pas
  // devenir invisible, sinon plus rien ne permet de le retirer.
  it("le panneau reste déplié tant qu'un filtre y est actif (§9)", async () => {
    renderTop();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Filtres avancés" }));
    // « Effacer » est masqué tant qu'il n'y a rien à effacer (§9).
    expect(screen.queryByRole("button", { name: "Effacer les filtres" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Domaine"), "example.com");
    await user.click(screen.getByRole("button", { name: "Filtres avancés" }));
    expect(screen.getByLabelText("Domaine")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Effacer les filtres" }));
    expect(JSON.parse(screen.getByTestId("view").textContent!).domain).toBeUndefined();
    expect(screen.queryByLabelText("Domaine")).not.toBeInTheDocument();
  });

  // Spec §4 : le geste naît là où la vue existe, et seulement quand un
  // filtre est actif — le tri seul ne compte pas.
  it("le bouton n'existe pas sans filtre actif, ni avec le tri seul", async () => {
    renderTop();
    expect(screen.queryByRole("button", { name: "Sauvegarder la vue" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("vue-tri-seul"));
    expect(screen.queryByRole("button", { name: "Sauvegarder la vue" })).not.toBeInTheDocument();
  });

  it.each([
    ["étiquette retenue", "vue-étiquette", "rust"],
    ["recherche", "vue-recherche", "affiche"],
  ])("le bouton existe avec %s, le clic ouvre le formulaire prérempli", async (_nom, declencheur, attendu) => {
    renderTop();
    await userEvent.click(screen.getByText(declencheur));
    await userEvent.click(screen.getByRole("button", { name: "Sauvegarder la vue" }));
    const champ = screen.getByLabelText("Nom de la vue sauvegardée") as HTMLInputElement;
    expect(champ.value).toBe(attendu);
  });

  it("Enter pose : POST portant le label et la vue sérialisée, le formulaire se referme", async () => {
    sendMock.mockResolvedValue({});
    renderTop();
    await userEvent.click(screen.getByText("vue-étiquette"));
    await userEvent.click(screen.getByRole("button", { name: "Sauvegarder la vue" }));
    const champ = screen.getByLabelText("Nom de la vue sauvegardée");
    await userEvent.clear(champ);
    await userEvent.type(champ, "Rust{Enter}");
    expect(sendMock).toHaveBeenCalledWith("POST", "/api/smartlists", {
      label: "Rust",
      vue: { collectionId: 0, tags: ["rust"] }, // sérialisée : seuls les champs définis
    });
    expect(screen.queryByLabelText("Nom de la vue sauvegardée")).not.toBeInTheDocument();
  });

  it("Échap annule : rien n'est envoyé", async () => {
    renderTop();
    await userEvent.click(screen.getByText("vue-étiquette"));
    await userEvent.click(screen.getByRole("button", { name: "Sauvegarder la vue" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByLabelText("Nom de la vue sauvegardée")).not.toBeInTheDocument();
    expect(sendMock).not.toHaveBeenCalled();
  });
});
