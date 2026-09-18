import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SectionSauvegarde } from "./SectionSauvegarde";

const { statutMock, archivesMock, invaliderMock, etatMock, choisirMock, retirerMock, volMock, annulerMock, sendMock } =
  vi.hoisted(() => ({
    statutMock: vi.fn(),
    archivesMock: vi.fn(),
    invaliderMock: vi.fn(),
    etatMock: vi.fn(),
    choisirMock: vi.fn(),
    retirerMock: vi.fn(),
    volMock: vi.fn(),
    annulerMock: vi.fn(),
    sendMock: vi.fn(),
  }));

vi.mock("../hooks/useBackup", async (importOriginal) => ({
  // Les formateurs restent les VRAIS : leur sortie est ce que le test lit à
  // l'écran, la remplacer reviendrait à s'auto-confirmer.
  ...(await importOriginal<typeof import("../hooks/useBackup")>()),
  useBackupStatus: statutMock,
  useArchives: archivesMock,
  useInvalidateSauvegarde: () => invaliderMock,
}));
vi.mock("../lib/suiviSauvegarde", () => ({ suivreJob: volMock, annuler: annulerMock }));
vi.mock("../lib/api", () => ({ api: { send: sendMock, get: vi.fn() } }));
vi.mock("../lib/amorce", () => ({
  etatSauvegarde: etatMock,
  choisirDossierSauvegarde: choisirMock,
  retirerDossierSauvegarde: retirerMock,
}));

/** Rend PUIS vide la file des microtâches : `etatSauvegarde` est une
 *  promesse, et son `setDossier` tomberait sinon hors d'`act` — un
 *  avertissement à chaque test, qui finirait par masquer les vrais. */
const rendre = async (onEtat: () => void = vi.fn()) => {
  const rendu = render(<SectionSauvegarde onEtat={onEtat} />);
  await act(async () => undefined);
  return rendu;
};

beforeEach(() => {
  volMock.mockReset().mockReturnValue(null);
  etatMock.mockReset().mockResolvedValue({ dossier: null, introuvable: false });
  archivesMock.mockReset().mockReturnValue({ data: undefined });
  statutMock.mockReset().mockReturnValue({ data: { actif: false } });
  invaliderMock.mockReset();
  choisirMock.mockReset().mockResolvedValue({ ecran: "app" });
  retirerMock.mockReset().mockResolvedValue({ ecran: "app" });
  sendMock.mockReset().mockResolvedValue({ jobId: "j1" });
  annulerMock.mockReset().mockResolvedValue(undefined);
});

describe("le dossier", () => {
  it("sans dossier : un état, pas une panne — et rien à lancer", async () => {
    statutMock.mockReturnValue({
      data: { actif: false, raison: "aucun dossier de sauvegarde configuré (BACKUP_DIR) — la sauvegarde est inactive" },
    });
    await rendre();
    expect(screen.getByText("Aucun dossier choisi.")).toBeInTheDocument();
    expect(screen.getByText(/la sauvegarde est inactive/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choisir un dossier…" })).toBeEnabled();
    // Rien à sauvegarder tant qu'il n'y a pas où écrire.
    expect(screen.queryByRole("button", { name: "Sauvegarder maintenant" })).not.toBeInTheDocument();
  });

  it("montre le chemin FINAL, pas le parent désigné", async () => {
    etatMock.mockResolvedValue({ dossier: "/Users/x/Sauvegardes", introuvable: false });
    statutMock.mockReturnValue({
      data: { actif: true, dossier: "/Users/x/Sauvegardes/Raindrop-GUI", instantanes: 0, dernier: null },
    });
    await rendre();
    // C'est le chemin où les fichiers atterrissent qui répond à « où est-ce ? ».
    await screen.findByText("/Users/x/Sauvegardes/Raindrop-GUI");
    expect(screen.queryByText("/Users/x/Sauvegardes")).not.toBeInTheDocument();
  });

  it("configuré mais disparu : un état DISTINCT, ni silence ni « aucun dossier »", async () => {
    etatMock.mockResolvedValue({ dossier: "/Volumes/USB/Sauv", introuvable: true });
    await rendre();
    await screen.findByText(/introuvable : \/Volumes\/USB\/Sauv/);
    expect(screen.queryByText("Aucun dossier choisi.")).not.toBeInTheDocument();
  });

  it("une panne de relance sort vers l'écran qui porte les issues", async () => {
    choisirMock.mockResolvedValue({ ecran: "panne", detail: "le sidecar n'a pas publié de port" });
    const onEtat = vi.fn();
    await rendre(onEtat);
    await userEvent.click(screen.getByRole("button", { name: "Choisir un dossier…" }));
    await waitFor(() =>
      expect(onEtat).toHaveBeenCalledWith({ ecran: "panne", detail: "le sidecar n'a pas publié de port" }),
    );
  });

  it("« Retirer » n'apparaît qu'avec un dossier, et dit qu'il n'efface rien", async () => {
    await rendre();
    expect(screen.queryByRole("button", { name: "Retirer" })).not.toBeInTheDocument();

    etatMock.mockResolvedValue({ dossier: "/d", introuvable: false });
    await rendre();
    const retirer = await screen.findByRole("button", { name: "Retirer" });
    expect(retirer).toHaveAttribute("title", expect.stringContaining("n'efface rien"));
  });
});

describe("l'état du moteur", async () => {
  it("actif et vierge : l'avertissement de première sauvegarde précède le geste", async () => {
    statutMock.mockReturnValue({ data: { actif: true, dossier: "/d", instantanes: 0, dernier: null } });
    await rendre();
    expect(screen.getByText("Aucune sauvegarde encore.")).toBeInTheDocument();
    expect(screen.getByText(/2 min 20 et 245 requêtes/)).toBeInTheDocument();
  });

  it("montre la dernière sauvegarde, son mode, les instantanés et les archives", async () => {
    statutMock.mockReturnValue({
      data: {
        actif: true,
        dossier: "/d",
        instantanes: 3,
        dernier: { horodatage: "2026-09-18T08-15-12", complet: true, count: 12210 },
      },
    });
    archivesMock.mockReturnValue({ data: { octets: 3 * 2 ** 20, set: new Set([2, 7]) } });
    await rendre();
    expect(screen.getByText(/Dernière sauvegarde/)).toBeInTheDocument();
    expect(screen.getByText(/balayage complet/)).toBeInTheDocument();
    expect(screen.getByText("3 instantanés conservés")).toBeInTheDocument();
    expect(screen.getByText("2 copies archivées (3 Mo)")).toBeInTheDocument();
  });

  // Le moteur décide d'escalader ; l'utilisateur n'a pas à choisir entre
  // « complet » et « incrémental ».
  it("« Sauvegarder maintenant » demande toujours l'incrémental", async () => {
    statutMock.mockReturnValue({ data: { actif: true, dossier: "/d", instantanes: 1, dernier: null } });
    await rendre();
    await userEvent.click(screen.getByRole("button", { name: "Sauvegarder maintenant" }));
    expect(sendMock).toHaveBeenCalledWith("POST", "/api/backup/run", { mode: "incremental" });
  });
});

describe("le vol", async () => {
  const enVol = (p: { done: number; total: number; label: string | null }) => ({
    jobId: "j1",
    type: "backup" as const,
    ...p,
  });

  beforeEach(() => statutMock.mockReturnValue({ data: { actif: true, dossier: "/d", instantanes: 1, dernier: null } }));

  it("un compteur NOMMÉ, et le bouton de lancement devient inerte", async () => {
    volMock.mockReturnValue(enVol({ done: 5300, total: 12210, label: "bookmarks" }));
    await rendre();
    expect(screen.getByText("5 300 / 12 210 signets")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sauvegarder maintenant" })).toBeDisabled();
  });

  // Une clé que le sidecar ajouterait sans prévenir ne s'affiche pas brute —
  // même contrat que les états du pont.
  it("un segment au label inconnu tombe sur le libellé neutre", async () => {
    volMock.mockReturnValue(enVol({ done: 1, total: 2, label: "segment-inconnu" }));
    await rendre();
    expect(screen.getByText("Sauvegarde en cours…")).toBeInTheDocument();
    expect(screen.queryByText(/segment-inconnu/)).not.toBeInTheDocument();
  });

  it("un numérateur qui RECULE s'appelle une reprise, pas un compteur qui ment", async () => {
    volMock.mockReturnValue(enVol({ done: 900, total: 12210, label: "bookmarks" }));
    const { rerender } = await rendre();
    expect(screen.getByText("900 / 12 210 signets")).toBeInTheDocument();
    volMock.mockReturnValue(enVol({ done: 0, total: 12210, label: "bookmarks" }));
    await act(async () => rerender(<SectionSauvegarde onEtat={vi.fn()} />));
    expect(screen.getByText("Reprise du balayage…")).toBeInTheDocument();
  });

  it("annuler passe par la route du job", async () => {
    volMock.mockReturnValue(enVol({ done: 1, total: 2, label: "bookmarks" }));
    await rendre();
    await userEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(annulerMock).toHaveBeenCalledWith("j1");
  });

  // §6 « et le dit » : la raison de l'escalade avait jusqu'ici zéro lecteur.
  it("la bascule en balayage complet est DITE, pas seulement journalisée", async () => {
    volMock.mockReturnValue({
      ...enVol({ done: 12210, total: 12210, label: "bookmarks" }),
      fin: {
        kind: "done" as const,
        resultat: {
          horodatage: "h",
          complet: true,
          count: 12210,
          bascule: "aucune sauvegarde complète disponible — balayage complet",
        },
      },
    });
    await rendre();
    expect(screen.getByText("Sauvegarde terminée.")).toBeInTheDocument();
    expect(screen.getByText(/aucune sauvegarde complète disponible/)).toBeInTheDocument();
  });

  it("une annulation le dit, et dit ce qu'elle coûte", async () => {
    volMock.mockReturnValue({ ...enVol({ done: 3, total: 9, label: null }), fin: { kind: "cancelled" as const } });
    await rendre();
    expect(screen.getByText(/annulée/)).toBeInTheDocument();
    expect(screen.getByText(/pas comptée comme valide/)).toBeInTheDocument();
  });

  it("un échec est une alerte, pas une ligne muette", async () => {
    volMock.mockReturnValue({
      ...enVol({ done: 3, total: 9, label: null }),
      fin: { kind: "error" as const, message: "fetch failed" },
    });
    await rendre();
    expect(screen.getByRole("alert")).toHaveTextContent("fetch failed");
  });

  // Sans cette relecture, le panneau garderait l'avant : purgerOrphelins
  // tourne à la fin d'un balayage complet et peut réduire l'inventaire.
  it("la fin d'un job fait relire statut et inventaire", async () => {
    volMock.mockReturnValue({
      ...enVol({ done: 1, total: 1, label: null }),
      fin: { kind: "done" as const, resultat: { horodatage: "h", complet: true, count: 1 } },
    });
    await rendre();
    expect(invaliderMock).toHaveBeenCalled();
  });
});
