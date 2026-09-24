import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
// fixtures AVANT DetailPane (TDZ — la factory vi.mock référence `collections`).
import { raindrop, collections } from "../test/fixtures";
import { DetailPane } from "./DetailPane";
import { AppStateProvider, useAppState } from "../state/appState";

// Optimisation du 2026-09-24 : chaque clic sur un signet affichait
// « Chargement… » le temps d'un créneau de la file à 550 ms (bien plus si
// elle est occupée) — alors que la LISTE a déjà ce signet en cache : titre,
// URL, étiquettes, collection. La fiche s'affiche aussitôt depuis là ; la
// lecture complète (surlignages) arrive ensuite et remplace.
const { getApi } = vi.hoisted(() => ({ getApi: vi.fn() }));
vi.mock("../lib/api", () => ({ api: { get: getApi, send: vi.fn() } }));
vi.mock("../hooks/useStaticData", () => ({ useCollections: () => ({ data: collections }) }));

let liberer: (v: unknown) => void;
beforeEach(() => {
  getApi.mockReset().mockImplementation((path: string) => {
    if (path === "/api/raindrops/1000") return new Promise((r) => { liberer = r; }); // la lecture traîne
    if (path === "/api/jobs") return Promise.resolve([]);
    if (path === "/api/backup/archives") return Promise.resolve({ ids: [], octets: 0 });
    return undefined;
  });
});

const Preselect = () => {
  const { selectRaindrop } = useAppState();
  useEffect(() => selectRaindrop(1000), []);
  return null;
};

const monter = (client: QueryClient) =>
  render(
    <QueryClientProvider client={client}>
      <AppStateProvider><Preselect /><DetailPane /></AppStateProvider>
    </QueryClientProvider>,
  );

describe("DetailPane — la fiche s'affiche depuis la liste déjà chargée", () => {
  it("le signet en cache de liste s'affiche sans attendre sa lecture, qui le remplace ensuite", async () => {
    const client = new QueryClient();
    client.setQueryData(["raindrops", { collectionId: 0 }], {
      pages: [{ items: [raindrop({ id: 1000, title: "Depuis la liste" })], count: 1, page: 0, perPage: 50 }],
      pageParams: [0],
    });
    monter(client);
    expect(await screen.findByRole("heading", { name: "Depuis la liste" })).toBeInTheDocument();
    expect(screen.queryByText("Chargement…")).not.toBeInTheDocument();
    liberer(raindrop({ id: 1000, title: "Lu en entier" }));
    expect(await screen.findByRole("heading", { name: "Lu en entier" })).toBeInTheDocument();
  });

  it("témoin : hors de toute liste, la fiche attend sa lecture", async () => {
    monter(new QueryClient());
    expect(await screen.findByText("Chargement…")).toBeInTheDocument();
  });
});
