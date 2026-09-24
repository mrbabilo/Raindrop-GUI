import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { useAppState, AppStateProvider } from "../state/appState";
import { DragProvider, useDrag } from "../state/drag";
import { useDragBookmark } from "./useDragBookmark";

// Audit d'ergonomie du 2026-09-24 : un dépôt RÉUSSI ne disait rien — la
// ligne disparaissait, et c'était tout. L'avis dit ce qui s'est passé, et
// « Annuler » est offert là où il est SÛR : un déplacement (chaque signet
// retourne d'où il venait — la liste le sait), une mise à la corbeille dont
// aucun signet n'y était déjà.
const { sendApi } = vi.hoisted(() => ({ sendApi: vi.fn() }));
vi.mock("../lib/api", () => ({ api: { get: vi.fn(), send: sendApi } }));

beforeEach(() => {
  sendApi.mockReset().mockImplementation(async (_m: string, chemin: string) =>
    chemin === "/api/raindrops/bulk-trash" ? { corbeille: 2, deja: 0, echecs: [] } : {});
});

// 1000 vient de Dev (101), 1001 de Design (102).
const ORIGINES = new Map([[1000, 101], [1001, 102]]);

function Harness() {
  const { toggleSelect } = useAppState();
  const { survoler } = useDrag();
  const { poignee, avis } = useDragBookmark([1000, 1001], ORIGINES);
  return (
    <>
      <button type="button" onClick={() => { toggleSelect(1000); toggleSelect(1001); }}>cocher</button>
      <button type="button" onClick={() => survoler({ sorte: "collection", id: 201 })}>survoler-coll</button>
      <button type="button" onClick={() => survoler({ sorte: "corbeille" })}>survoler-corbeille</button>
      <button type="button" onClick={() => survoler({ sorte: "tag", nom: "rust" })}>survoler-tag</button>
      <div data-testid="ligne" {...poignee(1000, () => undefined)}>signet</div>
      <span data-testid="avis">{avis?.texte ?? ""}</span>
      {avis?.annuler && <button type="button" onClick={avis.annuler}>annuler</button>}
    </>
  );
}

const pointer = (el: Element, type: string, x: number) =>
  act(() => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 100, button: 0 })); });
const fenetre = (type: string, x: number) =>
  act(() => { window.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: 100, button: 0 })); });

async function deposerSur(cible: string) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppStateProvider><DragProvider><Harness /></DragProvider></AppStateProvider>
    </QueryClientProvider>,
  );
  act(() => { screen.getByText("cocher").click(); });
  pointer(screen.getByTestId("ligne"), "pointerdown", 100);
  fenetre("pointermove", 120);
  act(() => { screen.getByText(cible).click(); });
  fenetre("pointerup", 120);
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

describe("useDragBookmark — un dépôt réussi se dit, et se défait quand c'est sûr", () => {
  it("déplacement : l'avis le dit ; Annuler renvoie chaque signet dans SA collection d'origine", async () => {
    await deposerSur("survoler-coll");
    expect(screen.getByTestId("avis").textContent).toBe("2 signets déplacés");
    sendApi.mockClear();
    await act(async () => { screen.getByText("annuler").click(); await new Promise((r) => setTimeout(r, 0)); });
    expect(sendApi).toHaveBeenCalledWith("POST", "/api/raindrops/bulk", { operation: "move", collection_id: 0, ids: [1000], to_collection_id: 101 });
    expect(sendApi).toHaveBeenCalledWith("POST", "/api/raindrops/bulk", { operation: "move", collection_id: 0, ids: [1001], to_collection_id: 102 });
    expect(screen.getByTestId("avis").textContent).toBe(""); // défait : l'avis s'efface
  });

  it("corbeille : l'avis compte ce qui est parti ; Annuler restaure", async () => {
    await deposerSur("survoler-corbeille");
    expect(screen.getByTestId("avis").textContent).toBe("2 signets mis à la corbeille");
    sendApi.mockClear();
    await act(async () => { screen.getByText("annuler").click(); await new Promise((r) => setTimeout(r, 0)); });
    expect(sendApi).toHaveBeenCalledWith("POST", "/api/raindrops/unrestore", { ids: [1000, 1001] });
  });

  it("corbeille avec des signets qui y étaient DÉJÀ : pas d'Annuler — il restaurerait ce qu'on n'a pas mis là", async () => {
    sendApi.mockImplementation(async () => ({ corbeille: 1, deja: 1, echecs: [] }));
    await deposerSur("survoler-corbeille");
    expect(screen.getByTestId("avis").textContent).toBe("1 signet mis à la corbeille");
    expect(screen.queryByText("annuler")).not.toBeInTheDocument();
  });

  it("étiquette : l'avis le dit, sans Annuler (on ne sait pas qui la portait déjà)", async () => {
    sendApi.mockImplementation(async () => ({ marques: 2, deja: 0, echecs: [] }));
    await deposerSur("survoler-tag");
    expect(screen.getByTestId("avis").textContent).toBe("« rust » posée sur 2 signets");
    expect(screen.queryByText("annuler")).not.toBeInTheDocument();
  });
});
