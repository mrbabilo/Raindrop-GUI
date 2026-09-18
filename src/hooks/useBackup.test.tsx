import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  dureeEstimee,
  formatterOctets,
  libelleProgression,
  useArchives,
  useBackupStatus,
  useJobsEnVol,
} from "./useBackup";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("../lib/api", () => ({ api: { get: getMock, send: vi.fn() } }));

const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

beforeEach(() => getMock.mockReset());

describe("lectures de la sauvegarde", () => {
  it("useBackupStatus lit /api/backup/status, inactif compris", async () => {
    // L'inactif n'est PAS une panne : la route rend 200 avec sa raison, le
    // panneau l'affiche comme un état.
    getMock.mockResolvedValue({ actif: false, raison: "aucun dossier de sauvegarde configuré" });
    const { result } = renderHook(() => useBackupStatus(), { wrapper });
    await waitFor(() => expect(result.current.data?.actif).toBe(false));
    expect(getMock).toHaveBeenCalledWith("/api/backup/status");
  });

  // Le marqueur « Archivé » teste l'appartenance à CHAQUE ligne de la liste :
  // un tableau y serait quadratique, d'où le Set posé une fois ici.
  it("useArchives convertit la liste d'identifiants en Set et garde le volume", async () => {
    getMock.mockResolvedValue({ ids: [2, 7], octets: 40 });
    const { result } = renderHook(() => useArchives(), { wrapper });
    await waitFor(() => expect(result.current.data?.set).toEqual(new Set([2, 7])));
    expect(result.current.data?.octets).toBe(40);
    expect(getMock).toHaveBeenCalledWith("/api/backup/archives");
  });

  it("useJobsEnVol lit /api/jobs", async () => {
    getMock.mockResolvedValue([
      { id: "j1", type: "backup", status: "running", progress: { done: 1, total: 2, label: "bookmarks" } },
    ]);
    const { result } = renderHook(() => useJobsEnVol(), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(getMock).toHaveBeenCalledWith("/api/jobs");
  });
});

describe("formatage", () => {
  it("les octets prennent leur unité", () => {
    expect(formatterOctets(0)).toBe("0 o");
    expect(formatterOctets(40)).toBe("40 o");
    expect(formatterOctets(430 * 2 ** 20)).toBe("430 Mo");
    expect(formatterOctets(3.4 * 2 ** 30)).toBe("3.4 Go");
  });

  // Deux requêtes par copie, file à 550 ms : annoncer la durée est la seule
  // façon honnête de proposer une action qui peut tenir des dizaines de
  // minutes (mesuré : 3,18 Mo en moyenne par copie, 27,6 Go pour la
  // bibliothèque entière).
  it("la durée suit les deux requêtes par copie, en minutes au-delà de deux", () => {
    expect(dureeEstimee(10)).toBe("environ 11 s");
    expect(dureeEstimee(1000)).toBe("environ 19 min");
  });
});

describe("libellés de progression", () => {
  it("chaque clé émise par le sidecar a sa traduction", () => {
    expect(libelleProgression("bookmarks")).toBe("signets");
    expect(libelleProgression("corbeille")).toBe("corbeille");
    expect(libelleProgression("collections")).toBe("collections");
    expect(libelleProgression("surlignages")).toBe("surlignages");
    expect(libelleProgression("profil")).toBe("profil");
    expect(libelleProgression("modifies")).toBe("éléments modifiés");
  });

  // Même contrat que les états du pont : un identifiant interne ne s'affiche
  // JAMAIS à l'écran. Une clé que le sidecar ajouterait sans prévenir tombe
  // sur le libellé neutre, que l'appelant substitue.
  it("une clé inconnue ne s'affiche pas brute", () => {
    expect(libelleProgression("segment-inconnu")).toBeNull();
    expect(libelleProgression(null)).toBeNull();
  });
});
