import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Reglages } from "./Reglages";

const { healthMock, getMock, remplacerMock, deconnecterMock } = vi.hoisted(() => ({
  healthMock: vi.fn(),
  getMock: vi.fn(),
  remplacerMock: vi.fn(),
  deconnecterMock: vi.fn(),
}));
vi.mock("../hooks/useStaticData", () => ({ useHealth: healthMock }));
vi.mock("../lib/api", () => ({ api: { get: getMock, send: vi.fn() } }));
vi.mock("../lib/amorce", () => ({
  remplacerJeton: remplacerMock,
  deconnecter: deconnecterMock,
}));

beforeEach(() => {
  healthMock.mockReset().mockReturnValue({ data: { status: "ok", mcp: "connected" } });
  getMock.mockReset().mockResolvedValue({ id: 1, email: "a@b.c", fullName: "Alice", pro: true, bookmarksCount: 10 });
  remplacerMock.mockReset().mockResolvedValue({ ecran: "app" });
  deconnecterMock.mockReset().mockResolvedValue({ ecran: "premier-lancement" });
});

describe("Reglages", () => {
  // Le front ne montre jamais les identifiants internes du lifecycle :
  // « connected » à l'écran serait une fuite de jargon.
  it("montre l'état du pont en français, pas l'identifiant interne", () => {
    render(<Reglages onFermer={vi.fn()} onEtat={vi.fn()} />);
    expect(screen.getByText("Connecté")).toBeInTheDocument();
    expect(screen.queryByText("connected")).not.toBeInTheDocument();
  });

  it("un état inconnu ne casse rien — il se tait", () => {
    healthMock.mockReturnValue({ data: undefined });
    render(<Reglages onFermer={vi.fn()} onEtat={vi.fn()} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("« Remplacer le jeton » révèle la saisie et l'envoie", async () => {
    const onFermer = vi.fn();
    const user = userEvent.setup();
    render(<Reglages onFermer={onFermer} onEtat={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Remplacer le jeton" }));
    await user.type(screen.getByLabelText("Jeton d'API Raindrop"), "neuf");
    await user.click(screen.getByRole("button", { name: "Valider" }));
    expect(remplacerMock).toHaveBeenCalledWith("neuf");
    // Jeton accepté ET compte lisible : l'écran se referme sur l'application.
    await waitFor(() => expect(onFermer).toHaveBeenCalled());
  });

  // Le grief à éviter : un jeton que le sidecar accepte mais que Raindrop
  // refuse fermerait les réglages sur une application incapable de lire.
  it("un jeton refusé par Raindrop se dit, et l'écran reste ouvert", async () => {
    const onFermer = vi.fn();
    const user = userEvent.setup();
    getMock.mockRejectedValue(new Error("http 401"));
    render(<Reglages onFermer={onFermer} onEtat={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Remplacer le jeton" }));
    await user.type(screen.getByLabelText("Jeton d'API Raindrop"), "faux");
    await user.click(screen.getByRole("button", { name: "Valider" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/n'a pas été accepté/);
    expect(onFermer).not.toHaveBeenCalled();
  });

  // Sidecar mort après le remplacement : l'application EST en panne, la
  // montrer derrière un panneau serait un mensonge — on remonte à l'écran
  // qui porte les issues.
  it("une panne du sidecar remonte à l'écran d'amorçage", async () => {
    const onEtat = vi.fn();
    const user = userEvent.setup();
    remplacerMock.mockResolvedValue({ ecran: "panne", detail: "sidecar mort" });
    render(<Reglages onFermer={vi.fn()} onEtat={onEtat} />);
    await user.click(screen.getByRole("button", { name: "Remplacer le jeton" }));
    await user.type(screen.getByLabelText("Jeton d'API Raindrop"), "x");
    await user.click(screen.getByRole("button", { name: "Valider" }));
    await waitFor(() => expect(onEtat).toHaveBeenCalledWith({ ecran: "panne", detail: "sidecar mort" }));
  });

  it("« Déconnecter » ramène au premier lancement", async () => {
    const onEtat = vi.fn();
    const user = userEvent.setup();
    render(<Reglages onFermer={vi.fn()} onEtat={onEtat} />);
    await user.click(screen.getByRole("button", { name: "Déconnecter" }));
    expect(deconnecterMock).toHaveBeenCalled();
    await waitFor(() => expect(onEtat).toHaveBeenCalledWith({ ecran: "premier-lancement" }));
  });

  it("Échap ferme", async () => {
    const onFermer = vi.fn();
    render(<Reglages onFermer={onFermer} onEtat={vi.fn()} />);
    await userEvent.setup().keyboard("{Escape}");
    expect(onFermer).toHaveBeenCalled();
  });
});
