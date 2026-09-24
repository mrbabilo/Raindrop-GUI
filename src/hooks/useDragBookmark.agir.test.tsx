import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { AppStateProvider } from "../state/appState";
import { DragProvider, type CibleDepot } from "../state/drag";
import { useDragBookmark } from "./useDragBookmark";

// Audit d'ergonomie du 2026-09-24 : déplacer plusieurs signets n'existait
// qu'à la SOURIS (écart spec §115). La barre de sélection joue désormais les
// mêmes verbes que le dépôt, sans geste : `agir` — mêmes routes, même avis,
// même Annuler. Sa promesse dit si l'action a réussi (la barre ne vide la
// sélection qu'à ce prix).
const { sendApi } = vi.hoisted(() => ({ sendApi: vi.fn() }));
vi.mock("../lib/api", () => ({ api: { get: vi.fn(), send: sendApi } }));

beforeEach(() => {
  sendApi.mockReset().mockImplementation(async (_m: string, chemin: string) =>
    chemin === "/api/raindrops/bulk-trash" ? { corbeille: 2, deja: 0, echecs: [] } : {});
});

const ORIGINES = new Map([[1000, 101], [1001, 102]]);
let verdict: boolean | undefined;

function Harness({ cible }: { cible: CibleDepot }) {
  const { agir, avis, erreur } = useDragBookmark([1000, 1001], ORIGINES);
  return (
    <>
      <button type="button" onClick={() => void agir([1000, 1001], cible).then((ok) => { verdict = ok; })}>agir</button>
      <span data-testid="avis">{avis?.texte ?? ""}</span>
      <span data-testid="erreur">{erreur ?? ""}</span>
      {avis?.annuler && <button type="button" onClick={avis.annuler}>annuler</button>}
    </>
  );
}

const lancer = async (cible: CibleDepot) => {
  verdict = undefined;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppStateProvider><DragProvider><Harness cible={cible} /></DragProvider></AppStateProvider>
    </QueryClientProvider>,
  );
  await act(async () => { screen.getByText("agir").click(); await new Promise((r) => setTimeout(r, 0)); });
};

describe("useDragBookmark — agir : les verbes du dépôt, sans le geste", () => {
  it("déplacer : même route que le dépôt, avis, Annuler vers les origines, promesse vraie", async () => {
    await lancer({ sorte: "collection", id: 201 });
    expect(sendApi).toHaveBeenCalledWith("POST", "/api/raindrops/bulk", { operation: "move", collection_id: 0, ids: [1000, 1001], to_collection_id: 201 });
    expect(screen.getByTestId("avis").textContent).toBe("2 signets déplacés");
    expect(verdict).toBe(true);
    sendApi.mockClear();
    await act(async () => { screen.getByText("annuler").click(); await new Promise((r) => setTimeout(r, 0)); });
    expect(sendApi).toHaveBeenCalledWith("POST", "/api/raindrops/bulk", { operation: "move", collection_id: 0, ids: [1000], to_collection_id: 101 });
  });

  it("corbeille : les origines sont lues par le sidecar (bulk-trash), Annuler restaure", async () => {
    await lancer({ sorte: "corbeille" });
    expect(sendApi).toHaveBeenCalledWith("POST", "/api/raindrops/bulk-trash", { ids: [1000, 1001] });
    expect(screen.getByTestId("avis").textContent).toBe("2 signets mis à la corbeille");
    expect(screen.getByText("annuler")).toBeInTheDocument();
  });

  it("un échec se dit, et la promesse est fausse — la barre garde la sélection", async () => {
    sendApi.mockRejectedValueOnce(new Error("http 502"));
    await lancer({ sorte: "corbeille" });
    expect(verdict).toBe(false);
    expect(screen.getByTestId("erreur").textContent).toBe("http 502");
    expect(screen.getByTestId("avis").textContent).toBe("");
  });
});
