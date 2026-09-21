// Les étiquettes de la FICHE comme commandes de filtre — détaché de
// DetailPane.test.tsx pour le cliquet de build_app.py (plafond dur 400) :
// frontière naturelle, la pilule d'étiquette n'a rien du reste de la fiche.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
// Fixtures AVANT DetailPane (TDZ — même piège que ListPane.test : la factory
// vi.mock, hisée au-dessus des imports, référence `raindrop` et `collections`).
import { raindrop, collections } from "../test/fixtures";
import { DetailPane } from "./DetailPane";
import { AppStateProvider, useAppState } from "../state/appState";

const { getApi } = vi.hoisted(() => ({ getApi: vi.fn() }));

vi.mock("../lib/api", () => ({ api: { get: getApi, send: vi.fn() } }));
vi.mock("../hooks/useStaticData", () => ({ useCollections: () => ({ data: collections }) }));

beforeEach(() => {
  getApi.mockReset().mockImplementation((path: string) => {
    if (path === "/api/raindrops/1000") return Promise.resolve(raindrop({ id: 1000 }));
    // ActionsLecture sonde les jobs en vol et l'inventaire des archives.
    if (path === "/api/jobs") return Promise.resolve([]);
    if (path === "/api/backup/archives") return Promise.resolve({ ids: [], octets: 0 });
    return undefined;
  });
});

// La préselection passe par un composant interne qui appelle selectRaindrop —
// App reste hors de la boucle de test (déps [id] seul, même raison que
// DetailPane.test.tsx).
const Preselect = ({ id }: { id: number }) => {
  const { selectRaindrop } = useAppState();
  useEffect(() => {
    selectRaindrop(id);
  }, [id]);
  return null;
};

describe("DetailPane — étiquettes comme filtre", () => {
  // Une étiquette de fiche était INERTE à dessein (« une étiquette de fiche
  // n'est pas une commande »). Décision renversée : à l'usage, c'est
  // l'inertie qui surprend.
  it("une étiquette de la fiche pose le filtre sur la liste", async () => {
    const Vue = () => {
      const { view } = useAppState();
      return <span data-testid="vue">{JSON.stringify(view)}</span>;
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AppStateProvider>
          <Vue />
          <Preselect id={1000} />
          <DetailPane />
        </AppStateProvider>
      </QueryClientProvider>,
    );
    // La fixture porte ses étiquettes — sans quoi ce test n'aurait rien à
    // cliquer et le prouverait mal.
    const pilule = await screen.findByRole("button", { name: raindrop().tags[0]! });
    await userEvent.click(pilule);
    const lu = () => JSON.parse(screen.getByTestId("vue").textContent ?? "{}") as { tags?: string[] };
    expect(lu().tags).toEqual([raindrop().tags[0]!]);
    // Le retour : la même pilule retire ce qu'elle a posé.
    await userEvent.click(pilule);
    expect(lu().tags).toEqual([]);
  });

  // `patchList` est un NO-OP hors vue liste : la fiche peut être ouverte
  // au-dessus du Nettoyage, et s'en contenter rendrait la pilule morte
  // précisément là où rien ne l'annoncerait.
  it("hors vue liste, l'étiquette NAVIGUE au lieu de ne rien faire", async () => {
    const Pilote = () => {
      const { view, go } = useAppState();
      return (
        <>
          <span data-testid="vue">{JSON.stringify(view)}</span>
          <button type="button" onClick={() => go({ kind: "cleanup" })}>vers-nettoyage</button>
        </>
      );
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AppStateProvider>
          <Pilote />
          <Preselect id={1000} />
          <DetailPane />
        </AppStateProvider>
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByText("vers-nettoyage"));
    // La vue N'EST PLUS une liste — c'est là que le patch serait muet.
    expect(JSON.parse(screen.getByTestId("vue").textContent ?? "{}").kind).toBe("cleanup");

    await userEvent.click(await screen.findByRole("button", { name: raindrop().tags[0]! }));
    const vue = JSON.parse(screen.getByTestId("vue").textContent ?? "{}") as {
      kind: string; collectionId: number; tags?: string[];
    };
    expect(vue.kind).toBe("list");
    expect(vue.collectionId).toBe(0);
    expect(vue.tags).toEqual([raindrop().tags[0]!]);
  });
});
