import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Diagnostic, EcranPanne } from "./EcranAmorce";
import type { Amorce } from "../lib/amorce";

const { relancerMock, installerMock, progressionMock } = vi.hoisted(() => ({
  relancerMock: vi.fn(),
  installerMock: vi.fn(),
  progressionMock: vi.fn(),
}));
vi.mock("../lib/amorce", async (vrai) => ({
  ...(await vrai<object>()),
  relancer: relancerMock,
  installerRuntime: installerMock,
  progressionInstallation: progressionMock,
}));

beforeEach(() => {
  relancerMock.mockReset().mockResolvedValue({ ecran: "app" });
  installerMock.mockReset().mockResolvedValue({ ecran: "app" });
  progressionMock.mockReset().mockResolvedValue(null);
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
    // Les instructions manuelles restent le repli (amendement spec §3.2).
    expect(screen.getByText(/brew install node/)).toBeInTheDocument();
  });

  // Le bouton PRINCIPAL : installer le runtime géré (spec §3.2 amendée —
  // décision du 2026-09-17, un téléchargement de 25 Mo mérite un geste de
  // consentement, pas une fenêtre blanche muette).
  it("propose « Installer Node » en geste principal, qui installe PUIS suit le nouvel état", async () => {
    const onEtat = vi.fn();
    render(<Diagnostic detail="rien trouvé" onEtat={onEtat} />);
    await userEvent.click(screen.getByRole("button", { name: "Installer Node" }));
    expect(installerMock).toHaveBeenCalled();
    await waitFor(() => expect(onEtat).toHaveBeenCalledWith({ ecran: "app" }));
  });

  it("affiche la progression pollée pendant l'installation", async () => {
    // L'installation ne finit QUE quand on la laisse : le poll doit
    // rafraîchir le libellé pendant qu'elle tourne.
    let terminer: (a: Amorce) => void = () => {};
    installerMock.mockImplementation(
      () =>
        new Promise<Amorce>((resoudre) => {
          terminer = resoudre;
        }),
    );
    progressionMock.mockResolvedValue("Téléchargement de Node v22.23.0…");
    render(<Diagnostic detail="rien trouvé" onEtat={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Installer Node" }));
    const bouton = screen.getByRole("button", { name: "Installation de Node…" });
    expect(bouton).toBeDisabled();
    // Le poll (500 ms) remplace le libellé générique par l'étape de Rust.
    await waitFor(
      () =>
        expect(
          screen.getByRole("button", { name: "Téléchargement de Node v22.23.0…" }),
        ).toBeInTheDocument(),
      { timeout: 2000 },
    );
    terminer({ ecran: "app" });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Téléchargement/ })).not.toBeInTheDocument(),
    );
  });

  it("« Réessayer » reste disponible en repli et REJOUE la séquence", async () => {
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
