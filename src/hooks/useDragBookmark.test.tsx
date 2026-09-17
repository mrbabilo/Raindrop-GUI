import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { useAppState, AppStateProvider } from "../state/appState";
import { DragProvider, useDrag } from "../state/drag";
import { useDragBookmark, depotPermis } from "./useDragBookmark";

const { sendApi } = vi.hoisted(() => ({ sendApi: vi.fn() }));
vi.mock("../lib/api", () => ({ api: { get: vi.fn(), send: sendApi } }));

beforeEach(() => {
  sendApi.mockReset().mockResolvedValue({ moved: 1 });
});

// Harnais : un « signet » dragable et un compteur d'ouvertures du détail —
// c'est par là qu'on vérifie qu'un drag n'ouvre pas la fiche au relâchement.
function Harness({ cocher = [] as number[] }) {
  const { toggleSelect, selectedRaindropId, selectRaindrop } = useAppState();
  const { survoler } = useDrag();
  const { poignee, enCours, erreur } = useDragBookmark();
  return (
    <>
      <button type="button" onClick={() => cocher.forEach((id) => toggleSelect(id))}>cocher</button>
      {/* Ce que fait la Sidebar au survol d'une collection pendant un drag. */}
      <button type="button" onClick={() => survoler(101)}>survoler-101</button>
      <div
        data-testid="ligne-1000"
        {...poignee(1000, () => selectRaindrop(1000))}
      >
        signet 1000
      </div>
      <span data-testid="detail">{selectedRaindropId ?? ""}</span>
      <span data-testid="encours">{enCours ? "oui" : "non"}</span>
      <span data-testid="erreur">{erreur ?? ""}</span>
    </>
  );
}

const rendu = (cocher: number[] = []) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppStateProvider>
        <DragProvider>
          <Harness cocher={cocher} />
        </DragProvider>
      </AppStateProvider>
    </QueryClientProvider>,
  );

// jsdom n'émet pas de PointerEvent : on pose des MouseEvent typés `pointer*`,
// que React écoute de la même façon (les handlers onPointer* sont branchés
// sur ces noms d'événements natifs).
// clientX/clientY sont en lecture seule sur l'instance : ils se posent par
// le constructeur (MouseEventInit), pas par Object.assign.
const pointer = (el: Element, type: string, x: number, y: number) =>
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
  });

const fenetre = (type: string, x: number, y: number) =>
  act(() => {
    window.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }));
  });

describe("depotPermis", () => {
  // La corbeille n'est pas une destination : y déposer effacerait un signet
  // par un geste de glissement, sans confirmation — la mise à la corbeille
  // passe par un verbe nommé (§10), jamais par un déplacement.
  it("refuse la corbeille et les vues qui ne sont pas des collections", () => {
    expect(depotPermis(-99)).toBe(false); // corbeille
    expect(depotPermis(0)).toBe(false);   // « Tous » n'est pas un lieu
    expect(depotPermis(-2)).toBe(false);  // marqueur front (Non-lus)
    expect(depotPermis(-3)).toBe(false);  // marqueur front (Favoris)
  });

  it("accepte une vraie collection, classée ou non", () => {
    expect(depotPermis(101)).toBe(true);
    expect(depotPermis(-1)).toBe(true); // non classés : une destination réelle
  });
});

describe("useDragBookmark", () => {
  it("ne commence rien sous le seuil de 5 px — un clic reste un clic", () => {
    rendu();
    const ligne = screen.getByTestId("ligne-1000");
    pointer(ligne, "pointerdown", 100, 100);
    fenetre("pointermove", 103, 101); // 3 px : en deçà
    expect(screen.getByTestId("encours").textContent).toBe("non");
    fenetre("pointerup", 103, 101);
    // Le geste n'ayant jamais été un drag, le clic ouvre la fiche.
    pointer(ligne, "click", 103, 101);
    expect(screen.getByTestId("detail").textContent).toBe("1000");
  });

  it("commence au-delà du seuil, et le relâchement n'ouvre pas la fiche", () => {
    rendu();
    const ligne = screen.getByTestId("ligne-1000");
    pointer(ligne, "pointerdown", 100, 100);
    fenetre("pointermove", 110, 100); // 10 px : franchi
    expect(screen.getByTestId("encours").textContent).toBe("oui");
    fenetre("pointerup", 110, 100);
    pointer(ligne, "click", 110, 100);
    expect(screen.getByTestId("detail").textContent).toBe("");
  });

  it("déposer sur une collection déplace le signet tiré", async () => {
    rendu();
    const ligne = screen.getByTestId("ligne-1000");
    pointer(ligne, "pointerdown", 100, 100);
    fenetre("pointermove", 110, 100);
    act(() => { screen.getByText("survoler-101").click(); });
    fenetre("pointerup", 110, 100);
    await act(async () => { await Promise.resolve(); });
    expect(sendApi).toHaveBeenCalledWith("POST", "/api/raindrops/bulk", {
      operation: "move", collection_id: 0, ids: [1000], to_collection_id: 101,
    });
  });

  it("relâcher hors d'une cible ne déplace rien", async () => {
    rendu();
    const ligne = screen.getByTestId("ligne-1000");
    pointer(ligne, "pointerdown", 100, 100);
    fenetre("pointermove", 110, 100);
    fenetre("pointerup", 110, 100);
    await act(async () => { await Promise.resolve(); });
    expect(sendApi).not.toHaveBeenCalled();
  });

  // « Sélection liée » : tirer un signet COCHÉ emmène toute la sélection.
  it("tirer un signet coché emmène toute la sélection", async () => {
    rendu([1000, 1001, 1002]);
    act(() => { screen.getByText("cocher").click(); });
    const ligne = screen.getByTestId("ligne-1000");
    pointer(ligne, "pointerdown", 100, 100);
    fenetre("pointermove", 110, 100);
    act(() => { screen.getByText("survoler-101").click(); });
    fenetre("pointerup", 110, 100);
    await act(async () => { await Promise.resolve(); });
    const [, , body] = sendApi.mock.calls[0]!;
    expect((body as { ids: number[] }).ids.sort()).toEqual([1000, 1001, 1002]);
  });

  // Un signet NON coché ne s'agrège pas à une sélection existante : on tire
  // ce qu'on montre, pas ce qui est coché ailleurs.
  it("tirer un signet non coché n'emmène que lui, même s'il existe une sélection", async () => {
    rendu([2000, 2001]);
    act(() => { screen.getByText("cocher").click(); });
    const ligne = screen.getByTestId("ligne-1000");
    pointer(ligne, "pointerdown", 100, 100);
    fenetre("pointermove", 110, 100);
    act(() => { screen.getByText("survoler-101").click(); });
    fenetre("pointerup", 110, 100);
    await act(async () => { await Promise.resolve(); });
    const [, , body] = sendApi.mock.calls[0]!;
    expect((body as { ids: number[] }).ids).toEqual([1000]);
  });

  // R8P-1 : un échec d'écriture s'affiche, il ne disparaît pas en silence.
  it("un déplacement en échec expose son erreur", async () => {
    sendApi.mockRejectedValue(new Error("réseau perdu"));
    rendu();
    const ligne = screen.getByTestId("ligne-1000");
    pointer(ligne, "pointerdown", 100, 100);
    fenetre("pointermove", 110, 100);
    act(() => { screen.getByText("survoler-101").click(); });
    fenetre("pointerup", 110, 100);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByTestId("erreur").textContent).toBe("réseau perdu");
  });
});
