import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { useAppState, AppStateProvider } from "../state/appState";
import { DragProvider, useDrag } from "../state/drag";
import { useDragBookmark } from "./useDragBookmark";

const { sendApi } = vi.hoisted(() => ({ sendApi: vi.fn() }));
vi.mock("../lib/api", () => ({ api: { get: vi.fn(), send: sendApi } }));

beforeEach(() => {
  sendApi.mockReset().mockResolvedValue({ moved: 1 });
});

// Harnais : un « signet » dragable, un compteur d'ouvertures du détail, et
// une cible par SORTE de dépôt — la corbeille, les favoris, « Tous », une
// étiquette ne déplacent plus : chaque sorte a son verbe.
function Harness({ cocher = [] as number[] }) {
  const { toggleSelect, selectedRaindropId, selectRaindrop, go } = useAppState();
  const { survoler } = useDrag();
  const { poignee, enCours, erreur } = useDragBookmark();
  return (
    <>
      <button type="button" onClick={() => cocher.forEach((id) => toggleSelect(id))}>cocher</button>
      <button type="button" onClick={() => go({ kind: "list", collectionId: -99, label: "Corbeille" })}>aller-corbeille</button>
      <button type="button" onClick={() => survoler({ sorte: "collection", id: 101 })}>survoler-coll</button>
      <button type="button" onClick={() => survoler({ sorte: "tous" })}>survoler-tous</button>
      <button type="button" onClick={() => survoler({ sorte: "favoris" })}>survoler-favoris</button>
      <button type="button" onClick={() => survoler({ sorte: "corbeille" })}>survoler-corbeille</button>
      <button type="button" onClick={() => survoler({ sorte: "tag", nom: "rust" })}>survoler-tag</button>
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
});

// Les dépôts par cible : chaque sorte de `CibleDepot` a SON verbe.
describe("les dépôts par cible", () => {
  // Demande du 2026-09-20 : « Tout (sort le signet de sa collection) » —
  // déposer sur « Tous » emmène le signet en NON CLASSÉS (-1), destination
  // réelle côté API ; « Tous » lui-même n'est pas un lieu.
  it("déposer sur « Tous » sort le signet de sa collection (non classés)", async () => {
    rendu();
    const ligne = screen.getByTestId("ligne-1000");
    pointer(ligne, "pointerdown", 100, 100);
    fenetre("pointermove", 110, 100);
    act(() => { screen.getByText("survoler-tous").click(); });
    fenetre("pointerup", 110, 100);
    await act(async () => { await Promise.resolve(); });
    expect(sendApi).toHaveBeenCalledWith("POST", "/api/raindrops/bulk", {
      operation: "move", collection_id: 0, ids: [1000], to_collection_id: -1,
    });
  });

  it("déposer sur « Favoris » marque les signets favoris (bulk update, non destructeur)", async () => {
    rendu();
    const ligne = screen.getByTestId("ligne-1000");
    pointer(ligne, "pointerdown", 100, 100);
    fenetre("pointermove", 110, 100);
    act(() => { screen.getByText("survoler-favoris").click(); });
    fenetre("pointerup", 110, 100);
    await act(async () => { await Promise.resolve(); });
    expect(sendApi).toHaveBeenCalledWith("POST", "/api/raindrops/bulk", {
      operation: "update", collection_id: 0, ids: [1000], important: true,
    });
  });

  // La sélection tirée ne transporte pas les origines : le sidecar les LIT
  // (bulk-trash), la restauration à l'origine ne se dégrade jamais.
  it("déposer sur la corbeille met à la corbeille via la route des origines", async () => {
    rendu();
    const ligne = screen.getByTestId("ligne-1000");
    pointer(ligne, "pointerdown", 100, 100);
    fenetre("pointermove", 110, 100);
    act(() => { screen.getByText("survoler-corbeille").click(); });
    fenetre("pointerup", 110, 100);
    await act(async () => { await Promise.resolve(); });
    expect(sendApi).toHaveBeenCalledWith("POST", "/api/raindrops/bulk-trash", { ids: [1000] });
  });

  it("déposer sur une étiquette marque les signets avec SON union", async () => {
    rendu();
    const ligne = screen.getByTestId("ligne-1000");
    pointer(ligne, "pointerdown", 100, 100);
    fenetre("pointermove", 110, 100);
    act(() => { screen.getByText("survoler-tag").click(); });
    fenetre("pointerup", 110, 100);
    await act(async () => { await Promise.resolve(); });
    expect(sendApi).toHaveBeenCalledWith("POST", "/api/raindrops/bulk-tag", { ids: [1000], tag: "rust" });
  });

  it("déposer sur une collection déplace le signet tiré", async () => {
    rendu();
    const ligne = screen.getByTestId("ligne-1000");
    pointer(ligne, "pointerdown", 100, 100);
    fenetre("pointermove", 110, 100);
    act(() => { screen.getByText("survoler-coll").click(); });
    fenetre("pointerup", 110, 100);
    await act(async () => { await Promise.resolve(); });
    expect(sendApi).toHaveBeenCalledWith("POST", "/api/raindrops/bulk", {
      operation: "move", collection_id: 0, ids: [1000], to_collection_id: 101,
    });
  });

  // La SOURCE du bulk move est la collection D'OÙ l'on tire (trap compilé
  // MCP : `PUT /raindrops/{collection_id}`). Depuis la liste Corbeille, les
  // ids vivent en -99 : déposer sur une collection les en FAIT SORTIR —
  // `PUT /raindrops/-99` — la destination choisie par le dépôt. Depuis 0,
  // Raindrop ne trouvait rien à déplacer : rien ne sortait jamais de la
  // corbeille par drag (défaut signalé 2026-09-20).
  it("depuis la corbeille, déposer sur une collection les en sort (source -99)", async () => {
    rendu();
    act(() => { screen.getByText("aller-corbeille").click(); });
    const ligne = screen.getByTestId("ligne-1000");
    pointer(ligne, "pointerdown", 100, 100);
    fenetre("pointermove", 110, 100);
    act(() => { screen.getByText("survoler-coll").click(); });
    fenetre("pointerup", 110, 100);
    await act(async () => { await Promise.resolve(); });
    expect(sendApi).toHaveBeenCalledWith("POST", "/api/raindrops/bulk", {
      operation: "move", collection_id: -99, ids: [1000], to_collection_id: 101,
    });
  });

  it("depuis la corbeille, déposer sur « Tous » sort vers les non classés (source -99)", async () => {
    rendu();
    act(() => { screen.getByText("aller-corbeille").click(); });
    const ligne = screen.getByTestId("ligne-1000");
    pointer(ligne, "pointerdown", 100, 100);
    fenetre("pointermove", 110, 100);
    act(() => { screen.getByText("survoler-tous").click(); });
    fenetre("pointerup", 110, 100);
    await act(async () => { await Promise.resolve(); });
    expect(sendApi).toHaveBeenCalledWith("POST", "/api/raindrops/bulk", {
      operation: "move", collection_id: -99, ids: [1000], to_collection_id: -1,
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
    act(() => { screen.getByText("survoler-coll").click(); });
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
    act(() => { screen.getByText("survoler-coll").click(); });
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
    act(() => { screen.getByText("survoler-coll").click(); });
    fenetre("pointerup", 110, 100);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByTestId("erreur").textContent).toBe("réseau perdu");
  });
});

describe("la garde de sélection pendant le geste", () => {
  // Le correctif vivait dans FantomeDrag, au RENDU du fantôme — quelques
  // frames après le franchissement du seuil : WebKit avait déjà amorcé la
  // sélection sur les zones TRAVERSÉES (barre latérale, fiche), là où le
  // texte reste sélectionnable. La garde vit donc AU POINTERDOWN, avant
  // tout pixel, dans le geste lui-même.
  // MESURÉ dans le vrai WebKit (sonde, 2026-09-22) : la forme STANDARD
  // `style.userSelect` y est IGNORÉE — le computed reste `text` — quand la
  // forme PRÉFIXÉE décide. La garde est donc une FEUILLE DE STYLE qui pose
  // les deux formes en CSS pur (comme le fichier Tailwind), et qui se
  // retire à la fin du geste. jsdom ignore les propriétés préfixées dans
  // style.setProperty : l'assertion porte sur l'élément et son contenu.
  const gardeDrag = () => document.head.querySelector("style[data-garde-drag]");

  it("le pointerdown pose la garde (deux formes), le pointerup la retire", () => {
    const { getByTestId } = rendu();
    expect(gardeDrag()).toBeNull();
    pointer(getByTestId("ligne-1000"), "pointerdown", 0, 0);
    const garde = gardeDrag();
    expect(garde).not.toBeNull();
    expect(garde!.textContent).toContain("user-select: none");
    expect(garde!.textContent).toContain("-webkit-user-select: none");
    fenetre("pointerup", 0, 0);
    expect(gardeDrag()).toBeNull();
  });

  it("un clic simple (seuil non franchi) ne laisse RIEN posé", () => {
    const { getByTestId } = rendu();
    pointer(getByTestId("ligne-1000"), "pointerdown", 0, 0);
    fenetre("pointerup", 2, 2); // sous les 5 px : c'est un clic
    expect(gardeDrag()).toBeNull();
  });

  it("un drag complet restaure à la fin", () => {
    const { getByTestId } = rendu();
    pointer(getByTestId("ligne-1000"), "pointerdown", 0, 0);
    fenetre("pointermove", 30, 0); // seuil franchi
    expect(gardeDrag()).not.toBeNull();
    fenetre("pointerup", 30, 0);
    expect(gardeDrag()).toBeNull();
  });

  it("un pointercancel restaure aussi (filet : geste interrompu par le système)", () => {
    const { getByTestId } = rendu();
    pointer(getByTestId("ligne-1000"), "pointerdown", 0, 0);
    fenetre("pointercancel", 30, 0);
    expect(gardeDrag()).toBeNull();
  });
});
