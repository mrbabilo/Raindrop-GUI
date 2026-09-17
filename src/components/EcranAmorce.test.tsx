import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Diagnostic, EcranPanne } from "./EcranAmorce";

const { relancerMock } = vi.hoisted(() => ({ relancerMock: vi.fn() }));
vi.mock("../lib/amorce", async (vrai) => ({
  ...(await vrai<object>()),
  relancer: relancerMock,
}));

beforeEach(() => {
  relancerMock.mockReset().mockResolvedValue({ ecran: "app" });
});

describe("Diagnostic", () => {
  // Le détail vient de Rust (node::Verdict) et porte la version trouvée :
  // le perdre renverrait l'utilisateur installer ce qu'il a déjà.
  it("montre le constat de Rust ET l'instruction", () => {
    render(
      <Diagnostic
        detail="Node v18.19.0 trouvé (/usr/bin/node), mais la version 20 ou supérieure est requise."
        onEtat={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Node est introuvable" })).toBeInTheDocument();
    expect(screen.getByText(/v18\.19\.0/)).toBeInTheDocument();
    expect(screen.getByText(/brew install node/)).toBeInTheDocument();
  });

  it("« Réessayer » REJOUE la séquence et remonte le nouvel état", async () => {
    const onEtat = vi.fn();
    render(<Diagnostic detail="rien trouvé" onEtat={onEtat} />);
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(relancerMock).toHaveBeenCalled();
    await waitFor(() => expect(onEtat).toHaveBeenCalledWith({ ecran: "app" }));
  });
});

describe("EcranPanne", () => {
  it("montre le détail et où regarder", () => {
    render(<EcranPanne detail="le sidecar n'a pas publié de port" onEtat={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Le service local n'a pas démarré" })).toBeInTheDocument();
    expect(screen.getByText(/n'a pas publié de port/)).toBeInTheDocument();
    expect(screen.getByText(/journal de démarrage/)).toBeInTheDocument();
  });

  it("le détail est annoncé comme une alerte", () => {
    render(<EcranPanne detail="boum" onEtat={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("boum");
  });

  // LE test qui compte. Sans cette porte, un jeton refusé enferme pour de
  // bon : il est déjà au trousseau, la séquence le relit à chaque lancement
  // et échoue pareil, et aucun écran de réglages n'existe pour le changer.
  it("offre de saisir un autre jeton — sinon l'écran est un cul-de-sac", async () => {
    const onEtat = vi.fn();
    render(<EcranPanne detail="jeton refusé" onEtat={onEtat} />);
    await userEvent.click(screen.getByRole("button", { name: "Saisir un autre jeton" }));
    expect(onEtat).toHaveBeenCalledWith({ ecran: "premier-lancement" });
  });

  it("offre aussi de réessayer", async () => {
    render(<EcranPanne detail="panne passagère" onEtat={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(relancerMock).toHaveBeenCalled();
  });
});
