import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useBulk, useCreateRaindrop, useDeleteCollection,
  useEmptyTrash, useTagManage, useTrashRaindrop, useUnrestore, useUpdateRaindrop,
} from "./useMutations";
import { CLE_GROUPES } from "./useAnalysis";

// Ces neuf hooks sont le SEUL chemin d'écriture du front. Ce qu'ils portent
// tient en trois choses, et chacune casse en silence : la route appelée, le
// corps envoyé (avec ses conversions DTO → sidecar), et les queryKeys
// invalidées. Une invalidation manquante ne lève rien — elle laisse
// simplement l'écran mentir après une écriture réussie.
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock("../lib/api", () => ({ api: { send: sendMock, get: vi.fn() } }));

let invalidees: string[];

const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const vrai = qc.invalidateQueries.bind(qc);
  qc.invalidateQueries = ((args: { queryKey?: unknown[] }) => {
    if (Array.isArray(args?.queryKey)) invalidees.push(String(args.queryKey[0]));
    return vrai(args as never);
  }) as typeof qc.invalidateQueries;
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  sendMock.mockReset().mockResolvedValue({});
  invalidees = [];
});

/** Joue la mutation et rend ce que `api.send` a reçu, une fois retombée. */
async function jouer<T>(hook: () => { mutateAsync: (v: T) => Promise<unknown> }, valeur: T) {
  const { result } = renderHook(hook, { wrapper });
  await result.current.mutateAsync(valeur);
  await waitFor(() => expect(invalidees.length).toBeGreaterThan(0));
  return sendMock.mock.calls[0];
}

describe("useUpdateRaindrop", () => {
  it("PATCH la fiche et convertit collectionId → collection_id", async () => {
    const appel = await jouer(() => useUpdateRaindrop(1000), { title: "neuf", collectionId: 101 });
    expect(appel?.[0]).toBe("PATCH");
    expect(appel?.[1]).toBe("/api/raindrops/1000");
    // Le front ne parle que DTO ; la conversion reste à la frontière.
    expect(appel?.[2]).toMatchObject({ title: "neuf", collection_id: 101 });
  });

  it("sans collectionId, aucune clé collection_id n'est inventée", async () => {
    const appel = await jouer(() => useUpdateRaindrop(1000), { title: "neuf" });
    expect("collection_id" in (appel?.[2] as object)).toBe(false);
  });

  // « raindrop » (le détail) en plus des listes : sans lui, le titre
  // enregistré ne reparaîtrait dans le volet qu'au prochain refetch indirect.
  it("invalide les listes, le détail et les collections", async () => {
    await jouer(() => useUpdateRaindrop(1000), { title: "neuf" });
    expect(invalidees).toEqual(["raindrops", "raindrop", "collections"]);
  });
});

describe("useTrashRaindrop", () => {
  // §4.2 : sans `from`, le sidecar ne sait pas d'où vient l'item et la
  // restauration à l'origine devient impossible.
  it("porte l'origine en query string quand elle est connue", async () => {
    const appel = await jouer(() => useTrashRaindrop(), { id: 1000, from: 101 });
    expect(appel?.[0]).toBe("DELETE");
    expect(appel?.[1]).toBe("/api/raindrops/1000?from=101");
  });

  it("sans origine, aucune query string vide", async () => {
    const appel = await jouer(() => useTrashRaindrop(), { id: 1000 });
    expect(appel?.[1]).toBe("/api/raindrops/1000");
  });

  // `from: 0` est « Tous » — un identifiant réel pour le sidecar, et non une
  // absence : `!= null` le laisse donc passer, là où un test de véracité
  // l'aurait avalé.
  it("une origine de 0 est transmise, pas confondue avec son absence", async () => {
    const appel = await jouer(() => useTrashRaindrop(), { id: 1000, from: 0 });
    expect(appel?.[1]).toBe("/api/raindrops/1000?from=0");
  });

  it("invalide listes, collections et étiquettes", async () => {
    await jouer(() => useTrashRaindrop(), { id: 1000 });
    expect(invalidees).toEqual(["raindrops", "collections", "tags"]);
  });
});

// La fiche s'ouvre au clic dans la vue Doublons : sa corbeille doit élaguer
// les groupes en cache comme le fait la Revue (audit du 2026-09-23).
describe("useTrashRaindrop × doublons", () => {
  it("la copie corbeillée sort de son groupe, réduit à un exemplaire il disparaît", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const item = (id: number) => ({ id, url: "https://a.example/", title: "A", collectionId: 1, created: "2020-01-01T00:00:00.000Z" });
    qc.setQueryData(CLE_GROUPES, {
      exact: [{ key: "a", kind: "exact", items: [item(1), item(2)] }],
      normalized: [],
      fuzzy: [{ key: "b", kind: "fuzzy", items: [item(3), item(4), item(5)] }],
    });
    const enveloppe = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useTrashRaindrop(), { wrapper: enveloppe });
    await result.current.mutateAsync({ id: 2 });
    await result.current.mutateAsync({ id: 5 });
    const apres = qc.getQueryData<{ exact: unknown[]; fuzzy: { items: { id: number }[] }[] }>(CLE_GROUPES)!;
    expect(apres.exact).toEqual([]);
    expect(apres.fuzzy[0]!.items.map((i) => i.id)).toEqual([3, 4]);
  });
});

describe("useCreateRaindrop", () => {
  it("POST le corps tel quel et invalide listes et collections", async () => {
    const appel = await jouer(() => useCreateRaindrop(), { link: "https://x.test", title: "T" });
    expect(appel?.slice(0, 2)).toEqual(["POST", "/api/raindrops"]);
    expect(appel?.[2]).toEqual({ link: "https://x.test", title: "T" });
    expect(invalidees).toEqual(["raindrops", "collections"]);
  });
});

describe("useBulk", () => {
  it("POST /bulk avec les origines, et invalide les trois radicaux", async () => {
    const corps = {
      operation: "delete" as const, collection_id: 0, ids: [1, 2],
      origins: [{ id: 1, from: 7 }, { id: 2, from: 9 }],
    };
    const appel = await jouer(() => useBulk(), corps);
    expect(appel?.slice(0, 2)).toEqual(["POST", "/api/raindrops/bulk"]);
    expect(appel?.[2]).toEqual(corps);
    expect(invalidees).toEqual(["raindrops", "collections", "tags"]);
  });
});

describe("useTagManage", () => {
  // Ruling T8-5 : « raindrop » aussi — sans lui, une fiche OUVERTE garde des
  // étiquettes périmées après un renommage.
  it("invalide aussi le détail, pas seulement les étiquettes", async () => {
    const appel = await jouer(() => useTagManage(), { operation: "rename" as const, tags: ["a"], new_name: "b" });
    expect(appel?.slice(0, 2)).toEqual(["POST", "/api/tags/manage"]);
    expect(invalidees).toEqual(["tags", "raindrops", "raindrop"]);
  });
});

describe("useUnrestore", () => {
  it("POST /unrestore, destination comprise quand elle est donnée", async () => {
    const appel = await jouer(() => useUnrestore(), { ids: [1, 2], toCollectionId: 101 });
    expect(appel?.slice(0, 2)).toEqual(["POST", "/api/raindrops/unrestore"]);
    expect(appel?.[2]).toEqual({ ids: [1, 2], toCollectionId: 101 });
    expect(invalidees).toEqual(["raindrops", "collections", "tags"]);
  });
});

describe("useEmptyTrash", () => {
  // Le zod du sidecar EXIGE `confirm: true` : c'est la seule opération
  // définitive de l'application (spec §3).
  it("envoie la confirmation que le sidecar exige", async () => {
    const appel = await jouer(() => useEmptyTrash(), undefined as never);
    expect(appel?.slice(0, 2)).toEqual(["POST", "/api/maintenance/empty-trash"]);
    expect(appel?.[2]).toEqual({ confirm: true });
    expect(invalidees).toEqual(["raindrops"]);
  });
});

describe("useDeleteCollection", () => {
  it("DELETE la collection et n'invalide que les collections", async () => {
    const appel = await jouer(() => useDeleteCollection(), 101);
    expect(appel?.slice(0, 2)).toEqual(["DELETE", "/api/collections/101"]);
    expect(invalidees).toEqual(["collections"]);
  });
});
