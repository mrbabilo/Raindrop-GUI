import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LancementAnalyse } from "./LancementAnalyse";

// Proposition 3 de l'audit UX : l'analyse des liens envoie une requête vers
// le serveur de CHAQUE adresse de la bibliothèque — des milliers de sites
// tiers, d'un seul clic, sans rien en dire. Le premier clic ANNONCE, le
// second lance ; renoncer ne lance rien.
describe("LancementAnalyse", () => {
  it("sans annonce : un clic lance", async () => {
    const lancer = vi.fn();
    render(<LancementAnalyse libelle="Lancer l'analyse" lancer={lancer} />);
    await userEvent.click(screen.getByRole("button", { name: "Lancer l'analyse" }));
    expect(lancer).toHaveBeenCalledTimes(1);
  });

  it("avec annonce : le premier clic annonce sans lancer, la confirmation lance", async () => {
    const lancer = vi.fn();
    render(<LancementAnalyse libelle="Lancer l'analyse" annonce="Ce qui va partir." lancer={lancer} />);
    await userEvent.click(screen.getByRole("button", { name: "Lancer l'analyse" }));
    expect(lancer).not.toHaveBeenCalled();
    expect(screen.getByRole("note")).toHaveTextContent("Ce qui va partir.");
    await userEvent.click(screen.getByRole("button", { name: "Lancer la vérification" }));
    expect(lancer).toHaveBeenCalledTimes(1);
    // Lancé, l'annonce se referme.
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("« Ne pas lancer » referme l'annonce sans rien lancer — et le geste se rejoue", async () => {
    const lancer = vi.fn();
    render(<LancementAnalyse libelle="Lancer l'analyse" annonce="Ce qui va partir." lancer={lancer} />);
    await userEvent.click(screen.getByRole("button", { name: "Lancer l'analyse" }));
    await userEvent.click(screen.getByRole("button", { name: "Ne pas lancer" }));
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(lancer).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Lancer l'analyse" })).toBeEnabled();
  });
});
