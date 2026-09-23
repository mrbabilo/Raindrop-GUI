import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { PanneauFiltres } from "./PanneauFiltres";
import { AppStateProvider, useAppState } from "../state/appState";

// Le domaine se TAPE (audit du 2026-09-23) : posé à chaque frappe, il
// changeait la clé de requête par caractère — une requête par frappe dans
// la file à 550 ms, et « Rien ici » à chaque préfixe (`domain:youtube` → 0).
// Le journal retient chaque domaine que la VUE a porté.
const journal: (string | undefined)[] = [];
const Journal = () => {
  const { view } = useAppState();
  const domaine = view.kind === "list" ? view.domain : undefined;
  useEffect(() => {
    journal.push(domaine);
  }, [domaine]);
  return null;
};

const rendre = () => {
  journal.length = 0;
  return render(
    <AppStateProvider>
      <Journal />
      <PanneauFiltres ouvert />
    </AppStateProvider>,
  );
};

describe("PanneauFiltres — le domaine se pose après la saisie", () => {
  it("un seul domaine posé pour toute la frappe, jamais ses préfixes", async () => {
    rendre();
    await userEvent.type(screen.getByLabelText("Domaine"), "youtube.com");
    await waitFor(() => expect(journal).toContain("youtube.com"));
    expect(journal).toEqual([undefined, "youtube.com"]);
  });

  it("effacer vide aussi la saisie en attente", async () => {
    rendre();
    await userEvent.type(screen.getByLabelText("Domaine"), "exemple.fr");
    await userEvent.click(screen.getByRole("button", { name: "Effacer les filtres" }));
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.getByLabelText("Domaine")).toHaveValue("");
    expect(journal).not.toContain("exemple.fr");
  });
});
