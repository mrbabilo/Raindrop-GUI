import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  appliquer,
  amorcer,
  relancer,
  installerRuntime,
  progressionInstallation,
  remplacerJeton,
  deconnecter,
  etatSauvegarde,
  choisirDossierSauvegarde,
  retirerDossierSauvegarde,
} from "./amorce";

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

describe("remplacerJeton", () => {
  // Réglages (spec §6) : le remplacement passe par la MÊME commande que le
  // premier lancement — trousseau, sidecar, attente du MCP — puis
  // appliquer pose le nouveau global.
  it("invoque enregistrer_jeton avec le jeton en camelCase", async () => {
    invokeMock.mockResolvedValue({ kind: "pret", port: 8, token: "t" });
    expect(await remplacerJeton("abc")).toEqual({ ecran: "app" });
    expect(invokeMock).toHaveBeenCalledWith("enregistrer_jeton", { jetonRaindrop: "abc" });
    expect(window.RAINDROP_GUI).toEqual({ port: 8, token: "t" });
  });

  it("un jeton refusé remonte en écran de panne, pas de page blanche", async () => {
    invokeMock.mockResolvedValue({ kind: "panne", detail: "refusé" });
    expect(await remplacerJeton("faux")).toEqual({ ecran: "panne", detail: "refusé" });
    expect(window.RAINDROP_GUI).toBeUndefined();
  });
});

describe("deconnecter", () => {
  it("invoque la commande et ramène au premier lancement", async () => {
    invokeMock.mockResolvedValue({ kind: "jeton_requis" });
    expect(await deconnecter()).toEqual({ ecran: "premier-lancement" });
    expect(invokeMock).toHaveBeenCalledWith("deconnecter");
    expect(window.RAINDROP_GUI).toBeUndefined();
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

describe("dossier de sauvegarde (spec sélection §2)", () => {
  it("etat_sauvegarde rend le chemin et l'état « introuvable »", async () => {
    invokeMock.mockResolvedValue({ dossier: "/Volumes/USB/Sauv", introuvable: true });
    expect(await etatSauvegarde()).toEqual({ dossier: "/Volumes/USB/Sauv", introuvable: true });
    expect(invokeMock).toHaveBeenCalledWith("etat_sauvegarde");
  });

  // Ni panne ni page blanche : le sélecteur relève du shell, et son absence
  // est l'état normal du développement au navigateur.
  it("hors Tauri, aucun dossier et aucune commande", async () => {
    isTauriMock.mockReturnValue(false);
    expect(await etatSauvegarde()).toEqual({ dossier: null, introuvable: false });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("une commande qui rejette vaut « aucun dossier », pas une panne", async () => {
    invokeMock.mockRejectedValue(new Error("pont IPC coupé"));
    expect(await etatSauvegarde()).toEqual({ dossier: null, introuvable: false });
  });

  // C1 : la relance NE régénère PAS le jeton local (il n'est engendré qu'au
  // lancement de l'app) — c'est le PORT que le nouveau global re-câble.
  it("choisir le dossier applique l'état rendu et re-câble le port", async () => {
    window.RAINDROP_GUI = { port: 1111, token: "jeton-de-session" };
    invokeMock.mockResolvedValue({ kind: "pret", port: 4321, token: "jeton-de-session" });
    expect(await choisirDossierSauvegarde()).toEqual({ ecran: "app" });
    expect(invokeMock).toHaveBeenCalledWith("choisir_dossier_sauvegarde");
    expect(window.RAINDROP_GUI).toEqual({ port: 4321, token: "jeton-de-session" });
  });

  it("une relance en panne sort vers l'écran qui porte les issues", async () => {
    invokeMock.mockResolvedValue({ kind: "panne", detail: "le sidecar n'a pas publié de port" });
    expect(await choisirDossierSauvegarde()).toEqual({
      ecran: "panne",
      detail: "le sidecar n'a pas publié de port",
    });
  });

  it("retirer le dossier invoque sa commande et applique l'état rendu", async () => {
    invokeMock.mockResolvedValue({ kind: "pret", port: 5555, token: "t" });
    expect(await retirerDossierSauvegarde()).toEqual({ ecran: "app" });
    expect(invokeMock).toHaveBeenCalledWith("retirer_dossier_sauvegarde");
  });
});
