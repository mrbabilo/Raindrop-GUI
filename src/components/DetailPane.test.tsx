import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
// fixtures AVANT DetailPane (TDZ — même piège que ListPane.test : la factory
// vi.mock, hisée au-dessus des imports, référence `raindrop` et `collections`).
import { raindrop, collections } from "../test/fixtures";
import { DetailPane } from "./DetailPane";
import { AppStateProvider, useAppState } from "../state/appState";
import { injecterRegles } from "../test/injectStyles";

const { getApi, sendApi } = vi.hoisted(() => ({ getApi: vi.fn(), sendApi: vi.fn() }));

vi.mock("../lib/api", () => ({ api: { get: getApi, send: sendApi } }));

// L'arbre sert le fil d'Ariane §4 : mocké comme dans ListPane.test — aucun
// fetch réseau dans un test de composant.
vi.mock("../hooks/useStaticData", () => ({ useCollections: () => ({ data: collections }) }));

// État « favori » piloté par les PATCH reçus : la refetch d'invalidation doit
// refléter la mutation — c'est ainsi que le test prouve le câblage complet
// (mutation → invalidation de ["raindrop", id] → refetch → libellé inversé).
let favori = false;

beforeEach(() => {
  favori = false;
  getApi.mockReset().mockImplementation((path: string) => {
    if (path === "/api/raindrops/1000")
      return Promise.resolve(
        raindrop({
          id: 1000,
          collectionId: 201,
          important: favori,
          // R8cP-1 : les highlights vivent dans l'item complet (normalisés par
          // le mapper sidecar) — la route dédiée /api/highlights est morte.
          highlights: [
            { id: "6881239e822c9c57b6088b7d", text: "Un passage", note: "à revoir", created: "2025-07-23T18:02:06.309Z" },
          ],
        }),
      );
    if (path === "/api/raindrops/2000")
      return Promise.resolve(raindrop({ id: 2000, title: "Second", collectionId: 101 }));
    return undefined; // tout autre path : aucun (la query morte /api/highlights ne doit plus être appelée)
  });
  sendApi.mockReset().mockImplementation(async (_m: string, _p: string, body?: { important?: boolean }) => {
    if (body && "important" in body) favori = body.important === true;
    return { deleted: true };
  });
});

// Note du brief : la préselection passe par un composant interne qui appelle
// selectRaindrop — App reste hors de la boucle de test. Déps [id] seul : la
// valeur du contexte est recréée à chaque rendu du provider (pas de mémo),
// dépendre de selectRaindrop re-déclencherait le dispatch en boucle.
const Preselect = ({ id }: { id: number }) => {
  const { selectRaindrop } = useAppState();
  useEffect(() => {
    selectRaindrop(id);
  }, [id]);
  return null;
};

// Change la sélection en cours de test (purge du brouillon, item 2).
const Bascule = () => {
  const { selectRaindrop } = useAppState();
  return (
    <>
      <button type="button" onClick={() => selectRaindrop(1000)}>vers-1000</button>
      <button type="button" onClick={() => selectRaindrop(2000)}>vers-2000</button>
    </>
  );
};

const renderDetail = (auDessus?: ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppStateProvider>
        {auDessus}
        <DetailPane />
      </AppStateProvider>
    </QueryClientProvider>,
  );

describe("DetailPane", () => {
  it("sans sélection : message d'invité, aucune requête", () => {
    renderDetail();
    expect(screen.getByText(/Sélectionnez un bookmark/i)).toBeInTheDocument();
    expect(getApi).not.toHaveBeenCalled(); // requêtes enabled:false tant que rien n'est sélectionné
  });

  it("aperçu + édition inline (PATCH) + favori + corbeille + highlights mappés", async () => {
    const { container } = renderDetail(<Preselect id={1000} />);
    // Aperçu — titre §7 : 26 px / graisse 590 / -0.015em (règle lue dans le
    // VRAI styles.css par injecterRegles, jamais recopiée dans le test).
    injecterRegles(".titre-fiche");
    const titre = await screen.findByText("Article exemple");
    expect(titre).toHaveClass("titre-fiche");
    expect(getComputedStyle(titre).fontSize).toBe("26px");
    expect(getComputedStyle(titre).fontWeight).toBe("590");
    expect(getComputedStyle(titre).letterSpacing).toBe("-0.015em");
    // Fil d'Ariane §4 : carré teinté de la racine (Dev) + chemin Rust ⊂ Dev.
    expect(screen.getByText("Dev")).toBeInTheDocument();
    expect(screen.getByText("Rust")).toBeInTheDocument();
    expect(screen.getByTestId("coll-101").style.getPropertyValue("--h")).toBe("250");
    // URL en chasse fixe (§7), glyphe de nature devant (§2.1) — et aucun
    // jeton fantôme (amendement 1 : text-app-accent/bg-app-accent n'existent
    // pas et ne doivent pas exister).
    expect(screen.getByText("https://example.com/a")).toHaveClass("url");
    expect(container.querySelector("[class*='app-accent'], [class*='app-danger']")).toBeNull();
    // Étiquettes à la densité « détail » : pilules 21 px (§2, .tag-detail).
    expect(screen.getByText("typescript")).toHaveClass("tag", "tag-detail");
    // Surlignages : {_id} brut converti en {id} côté front (enveloppe Task 0c).
    expect(await screen.findByText("Un passage")).toBeInTheDocument();
    expect(screen.getByText("à revoir")).toBeInTheDocument();

    // Édition inline : Modifier → input → Enregistrer → PATCH du champ changé.
    await userEvent.click(screen.getByRole("button", { name: "Modifier" }));
    const champ = screen.getByDisplayValue("Article exemple");
    await userEvent.clear(champ);
    await userEvent.type(champ, "Titre édité");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(sendApi).toHaveBeenCalledWith(
      "PATCH",
      "/api/raindrops/1000",
      expect.objectContaining({ title: "Titre édité" }),
    );
    await screen.findByText("Article exemple"); // retour en aperçu

    // Favori : PATCH important:true, puis la refetch d'invalidation renvoie
    // le libellé inversé — la mutation atteint vraiment l'aperçu.
    await userEvent.click(screen.getByRole("button", { name: "Favori" }));
    expect(sendApi).toHaveBeenCalledWith("PATCH", "/api/raindrops/1000", { important: true });
    await screen.findByRole("button", { name: "Retirer des favoris" });

    // Corbeille : `from` = collection courante (201) — sans lui le sidecar ne
    // mémorise pas l'origine et la restauration devient impossible (§4.2).
    await userEvent.click(screen.getByRole("button", { name: "Mettre à la corbeille" }));
    await waitFor(() => expect(sendApi).toHaveBeenCalledWith("DELETE", "/api/raindrops/1000?from=201"));
  });

  // R8P-1 : un PATCH en échec ne détruit pas la saisie — l'édition reste
  // ouverte, le brouillon est conservé, l'erreur s'affiche inline.
  it("échec d'enregistrement : édition ouverte, brouillon intact, erreur inline", async () => {
    sendApi.mockRejectedValue(new Error("réseau perdu"));
    renderDetail(<Preselect id={1000} />);
    await userEvent.click(await screen.findByRole("button", { name: "Modifier" }));
    const champ = screen.getByDisplayValue("Article exemple");
    await userEvent.clear(champ);
    await userEvent.type(champ, "Titre perdu");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    // L'édition n'a pas fermé : l'input porte toujours le brouillon.
    expect(screen.getByDisplayValue("Titre perdu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Annuler" })).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("réseau perdu");
  });

  // R8P-1 : même contrat pour la corbeille — l'item reste affiché, erreur inline.
  it("échec de mise à la corbeille : erreur inline, item toujours affiché", async () => {
    renderDetail(<Preselect id={1000} />);
    await screen.findByText("Article exemple");
    sendApi.mockRejectedValue(new Error("réseau perdu"));
    await userEvent.click(screen.getByRole("button", { name: "Mettre à la corbeille" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("réseau perdu");
    expect(screen.getByText("Article exemple")).toBeInTheDocument();
  });

  // R8P-1 : le favori au moins absorbe le rejet — un unhandledRejection fait
  // échouer le fichier vitest, donc ce test échoue sans .catch.
  it("échec du favori : rejet absorbé, état inchangé", async () => {
    renderDetail(<Preselect id={1000} />);
    await screen.findByText("Article exemple");
    sendApi.mockRejectedValue(new Error("réseau perdu"));
    await userEvent.click(screen.getByRole("button", { name: "Favori" }));
    await waitFor(() => expect(sendApi).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Favori" })).toBeInTheDocument();
  });

  // R8P-2 : §9 — l'étoile est une icône au trait (1,6–1,8, grille 15–16),
  // JAMAIS pleine, y compris quand le lien est favori.
  it("l'étoile reste au trait, même active (§9)", async () => {
    renderDetail(<Preselect id={1000} />);
    const inactif = await screen.findByRole("button", { name: "Favori" });
    expect(inactif.querySelector("svg")).toHaveAttribute("fill", "none");
    await userEvent.click(inactif);
    const actif = await screen.findByRole("button", { name: "Retirer des favoris" });
    expect(actif.querySelector("svg")).toHaveAttribute("fill", "none");
    expect(actif.querySelector("svg")).toHaveAttribute("width", "15");
  });

  it("changer d'item purge le brouillon d'édition", async () => {
    renderDetail(
      <>
        <Preselect id={1000} />
        <Bascule />
      </>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Modifier" }));
    const champ = screen.getByDisplayValue("Article exemple");
    await userEvent.clear(champ);
    await userEvent.type(champ, "Brouillon");
    await userEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.getByText("Article exemple")).toBeInTheDocument();
    expect(sendApi).not.toHaveBeenCalled(); // Annuler n'écrit rien

    await userEvent.click(screen.getByRole("button", { name: "vers-2000" }));
    await userEvent.click(await screen.findByRole("button", { name: "Modifier" }));
    // Le brouillon « Brouillon » (posé sur l'item 1000) ne doit pas fuir vers
    // l'item 2000 : le changement de sélection purge le draft.
    expect(screen.getByDisplayValue("Second")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Brouillon")).not.toBeInTheDocument();
  });

  // DESIGN.md §9 : « une icône par geste » et « un seul point d'entrée par
  // geste ». Le favori ne garde que l'étoile — son nom accessible porte
  // l'état, que la surface `sel` redit à l'œil (§6, l'étoile n'ayant pas de
  // variante pleine). « Ouvrir » disparaît : la ligne d'URL EST le lien.
  it("favori en icône seule, « Ouvrir » retiré (§9)", async () => {
    const { container } = renderDetail(<Preselect id={1000} />);
    const favori = await screen.findByRole("button", { name: "Favori" });
    // Aucun texte : l'étoile seule, et le nom vient de l'aria-label.
    expect(favori.textContent).toBe("");
    expect(favori.querySelector("svg")).not.toBeNull();
    expect(favori).toHaveAttribute("aria-pressed", "false");
    expect(favori.className).not.toContain("bg-app-sel");

    // Un seul point d'entrée vers l'URL : le lien de la ligne d'adresse.
    expect(screen.queryByRole("button", { name: "Ouvrir" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ouvrir" })).not.toBeInTheDocument();
    const liens = [...container.querySelectorAll('a[href="https://example.com/a"]')];
    expect(liens).toHaveLength(1);

    // L'état actif se marque par la surface, et le nom accessible bascule.
    await userEvent.click(favori);
    const actif = await screen.findByRole("button", { name: "Retirer des favoris" });
    expect(actif).toHaveAttribute("aria-pressed", "true");
    expect(actif.className).toContain("bg-app-sel");
  });

  // DESIGN.md §9 « masqué si nul » : la section des surlignages — titre
  // compris — n'existe pas quand l'item n'en porte aucun. L'item 2000 des
  // fixtures a highlights: [], l'item 1000 en a un.
  it("section Surlignages masquée quand l'item n'en a aucun (§9)", async () => {
    renderDetail(
      <>
        <Preselect id={1000} />
        <Bascule />
      </>,
    );
    expect(await screen.findByText("Surlignages")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "vers-2000" }));
    expect(await screen.findByText("Second")).toBeInTheDocument();
    expect(screen.queryByText("Surlignages")).not.toBeInTheDocument();
  });

  // Revue finale : l'état d'ÉCHEC d'une mutation suit l'observateur (pas la
  // clé) — sans reset, l'alerte d'un PATCH raté sur A s'affiche encore sur B.
  it("un échec d'écriture sur A ne s'affiche pas sur B au changement d'item", async () => {
    renderDetail(
      <>
        <Preselect id={1000} />
        <Bascule />
      </>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Modifier" }));
    // Un champ doit changer : Enregistrer sans brouillon ne mute pas.
    const champ = screen.getByDisplayValue("Article exemple");
    await userEvent.clear(champ);
    await userEvent.type(champ, "Titre raté");
    sendApi.mockRejectedValue(new Error("réseau perdu"));
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("réseau perdu");

    await userEvent.click(screen.getByRole("button", { name: "vers-2000" }));
    expect(await screen.findByText("Second")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
