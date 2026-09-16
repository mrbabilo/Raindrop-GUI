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
      return Promise.resolve(raindrop({ id: 1000, collectionId: 201, important: favori }));
    if (path === "/api/raindrops/2000")
      return Promise.resolve(raindrop({ id: 2000, title: "Second", collectionId: 101 }));
    if (path === "/api/highlights/1000")
      return Promise.resolve({ items: [{ _id: 9, text: "Un passage", note: "à revoir", color: "yellow" }] });
    return Promise.resolve({ items: [] }); // surlignages des autres items : aucun
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
});
