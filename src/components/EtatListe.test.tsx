import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EtatListe } from "./EtatListe";

describe("EtatListe", () => {
  // Le grief : une requête en échec laissait `isLoading` retomber et la liste
  // vide, si bien que l'écran annonçait « Rien ici » — soit l'inverse de ce
  // qui s'était passé.
  it("l'échec prime sur le vide, car c'est lui qui l'explique", () => {
    render(<EtatListe chargement={false} erreur="réseau perdu" vide />);
    expect(screen.getByRole("alert")).toHaveTextContent("réseau perdu");
    expect(screen.queryByText("Rien ici")).not.toBeInTheDocument();
  });

  it("l'échec prime aussi sur le chargement", () => {
    render(<EtatListe chargement erreur="réseau perdu" vide={false} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("Chargement…")).not.toBeInTheDocument();
  });

  // Sans reprise, il ne resterait qu'à recharger la page.
  it("propose de réessayer, et relance la requête", async () => {
    const reessayer = vi.fn();
    render(<EtatListe chargement={false} erreur="réseau perdu" vide reessayer={reessayer} />);
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(reessayer).toHaveBeenCalled();
  });

  it("sans moyen de relancer, pas de bouton mort", () => {
    render(<EtatListe chargement={false} erreur="réseau perdu" vide />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("chargement, puis vide, puis rien quand la liste a du contenu", () => {
    const { rerender, container } = render(<EtatListe chargement vide={false} />);
    expect(screen.getByText("Chargement…")).toBeInTheDocument();
    rerender(<EtatListe chargement={false} vide />);
    expect(screen.getByText("Rien ici")).toBeInTheDocument();
    rerender(<EtatListe chargement={false} vide={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  // `lastScan` ne se pose qu'à l'achèvement : pendant l'analyse, « aucune
  // analyse lancée » mentait, et le bouton relançait ce qui tourne.
  it("jamais analysé mais EN COURS : l'état se dit, sans bouton pour relancer", () => {
    const { rerender } = render(<EtatListe chargement={false} vide jamaisAnalyse analyser={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Lancer l'analyse" })).toBeInTheDocument();
    rerender(<EtatListe chargement={false} vide jamaisAnalyse analyser={vi.fn()} analyseEnCours />);
    expect(screen.getByText("Analyse en cours")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  // Une chaîne vide n'est pas une erreur : certaines couches rendent "" au
  // lieu de null, et un bandeau « Erreur :  » ne dirait rien.
  it("une erreur vide n'en est pas une", () => {
    render(<EtatListe chargement={false} erreur="" vide />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Rien ici")).toBeInTheDocument();
  });
});
