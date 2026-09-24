import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { useDialogue } from "./useDialogue";

// Proposition 5 de l'audit UX : la palette et les Réglages sont modaux, mais
// Tab en sortait vers l'application masquée, et fermer laissait le focus
// nulle part. Le focus reste DANS le dialogue et revient à son origine.
function Dialogue() {
  const ref = useRef<HTMLDivElement>(null);
  useDialogue(ref);
  return (
    <div ref={ref} role="dialog" aria-label="d">
      <button type="button">premier</button>
      <button type="button">dernier</button>
    </div>
  );
}
function Banc() {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOuvert((o) => !o)}>origine</button>
      <button type="button">ailleurs</button>
      {ouvert && <Dialogue />}
    </>
  );
}

describe("useDialogue", () => {
  it("Tab boucle DANS le dialogue, dans les deux sens", async () => {
    render(<Banc />);
    await userEvent.click(screen.getByText("origine"));
    screen.getByText("dernier").focus();
    await userEvent.tab();
    expect(screen.getByText("premier")).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByText("dernier")).toHaveFocus();
  });

  it("à la fermeture, le focus revient à ce qui l'avait avant l'ouverture", async () => {
    render(<Banc />);
    const origine = screen.getByText("origine");
    await userEvent.click(origine); // ouvre ; le focus est sur « origine »
    screen.getByText("premier").focus();
    origine.click(); // referme (clic programmatique : le focus reste dans le dialogue)
    await screen.findByText("ailleurs");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(origine).toHaveFocus();
  });
});
