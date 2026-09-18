import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ArchiveJob, BORNE_ARCHIVE, porteeArchive } from "./RevueArchive";

const { sendMock, jobsMock, volMock, annulerMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  jobsMock: vi.fn(),
  volMock: vi.fn(),
  annulerMock: vi.fn(),
}));
vi.mock("../lib/api", () => ({ api: { send: sendMock, get: vi.fn() } }));
vi.mock("../lib/suiviSauvegarde", () => ({ suivreJob: volMock, annuler: annulerMock }));
vi.mock("../hooks/useBackup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks/useBackup")>()),
  useJobsEnVol: jobsMock,
}));

beforeEach(() => {
  sendMock.mockReset().mockResolvedValue({ jobId: "j1" });
  jobsMock.mockReset().mockReturnValue({ data: [] });
  volMock.mockReset().mockReturnValue(null);
  annulerMock.mockReset().mockResolvedValue(undefined);
});

const pret = (id: number, size?: number) => ({ id, cache: { status: "ready", ...(size ? { size } : {}) } });

describe("porteeArchive", () => {
  // La règle du lot : prouver d'abord que l'objet DEVAIT être là. L'item 2
  // est bien dans la sélection — c'est l'inventaire qui l'en retire.
  it("écarte les déjà-archivés ET les compte", () => {
    const items = [pret(1), pret(2), pret(3)];
    expect(items.map((i) => i.id)).toContain(2); // il était bien là
    const p = porteeArchive(items, new Set([2]));
    expect(p.ids).toEqual([1, 3]);
    expect(p.deja).toBe(1);
  });

  // Une action qui « réussit » sur des signets sans copie serait un mensonge.
  it("écarte ce qui n'a pas de copie permanente ET le compte", () => {
    const items = [pret(1), { id: 2, cache: null }, { id: 3, cache: { status: "retry" } }];
    const p = porteeArchive(items, new Set());
    expect(p.ids).toEqual([1]);
    expect(p.sansCopie).toBe(2);
    expect(p.copiesInconnues).toBe(false);
  });

  // Les liens morts viennent de l'analyse, qui ne porte pas `cache` : les
  // exclure d'office interdirait d'archiver là où l'archive vaut le plus.
  it("un item dont la copie est INCONNUE part quand même, et c'est signalé", () => {
    const p = porteeArchive([{ id: 1 }, { id: 2 }], new Set());
    expect(p.ids).toEqual([1, 2]);
    expect(p.sansCopie).toBe(0);
    expect(p.copiesInconnues).toBe(true);
  });

  it("le volume ne somme que ce qui partira", () => {
    const p = porteeArchive([pret(1, 100), pret(2, 900), { id: 3, cache: null }], new Set([2]));
    expect(p.ids).toEqual([1]);
    expect(p.volume).toBe(100);
  });
});

describe("ArchiveJob", () => {
  it("poste les identifiants puis suit le job", async () => {
    render(<ArchiveJob ids={[1, 3]} onTermine={vi.fn()} onErreur={vi.fn()} />);
    await waitFor(() => expect(sendMock).toHaveBeenCalledWith("POST", "/api/backup/archive", { ids: [1, 3] }));
  });

  // Décider sur une liste encore inconnue reviendrait à poster en aveugle —
  // et à récolter le refus « un archivage est déjà en cours ».
  it("ne décide RIEN tant que la liste des jobs est inconnue", () => {
    jobsMock.mockReturnValue({ data: undefined });
    render(<ArchiveJob ids={[1]} onTermine={vi.fn()} onErreur={vi.fn()} />);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("adopte un archivage DÉJÀ en vol au lieu d'en poster un second", async () => {
    jobsMock.mockReturnValue({
      data: [{ id: "j9", type: "archive", status: "running", progress: { done: 1, total: 2, label: null } }],
    });
    volMock.mockReturnValue({ jobId: "j9", type: "archive", done: 1, total: 2, label: null });
    render(<ArchiveJob ids={[1]} onTermine={vi.fn()} onErreur={vi.fn()} />);
    expect(sendMock).not.toHaveBeenCalled();
    expect(screen.getByText("Archivage : 1 / 2 copies")).toBeInTheDocument();
  });

  // Le refus de la route (borne, archivage concurrent) est une ligne dans la
  // Revue, pas un écran blanc.
  it("un POST refusé remonte en erreur, sans casser la Revue", async () => {
    sendMock.mockRejectedValue(new Error("un archivage est déjà en cours"));
    const onErreur = vi.fn();
    render(<ArchiveJob ids={[1]} onTermine={vi.fn()} onErreur={onErreur} />);
    await waitFor(() => expect(onErreur).toHaveBeenCalledWith("un archivage est déjà en cours"));
  });

  it("rend le résultat une seule fois, échecs compris", async () => {
    volMock.mockReturnValue({
      jobId: "j1",
      type: "archive",
      done: 3,
      total: 3,
      label: null,
      fin: {
        kind: "done",
        resultat: { demandes: 3, faits: 3, echecs: [{ id: 9, raison: "copie inaccessible (http 403)" }], annule: false },
      },
    });
    const onTermine = vi.fn();
    const { rerender } = render(<ArchiveJob ids={[1]} onTermine={onTermine} onErreur={vi.fn()} />);
    expect(screen.getByText("Terminé : 2 archivée(s), 1 en échec.")).toBeInTheDocument();
    expect(screen.getByText(/copie inaccessible/)).toBeInTheDocument();
    rerender(<ArchiveJob ids={[1]} onTermine={onTermine} onErreur={vi.fn()} />);
    expect(onTermine).toHaveBeenCalledTimes(1);
  });

  it("une annulation le dit, et dit que l'écrit reste", () => {
    volMock.mockReturnValue({
      jobId: "j1", type: "archive", done: 1, total: 3, label: null, fin: { kind: "cancelled" },
    });
    render(<ArchiveJob ids={[1]} onTermine={vi.fn()} onErreur={vi.fn()} />);
    expect(screen.getByText(/ce qui est écrit reste/)).toBeInTheDocument();
  });

  it("annuler passe par la route du job", async () => {
    volMock.mockReturnValue({ jobId: "j1", type: "archive", done: 1, total: 3, label: null });
    render(<ArchiveJob ids={[1]} onTermine={vi.fn()} onErreur={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(annulerMock).toHaveBeenCalledWith("j1");
  });
});

describe("la borne", () => {
  it("vaut 500 — la même que celle du sidecar", () => {
    expect(BORNE_ARCHIVE).toBe(500);
  });
});
