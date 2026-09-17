import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { DragProvider, useDrag } from "../state/drag";
import { FantomeDrag } from "./FantomeDrag";

// Ce que la liste fait quand le seuil est franchi, puis au relâchement.
const Pilote = () => {
  const { commencer, terminer } = useDrag();
  return (
    <>
      <button type="button" onClick={() => commencer([1000], "Article exemple")}>tirer-un</button>
      <button type="button" onClick={() => commencer([1, 2, 3], "3 signets")}>tirer-trois</button>
      <button type="button" onClick={() => { terminer(); }}>lacher</button>
    </>
  );
};

const rendu = () =>
  render(
    <DragProvider>
      <Pilote />
      <FantomeDrag />
    </DragProvider>,
  );

const bouger = (x: number, y: number) =>
  act(() => {
    window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: x, clientY: y }));
  });

describe("FantomeDrag", () => {
  it("n'existe pas au repos, apparaît pendant le déplacement, repart avec lui", () => {
    rendu();
    expect(screen.queryByTestId("fantome-drag")).not.toBeInTheDocument();
    act(() => { screen.getByText("tirer-un").click(); });
    expect(screen.getByTestId("fantome-drag")).toHaveTextContent("Article exemple");
    act(() => { screen.getByText("lacher").click(); });
    expect(screen.queryByTestId("fantome-drag")).not.toBeInTheDocument();
  });

  it("annonce le LOT quand il y en a plusieurs", () => {
    rendu();
    act(() => { screen.getByText("tirer-trois").click(); });
    expect(screen.getByTestId("fantome-drag")).toHaveTextContent("3 signets");
  });

  // Il se déplace par transform, hors de l'état React : un rendu par pixel
  // ferait ramer une liste de 12 000 lignes.
  it("suit le curseur sans passer par un rendu", () => {
    rendu();
    act(() => { screen.getByText("tirer-un").click(); });
    bouger(300, 200);
    const el = screen.getByTestId("fantome-drag");
    expect(el.style.transform).toBe("translate(312px, 210px)");
    bouger(50, 60);
    expect(el.style.transform).toBe("translate(62px, 70px)");
  });

  // Sans cela, tirer sélectionne le texte traversé : la page vire au bleu
  // et le geste s'achève sur une sélection dont personne n'a voulu.
  it("suspend la sélection de texte le temps du geste, et la rend ensuite", () => {
    rendu();
    expect(document.body.style.userSelect).toBe("");
    act(() => { screen.getByText("tirer-un").click(); });
    expect(document.body.style.userSelect).toBe("none");
    act(() => { screen.getByText("lacher").click(); });
    expect(document.body.style.userSelect).toBe("");
  });

  // Inerte au pointeur : posé sous le curseur, il intercepterait le survol
  // de la collection que l'on vise, et le dépôt tomberait à côté.
  it("n'intercepte jamais le pointeur", () => {
    rendu();
    act(() => { screen.getByText("tirer-un").click(); });
    expect(screen.getByTestId("fantome-drag").className).toContain("pointer-events-none");
  });
});
