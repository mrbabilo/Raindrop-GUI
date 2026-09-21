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
// La section Sauvegarde a ses propres contrats et son propre fichier de
// test : ici elle est isolée, pour que les contrats de Reglages restent
// lisibles seuls.
vi.mock("./SectionSauvegarde", () => ({ SectionSauvegarde: () => <div data-testid="section-sauvegarde" /> }));
// La section Journal a ses propres contrats et son propre fichier de test
// (SectionJournal.test) — et elle pose un useQuery : sans ce mock, les tests
// de Reglages, rendus NU sans QueryClientProvider, casseraient tous
// (« No QueryClient set » — le piège des providers).
vi.mock("./SectionJournal", () => ({ SectionJournal: () => <div data-testid="section-journal" /> }));
// SectionVersion pose un useQuery aussi : même isolation, même piège des
// providers (le rendu nu de Reglages.test ne peut pas porter un
// QueryClientProvider).
vi.mock("./SectionVersion", () => ({ SectionVersion: () => <div data-testid="section-version" /> }));
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

  // Le constat critique de la relecture : « Déconnecter » n'était pas gardé,
  // donc cliquable pendant un remplacement en vol (jusqu'à 45 s). Deux
  // commandes concurrentes sur le même état pouvaient laisser le trousseau
  // effacé ET un sidecar vivant, avec « Pret » mémorisé.
  it("« Déconnecter » est hors service pendant un remplacement en vol", async () => {
    const user = userEvent.setup();
    let resoudre: (a: { ecran: string }) => void = () => undefined;
    remplacerMock.mockReturnValue(new Promise((r) => { resoudre = r; }));
    render(<Reglages onFermer={vi.fn()} onEtat={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Remplacer le jeton" }));
    await user.type(screen.getByLabelText("Jeton d'API Raindrop"), "x");
    await user.click(screen.getByRole("button", { name: "Valider" }));
    expect(screen.getByRole("button", { name: "Déconnecter" })).toBeDisabled();
    resoudre({ ecran: "app" });
  });

  // Et son corollaire : après un refus, refermer l'écran laisserait une
  // application incapable de lire SANS aucun signal (le sidecar tourne, donc
  // la bannière se tait). La sortie propage la panne, qui porte ses issues.
  it("après un jeton refusé, fermer ne ment pas — la panne remonte", async () => {
    const onFermer = vi.fn();
    const onEtat = vi.fn();
    const user = userEvent.setup();
    getMock.mockRejectedValue(new Error("http 401"));
    render(<Reglages onFermer={onFermer} onEtat={onEtat} />);
    await user.click(screen.getByRole("button", { name: "Remplacer le jeton" }));
    await user.type(screen.getByLabelText("Jeton d'API Raindrop"), "faux");
    await user.click(screen.getByRole("button", { name: "Valider" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Fermer" }));
    expect(onFermer).not.toHaveBeenCalled();
    expect(onEtat).toHaveBeenCalledWith({
      ecran: "panne",
      detail: "Ce jeton n'a pas été accepté par Raindrop.",
    });
  });

  it("Échap ferme", async () => {
    const onFermer = vi.fn();
    render(<Reglages onFermer={onFermer} onEtat={vi.fn()} />);
    await userEvent.setup().keyboard("{Escape}");
    expect(onFermer).toHaveBeenCalled();
  });
});
