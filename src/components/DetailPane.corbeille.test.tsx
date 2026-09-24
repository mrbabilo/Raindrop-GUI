import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
// fixtures AVANT DetailPane (TDZ — la factory vi.mock hissée référence
// `raindrop`), même piège que DetailPane.test.
import { raindrop, collections } from "../test/fixtures";
import { DetailPane } from "./DetailPane";
import { AppStateProvider, useAppState } from "../state/appState";

// La fiche d'un signet EN CORBEILLE (collectionId -99) propose RESTAURER,
// jamais « Mettre à la corbeille » (signalement du 2026-09-20 : la fiche
// d'un corbeillé offrait de le re-corbeiller). Origine connue → restauration
// directe ; origine inconnue → sélecteur de destination dans la fiche, même
// mécanique que la vue corbeille du Nettoyage. Extrait de DetailPane.test
// (le cliquet de build_app.py : ce fichier touchait le plafond dur de 400
// lignes).

const { getApi, sendApi } = vi.hoisted(() => ({ getApi: vi.fn(), sendApi: vi.fn() }));

vi.mock("../lib/api", () => ({ api: { get: getApi, send: sendApi } }));
// L'arbre peuple le sélecteur de destination — SANS lui, aucune option et
// le test du choix impossible.
vi.mock("../hooks/useStaticData", () => ({ useCollections: () => ({ data: collections }) }));

beforeEach(() => {
  getApi.mockReset();
  sendApi.mockReset();
});

// La préselection passe par un composant interne (même pattern que
// DetailPane.test) : App reste hors de la boucle de test.
const Preselect = ({ id }: { id: number }) => {
  const { selectRaindrop } = useAppState();
  useEffect(() => {
    selectRaindrop(id);
  }, [id]);
  return null;
};

const renderDetail = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppStateProvider>
        <Preselect id={3000} />
        <DetailPane />
      </AppStateProvider>
    </QueryClientProvider>,
  );

describe("DetailPane — la fiche d'un signet corbeillé", () => {
  it("propose « Restaurer » au lieu de « Mettre à la corbeille », et restaure", async () => {
    getApi.mockImplementation((path: string) =>
      path === "/api/raindrops/3000" ? Promise.resolve(raindrop({ id: 3000, collectionId: -99 })) : undefined,
    );
    sendApi.mockResolvedValue({ restored: 1, unknown: [] });
    renderDetail();
    await screen.findByText("Article exemple");
    expect(screen.getByRole("button", { name: "Restaurer" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mettre à la corbeille" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Restaurer" }));
    expect(sendApi).toHaveBeenCalledWith("POST", "/api/raindrops/unrestore", { ids: [3000] });
  });

  it("origine inconnue : un sélecteur de destination apparaît, puis restaure vers elle", async () => {
    getApi.mockImplementation((path: string) =>
      path === "/api/raindrops/3000" ? Promise.resolve(raindrop({ id: 3000, collectionId: -99 })) : undefined,
    );
    sendApi.mockImplementation(async (_m: string, _p: string, body?: { ids: number[]; toCollectionId?: number }) =>
      body?.toCollectionId ? { restored: 1, unknown: [] } : { restored: 0, unknown: [3000] },
    );
    renderDetail();
    await screen.findByText("Article exemple");
    await userEvent.click(screen.getByRole("button", { name: "Restaurer" }));
    // L'origine est inconnue : le sidecar ne restaure pas — la fiche demande
    // une destination au lieu de mentir.
    expect(await screen.findByText("Origine inconnue — choisir une destination")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Destination"), "101");
    await userEvent.click(screen.getByRole("button", { name: "Restaurer" }));
    expect(sendApi).toHaveBeenLastCalledWith("POST", "/api/raindrops/unrestore", { ids: [3000], toCollectionId: 101 });
  });

  // La restauration réussie doit se VOIR dans la fiche (audit du 2026-09-23) :
  // sans invalider le détail, la fiche gardait le signet « en corbeille »
  // et son bouton Restaurer, alors qu'il était déjà revenu.
  it("après une restauration réussie, la fiche relit le signet — plus de « Restaurer »", async () => {
    let enCorbeille = true;
    getApi.mockImplementation((path: string) =>
      path === "/api/raindrops/3000"
        ? Promise.resolve(raindrop({ id: 3000, collectionId: enCorbeille ? -99 : 101 }))
        : path === "/api/jobs" ? Promise.resolve([])
        : path === "/api/backup/archives" ? Promise.resolve({ ids: [], octets: 0 })
        : undefined,
    );
    sendApi.mockImplementation(async () => {
      enCorbeille = false;
      return { restored: 1, unknown: [] };
    });
    renderDetail();
    await screen.findByText("Article exemple");
    await userEvent.click(screen.getByRole("button", { name: "Restaurer" }));
    expect(await screen.findByRole("button", { name: "Mettre à la corbeille" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restaurer" })).not.toBeInTheDocument();
  });
});

// Audit UX du 2026-09-24 (proposition 2, « Annuler » après la corbeille) :
// la fiche n'invalidait pas SA requête — elle gardait l'état d'avant et
// reproposait « Mettre à la corbeille », dont un second envoi, sur un signet
// déjà corbeillé, le détruisait. Rafraîchie, la fiche devient l'« Annuler » :
// elle dit « Dans la corbeille » et porte « Restaurer ».
describe("DetailPane — après « Mettre à la corbeille »", () => {
  it("la fiche se rafraîchit : « Dans la corbeille », « Restaurer » — plus de re-corbeille", async () => {
    let enCorbeille = false;
    getApi.mockImplementation((path: string) =>
      path === "/api/raindrops/3000" ? Promise.resolve(raindrop({ id: 3000, collectionId: enCorbeille ? -99 : 101 })) : undefined,
    );
    sendApi.mockImplementation(async () => {
      enCorbeille = true;
      return { deleted: true };
    });
    renderDetail();
    await userEvent.click(await screen.findByRole("button", { name: "Mettre à la corbeille" }));
    expect(await screen.findByRole("button", { name: "Restaurer" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Dans la corbeille");
    expect(screen.queryByRole("button", { name: "Mettre à la corbeille" })).not.toBeInTheDocument();
  });

  it("un double clic n'envoie qu'UNE mise à la corbeille", async () => {
    getApi.mockImplementation((path: string) =>
      path === "/api/raindrops/3000" ? Promise.resolve(raindrop({ id: 3000, collectionId: 101 })) : undefined,
    );
    let liberer!: () => void;
    sendApi.mockImplementation(() => new Promise((r) => { liberer = () => r({ deleted: true }); }));
    renderDetail();
    const bouton = await screen.findByRole("button", { name: "Mettre à la corbeille" });
    await userEvent.dblClick(bouton);
    expect(sendApi).toHaveBeenCalledTimes(1);
    liberer();
  });
});
