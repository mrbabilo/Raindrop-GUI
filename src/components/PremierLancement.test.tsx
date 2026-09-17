import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PremierLancement } from "./PremierLancement";
import type { EtatConnexion } from "../lib/amorce";

const { invokeMock, getMock } = vi.hoisted(() => ({ invokeMock: vi.fn(), getMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock, isTauri: () => true }));
vi.mock("../lib/api", () => ({ api: { get: getMock, send: vi.fn() } }));

const compte = { id: 1, email: "a@b.c", fullName: "Alice", pro: true, bookmarksCount: 12210 };

beforeEach(() => {
  invokeMock.mockReset().mockResolvedValue({ kind: "pret", port: 51234, token: "tok" });
  getMock.mockReset().mockResolvedValue(compte);
});
afterEach(() => {
  delete window.RAINDROP_GUI;
});

describe("PremierLancement", () => {
  it("enregistre le jeton, puis annonce le compte détecté (spec §6)", async () => {
    const user = userEvent.setup();
    render(<PremierLancement onPret={vi.fn()} />);
    await user.type(screen.getByLabelText("Jeton d'API Raindrop"), "abc123");
    await user.click(screen.getByRole("button", { name: "Valider" }));

    // Le paramètre Rust jeton_raindrop s'invoque en camelCase.
    expect(invokeMock).toHaveBeenCalledWith("enregistrer_jeton", { jetonRaindrop: "abc123" });
    await waitFor(() => expect(screen.getByText(/Alice/)).toBeInTheDocument());
    expect(screen.getByText(/12210/)).toBeInTheDocument();
  });

  it("le jeton est masqué à la saisie", () => {
    render(<PremierLancement onPret={vi.fn()} />);
    expect(screen.getByLabelText("Jeton d'API Raindrop")).toHaveAttribute("type", "password");
  });

  // Le grief à éviter : un jeton refusé laisserait un écran figé, ou pire,
  // ferait entrer dans une application qui ne peut rien lire.
  it("un jeton refusé se dit et laisse recommencer", async () => {
    const user = userEvent.setup();
    getMock.mockRejectedValue(new Error("http 401"));
    render(<PremierLancement onPret={vi.fn()} />);
    await user.type(screen.getByLabelText("Jeton d'API Raindrop"), "faux");
    await user.click(screen.getByRole("button", { name: "Valider" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/401/);
    expect(screen.getByRole("button", { name: "Valider" })).toBeEnabled();
    // Ne pas laisser une connexion à demi ouverte derrière soi.
    expect(window.RAINDROP_GUI).toBeUndefined();
  });

  it("deux clics rapides n'enregistrent qu'une fois", async () => {
    // Même garde que le Composer (lot Composer/Tags) : une double
    // validation ne doit pas lancer deux sidecars.
    const user = userEvent.setup();
    let resoudre: (v: EtatConnexion) => void = () => undefined;
    invokeMock.mockReturnValue(new Promise<EtatConnexion>((r) => { resoudre = r; }));
    render(<PremierLancement onPret={vi.fn()} />);
    await user.type(screen.getByLabelText("Jeton d'API Raindrop"), "abc");
    await user.click(screen.getByRole("button", { name: "Valider" }));
    // Le bouton porte désormais « Vérification… » : un second clic dessus
    // ne doit rien déclencher de plus.
    await user.click(screen.getByRole("button", { name: "Vérification…" }));
    expect(invokeMock).toHaveBeenCalledTimes(1);
    resoudre({ kind: "pret", port: 1, token: "t" });
  });

  it("« node_absent » ne reste pas sur cet écran : il remonte", async () => {
    const user = userEvent.setup();
    const onPret = vi.fn();
    invokeMock.mockResolvedValue({ kind: "node_absent", detail: "rien trouvé" });
    render(<PremierLancement onPret={onPret} />);
    await user.type(screen.getByLabelText("Jeton d'API Raindrop"), "abc");
    await user.click(screen.getByRole("button", { name: "Valider" }));
    await waitFor(() =>
      expect(onPret).toHaveBeenCalledWith({ ecran: "diagnostic", detail: "rien trouvé" }),
    );
  });

  it("entrer dans la bibliothèque remonte l'écran « app »", async () => {
    const user = userEvent.setup();
    const onPret = vi.fn();
    render(<PremierLancement onPret={onPret} />);
    await user.type(screen.getByLabelText("Jeton d'API Raindrop"), "abc");
    await user.click(screen.getByRole("button", { name: "Valider" }));
    await user.click(await screen.findByRole("button", { name: "Ouvrir la bibliothèque" }));
    expect(onPret).toHaveBeenCalledWith({ ecran: "app" });
  });
});
