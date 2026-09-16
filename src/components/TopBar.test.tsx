import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopBar } from "./TopBar";
import { AppStateProvider, useAppState } from "../state/appState";

const Spy = () => {
  const { view } = useAppState();
  return <span data-testid="view">{view.kind === "list" ? JSON.stringify(view) : view.kind}</span>;
};

const renderTop = () =>
  render(<AppStateProvider><Spy /><TopBar /></AppStateProvider>);

describe("TopBar", () => {
  it("la recherche (debounce 300 ms) met à jour la vue", async () => {
    // Vrais timers, délai réel : l'asyncWrapper de RTL-react attend un
    // setTimeout(0) après chaque appel user-event et n'avance une horloge
    // fake QUE si un global `jest` existe (helpers.js) — sous vitest, sans
    // lui, `await user.type(...)` pendrait. L'attente réelle teste le même
    // contrat : rien avant la pause de saisie, la recherche après 350 ms.
    renderTop();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Rechercher…"), "rust");
    expect(JSON.parse(screen.getByTestId("view").textContent!)).not.toMatchObject({ search: "rust" });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({ search: "rust" });
  });

  it("le tri et la bascule mosaïque mettent à jour la vue", async () => {
    renderTop();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Tri"), "title");
    await user.click(screen.getByRole("button", { name: "Mosaïque" }));
    const v = JSON.parse(screen.getByTestId("view").textContent!);
    expect(v.sort).toBe("title");
    expect(v.viewMode).toBe("mosaic");
  });

  it("filtres avancés : domaine, média, dates → query", async () => {
    renderTop();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Domaine"), "example.com");
    await user.selectOptions(screen.getByLabelText("Type de média"), "article");
    await user.type(screen.getByLabelText("Depuis"), "2025-01-01");
    await user.type(screen.getByLabelText("Jusqu'à"), "2025-12-31");
    const v = JSON.parse(screen.getByTestId("view").textContent!);
    expect(v).toMatchObject({ domain: "example.com", media: "article", createdStart: "2025-01-01", createdEnd: "2025-12-31" });
  });
});
