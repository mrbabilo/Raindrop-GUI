import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appliquer, amorcer, relancer, installerRuntime, progressionInstallation } from "./amorce";

const { invokeMock, isTauriMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  isTauriMock: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock, isTauri: isTauriMock }));

beforeEach(() => {
  invokeMock.mockReset();
  isTauriMock.mockReset().mockReturnValue(true);
});
afterEach(() => {
  delete window.RAINDROP_GUI;
});

describe("appliquer", () => {
  // Le cœur de la décision D1 : c'est ICI que le global se remplit, ce qui
  // laisse getConnection() synchrone et api.ts/sse.ts intouchés.
  it("« pret » pose window.RAINDROP_GUI et mène à l'application", () => {
    const a = appliquer({ kind: "pret", port: 51234, token: "abc" });
    expect(a).toEqual({ ecran: "app" });
    expect(window.RAINDROP_GUI).toEqual({ port: 51234, token: "abc" });
  });

  it("« jeton_requis » mène au premier lancement, sans rien poser", () => {
    expect(appliquer({ kind: "jeton_requis" })).toEqual({ ecran: "premier-lancement" });
    expect(window.RAINDROP_GUI).toBeUndefined();
  });

  it("« node_absent » et « panne » portent leur détail à l'écran", () => {
    expect(appliquer({ kind: "node_absent", detail: "rien trouvé" })).toEqual({
      ecran: "diagnostic",
      detail: "rien trouvé",
    });
    expect(appliquer({ kind: "panne", detail: "boum" })).toEqual({
      ecran: "panne",
      detail: "boum",
    });
  });
});

describe("amorcer", () => {
  it("hors Tauri, rend l'application sans appeler quoi que ce soit", async () => {
    // Développement au navigateur : le proxy Vite et VITE_LOCAL_API_TOKEN
    // font le travail, il n'y a aucune commande à invoquer.
    isTauriMock.mockReturnValue(false);
    expect(await amorcer()).toEqual({ ecran: "app" });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("sous Tauri, demande l'état et l'applique", async () => {
    invokeMock.mockResolvedValue({ kind: "pret", port: 7, token: "t" });
    expect(await amorcer()).toEqual({ ecran: "app" });
    expect(invokeMock).toHaveBeenCalledWith("etat_connexion");
    expect(window.RAINDROP_GUI).toEqual({ port: 7, token: "t" });
  });

  // Sans cette garde, une commande qui rejette laisse une page blanche : le
  // rendu n'a jamais lieu et rien n'explique pourquoi.
  it("une commande qui rejette devient un écran de panne, pas une page blanche", async () => {
    invokeMock.mockRejectedValue(new Error("pont IPC coupé"));
    expect(await amorcer()).toEqual({ ecran: "panne", detail: "pont IPC coupé" });
  });
});

describe("relancer", () => {
  // Le contrat qui évite le cul-de-sac : « Réessayer » doit REJOUER la
  // séquence côté Rust. Passer par etat_connexion rendrait l'état mémorisé,
  // donc la même panne, indéfiniment.
  it("appelle la commande qui rejoue, pas celle qui relit", async () => {
    invokeMock.mockResolvedValue({ kind: "pret", port: 9, token: "t" });
    expect(await relancer()).toEqual({ ecran: "app" });
    expect(invokeMock).toHaveBeenCalledWith("relancer");
  });
});

describe("installerRuntime", () => {
  // Même contrat que « Réessayer » : Rust installe PUIS rejoue la séquence
  // — l'état rendu doit passer par appliquer(), pas être relu.
  it("appelle la commande d'installation et applique l'état rendu", async () => {
    invokeMock.mockResolvedValue({ kind: "pret", port: 11, token: "t" });
    expect(await installerRuntime()).toEqual({ ecran: "app" });
    expect(invokeMock).toHaveBeenCalledWith("installer_runtime");
    expect(window.RAINDROP_GUI).toEqual({ port: 11, token: "t" });
  });

  it("une installation refusée mène à l'écran de panne, pas à une page blanche", async () => {
    invokeMock.mockResolvedValue({
      kind: "panne",
      detail: "somme sha256 refusée — installez Node manuellement",
    });
    expect(await installerRuntime()).toEqual({
      ecran: "panne",
      detail: "somme sha256 refusée — installez Node manuellement",
    });
  });

  it("hors Tauri, ne demande rien", async () => {
    isTauriMock.mockReturnValue(false);
    expect(await installerRuntime()).toEqual({ ecran: "app" });
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe("progressionInstallation", () => {
  it("sonde la commande de progression sous Tauri", async () => {
    invokeMock.mockResolvedValue("Téléchargement de Node v22.23.0…");
    expect(await progressionInstallation()).toBe("Téléchargement de Node v22.23.0…");
    expect(invokeMock).toHaveBeenCalledWith("progression_installation");
  });

  it("rend null hors Tauri — le dev navigateur n'a rien à sonder", async () => {
    isTauriMock.mockReturnValue(false);
    expect(await progressionInstallation()).toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("rend null sur une commande qui rejette — jamais d'écran blanc", async () => {
    invokeMock.mockRejectedValue(new Error("pont IPC coupé"));
    expect(await progressionInstallation()).toBeNull();
  });

  it("rend null quand rien n'est en cours", async () => {
    invokeMock.mockResolvedValue(null);
    expect(await progressionInstallation()).toBeNull();
  });
});
