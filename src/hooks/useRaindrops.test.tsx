import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useRaindrops } from "./useRaindrops";
import { listQueryArgs } from "./listQuery";
import { raindrop } from "../test/fixtures";

// Module api RÉEL + fetch global stubbé : les assertions portent sur l'URL
// que api.get construit vraiment (leçon Task 0 — un mock valide NOTRE appel,
// pas l'API). Stub du token dev comme api.test.ts, jamais de .env.
const page = (n: number, count: number) => ({
  items: [raindrop({ id: 1000 + n })],
  count,
  page: n,
  perPage: 50,
});

function stubFetch(count: number) {
  const f = vi.fn((url: string) => {
    const p = new URL(url, "http://x").searchParams;
    return Promise.resolve(new Response(JSON.stringify(page(Number(p.get("page") ?? 0), count)), { status: 200 }));
  });
  vi.stubGlobal("fetch", f);
  return f;
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  vi.stubEnv("VITE_LOCAL_API_TOKEN", "dev-local-token");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("useRaindrops", () => {
  it("pagine : page 0 puis page 1 via fetchNextPage, query string correcte", async () => {
    const fetchMock = stubFetch(60);
    const { result } = renderHook(
      () => useRaindrops({ collectionId: 0, important: false, notag: undefined }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain("collection_id=0");
    expect(url).toContain("important=false"); // false = filtre explicite
    expect(url).not.toContain("notag"); // undefined = absent du fil
    expect(url).toContain("per_page=50"); // pages de 50
    expect(url).toContain("page=0");
    await result.current.fetchNextPage();
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(fetchMock.mock.calls[1]![0] as string).toContain("page=1");
  });

  it("hasNextPage=false quand le count est atteint (note du brief : mock count 1)", async () => {
    stubFetch(1);
    const { result } = renderHook(() => useRaindrops({ collectionId: -99 }), { wrapper });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(result.current.hasNextPage).toBe(false);
  });

  // Revue finale : une page VIDE (items supprimés en séance, count périmé)
  // ne doit jamais promettre une suite — sinon l'infinite scroll enchaîne
  // les requêtes sans fin (hasNextPage resterait vrai pour toujours).
  it("page vide avec count périmé → hasNextPage=false (pas de boucle de requêtes)", async () => {
    const f = vi.fn((url: string) => {
      const p = new URL(url, "http://x").searchParams;
      return Promise.resolve(
        new Response(JSON.stringify({ items: [], count: 60, page: Number(p.get("page") ?? 0), perPage: 50 }), { status: 200 }),
      );
    });
    vi.stubGlobal("fetch", f);
    const { result } = renderHook(() => useRaindrops({ collectionId: 0 }), { wrapper });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(result.current.hasNextPage).toBe(false);
  });

  it("convertit le marqueur -2 (Non-lus) en search status:unread — il ne sort pas du front", async () => {
    const fetchMock = stubFetch(60);
    const { result } = renderHook(() => useRaindrops({ collectionId: -2 }), { wrapper });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain("search=status%3Aunread");
    expect(url).toContain("collection_id=0");
    expect(url).not.toContain("collection_id=-2");
  });

  it("convertit le marqueur -3 (Favoris) en important=true sur Tous — il ne sort pas du front", async () => {
    const fetchMock = stubFetch(60);
    const { result } = renderHook(() => useRaindrops({ collectionId: -3 }), { wrapper });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain("collection_id=0");
    expect(url).toContain("important=true");
    expect(url).not.toContain("collection_id=-3");
  });

  // Task 7b : la preuve de bout en bout que les filtres de la TopBar ne sont
  // plus jetés — la vue traverse listQueryArgs puis useRaindrops et ressort
  // dans la query string réellement demandée.
  it("les filtres de la vue atteignent l'URL demandée (domaine, bornes de date)", async () => {
    const fetchMock = stubFetch(60);
    const { result } = renderHook(
      () =>
        useRaindrops(
          listQueryArgs({
            kind: "list", collectionId: 0, label: "Tous",
            domain: "exemple.fr", createdStart: "2025-01-01", createdEnd: "2025-12-31",
          }),
        ),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain("domain=exemple.fr");
    expect(url).toContain("created_start=2025-01-01");
    expect(url).toContain("created_end=2025-12-31");
  });

  it("-2 : un search explicite reste prioritaire sur la conversion", async () => {
    const fetchMock = stubFetch(60);
    const { result } = renderHook(() => useRaindrops({ collectionId: -2, search: "custom" }), { wrapper });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain("search=custom");
    expect(url).not.toContain("status%3Aunread");
  });
});
