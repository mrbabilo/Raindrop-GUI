import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { PoigneeFiche } from "./PoigneeFiche";
import { useLargeurFiche } from "../lib/panneaux";

// Audit d'ergonomie du 2026-09-24 : la fiche vivait à 320 px fixes — une
// note longue ou une série de surlignages s'y lisait à l'étroit, et rien ne
// rendait la place à la liste. Une poignée sur son bord gauche, à la souris
// ET au clavier (un séparateur ARIA), retenue d'une session à l'autre.
const Harnais = () => {
  const { largeur, regler } = useLargeurFiche();
  return (
    <>
      <span data-testid="largeur">{largeur}</span>
      <PoigneeFiche largeur={largeur} regler={regler} />
    </>
  );
};
const largeur = () => Number(screen.getByTestId("largeur").textContent);
const poignee = () => screen.getByRole("separator", { name: "Largeur de la fiche" });

describe("PoigneeFiche — la fiche se redimensionne", () => {
  it("un séparateur nommé, qui dit sa valeur et ses bornes", () => {
    render(<Harnais />);
    expect(poignee()).toHaveAttribute("aria-orientation", "vertical");
    expect(poignee()).toHaveAttribute("aria-valuenow", "320");
    expect(poignee()).toHaveAttribute("aria-valuemin", "280");
    expect(poignee()).toHaveAttribute("aria-valuemax", "560");
  });

  it("au clavier : ← élargit (le bord part à gauche), → rétrécit — dans les bornes", () => {
    render(<Harnais />);
    fireEvent.keyDown(poignee(), { key: "ArrowLeft" });
    expect(largeur()).toBe(336);
    fireEvent.keyDown(poignee(), { key: "ArrowRight" });
    fireEvent.keyDown(poignee(), { key: "ArrowRight" });
    fireEvent.keyDown(poignee(), { key: "ArrowRight" });
    fireEvent.keyDown(poignee(), { key: "ArrowRight" });
    expect(largeur()).toBe(280);
  });

  it("à la souris : tirer le bord vers la gauche élargit ; relâcher arrête", () => {
    render(<Harnais />);
    // jsdom n'a pas de PointerEvent : un MouseEvent du bon type porte clientX
    // (même contournement que useDragBookmark.test).
    act(() => { poignee().dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 500, button: 0 })); });
    act(() => { window.dispatchEvent(new MouseEvent("pointermove", { clientX: 420 })); });
    expect(largeur()).toBe(400);
    act(() => { window.dispatchEvent(new MouseEvent("pointermove", { clientX: -1000 })); });
    expect(largeur()).toBe(560);
    act(() => { window.dispatchEvent(new MouseEvent("pointerup", { clientX: -1000 })); });
    act(() => { window.dispatchEvent(new MouseEvent("pointermove", { clientX: 500 })); });
    expect(largeur()).toBe(560);
  });

  it("double-clic : retour à la largeur d'origine", () => {
    render(<Harnais />);
    fireEvent.keyDown(poignee(), { key: "ArrowLeft" });
    fireEvent.doubleClick(poignee());
    expect(largeur()).toBe(320);
  });

  it("la largeur survit au relancement", () => {
    const { unmount } = render(<Harnais />);
    fireEvent.keyDown(poignee(), { key: "ArrowLeft" });
    unmount();
    render(<Harnais />);
    expect(largeur()).toBe(336);
  });
});
