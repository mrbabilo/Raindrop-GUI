import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { annuler, suivreJob } from "./suiviSauvegarde";

const { jobEventsMock, sendMock, jobsMock } = vi.hoisted(() => ({
  jobEventsMock: vi.fn(),
  sendMock: vi.fn(),
  jobsMock: vi.fn(),
}));
vi.mock("./sse", () => ({ jobEvents: jobEventsMock }));
vi.mock("./api", () => ({ api: { send: sendMock, get: vi.fn() } }));
vi.mock("../hooks/useBackup", () => ({ useJobsEnVol: jobsMock }));

// Les handlers que le hook passe à `jobEvents`, capturés pour être pilotés :
// c'est le flux SSE qu'on joue à la main.
let emettre: (e: Record<string, unknown>) => void;

beforeEach(() => {
  emettre = () => undefined;
  jobEventsMock.mockReset().mockImplementation(
    async (_id: string, h: { onEvent: (e: Record<string, unknown>) => void }) => {
      emettre = h.onEvent;
      await new Promise(() => undefined); // le flux reste ouvert jusqu'à l'abort
    },
  );
  sendMock.mockReset().mockResolvedValue({});
  jobsMock.mockReset().mockReturnValue({ data: [] });
});

const enVol = (type: string, id = "j1", progress = { done: 0, total: 0, label: null as string | null }) => ({
  data: [{ id, type, status: "running", progress }],
});

describe("ré-attachement (spec sélection §3)", () => {
  // Le job du démarrage (§4.4) ou celui d'une Revue quittée : personne ne
  // l'a lancé depuis cet écran, et il doit pourtant s'y voir.
  it("adopte un job en vol qu'on n'a pas lancé, avec sa progression du moment", async () => {
    jobsMock.mockReturnValue(enVol("backup", "j9", { done: 5300, total: 12210, label: "bookmarks" }));
    const { result } = renderHook(() => suivreJob("backup"));
    await waitFor(() => expect(result.current?.jobId).toBe("j9"));
    expect(result.current).toMatchObject({ done: 5300, total: 12210, label: "bookmarks" });
  });

  // Chacun son type : le panneau ne doit pas afficher l'archivage d'une
  // Revue comme s'il s'agissait d'une sauvegarde.
  it("ignore un job d'un AUTRE type", async () => {
    jobsMock.mockReturnValue(enVol("archive", "j2"));
    const { result } = renderHook(() => suivreJob("backup"));
    // Preuve que l'objet DEVAIT être visible s'il avait été du bon type :
    // le même listing, suivi sur « archive », le trouve.
    const autre = renderHook(() => suivreJob("archive"));
    await waitFor(() => expect(autre.result.current?.jobId).toBe("j2"));
    expect(result.current).toBeNull();
  });

  it("rien en vol : rien à montrer", () => {
    const { result } = renderHook(() => suivreJob("backup"));
    expect(result.current).toBeNull();
    expect(jobEventsMock).not.toHaveBeenCalled();
  });
});

describe("le flux d'un job", () => {
  it("suit la progression, y compris quand le numérateur RECULE", async () => {
    jobsMock.mockReturnValue(enVol("backup"));
    const { result } = renderHook(() => suivreJob("backup"));
    await waitFor(() => expect(result.current?.jobId).toBe("j1"));

    act(() => emettre({ kind: "progress", progress: { done: 300, total: 12210, label: "bookmarks" } }));
    expect(result.current).toMatchObject({ done: 300, total: 12210, label: "bookmarks" });

    // Le rejeu du balayage ramène le numérateur à zéro (réconciliation) :
    // l'état le porte tel quel, c'est l'écran qui l'appellera « reprise ».
    act(() => emettre({ kind: "progress", progress: { done: 0, total: 12210, label: "bookmarks" } }));
    expect(result.current?.done).toBe(0);
  });

  // Contrat mesuré dans sidecar/api/sse.ts : sur `done`, le sidecar sérialise
  // LE RÉSULTAT et non l'événement — ses champs arrivent à plat.
  it("sur « done », le résultat arrive à plat et porte la bascule (§6)", async () => {
    jobsMock.mockReturnValue(enVol("backup"));
    const { result } = renderHook(() => suivreJob("backup"));
    await waitFor(() => expect(result.current?.jobId).toBe("j1"));

    act(() =>
      emettre({
        kind: "done",
        horodatage: "2026-09-18T12-00-00",
        complet: true,
        count: 12210,
        bascule: "aucune sauvegarde complète disponible — balayage complet",
      }),
    );
    expect(result.current?.fin).toEqual({
      kind: "done",
      resultat: {
        horodatage: "2026-09-18T12-00-00",
        complet: true,
        count: 12210,
        bascule: "aucune sauvegarde complète disponible — balayage complet",
      },
    });
  });

  it("annulation et échec sont des fins distinctes", async () => {
    jobsMock.mockReturnValue(enVol("archive"));
    const a = renderHook(() => suivreJob("archive"));
    await waitFor(() => expect(a.result.current?.jobId).toBe("j1"));
    act(() => emettre({ kind: "cancelled" }));
    expect(a.result.current?.fin).toEqual({ kind: "cancelled" });

    jobsMock.mockReturnValue(enVol("archive", "j5"));
    const b = renderHook(() => suivreJob("archive"));
    await waitFor(() => expect(b.result.current?.jobId).toBe("j5"));
    act(() => emettre({ kind: "error", message: "copie inaccessible (http 403)" }));
    expect(b.result.current?.fin).toEqual({ kind: "error", message: "copie inaccessible (http 403)" });
  });

  // Un job terminé QUITTE la liste des jobs en vol. Sans ce contrat, une
  // sauvegarde réussie disparaîtrait de l'écran à la seconde où elle réussit.
  it("l'état final survit à la disparition du job de la liste", async () => {
    jobsMock.mockReturnValue(enVol("backup"));
    const { result, rerender } = renderHook(() => suivreJob("backup"));
    await waitFor(() => expect(result.current?.jobId).toBe("j1"));
    act(() => emettre({ kind: "done", horodatage: "h", complet: true, count: 3 }));
    expect(result.current?.fin?.kind).toBe("done");

    jobsMock.mockReturnValue({ data: [] }); // le job a quitté la liste
    rerender();
    expect(result.current?.fin?.kind).toBe("done");
  });
});

describe("annuler", () => {
  it("appelle la route d'annulation du job", async () => {
    await annuler("j2");
    expect(sendMock).toHaveBeenCalledWith("POST", "/api/jobs/j2/cancel");
  });
});
