import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
// fixtures AVANT les hooks : la factory vi.mock (hisée au-dessus des imports)
// les référence — elles doivent être évaluées avant le premier import du
// module mocké, sinon TDZ.
import { collections, tags } from "../test/fixtures";
import { useCollections, useTags, useUser, useHealth } from "./useStaticData";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

vi.mock("../lib/api", () => ({
  api: {
    get: vi.fn((path: string) => {
      if (path === "/api/collections") return Promise.resolve({ items: collections });
      if (path === "/api/tags") return Promise.resolve({ items: tags });
      if (path === "/api/user")
        return Promise.resolve({ id: 42, email: "a@b.c", fullName: "Moi", pro: true, bookmarksCount: 5000 });
      return Promise.resolve({ status: "ok", mcp: "connected" });
    }),
  },
}));

describe("useStaticData", () => {
  it("collections : la liste plate normalisée côté sidecar est consommée telle quelle", async () => {
    const { result } = renderHook(() => useCollections(), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(3));
    // Les fixtures placent l'enfant (Rust, parentId 101) en fin de liste
    // plate : aucun arbre n'est reconstruit côté front.
    expect(result.current.data![2]!.parentId).toBe(101);
    expect(result.current.data![0]!.title).toBe("Dev");
  });

  it("tags avec compteurs", async () => {
    const { result } = renderHook(() => useTags(), { wrapper });
    await waitFor(() => expect(result.current.data?.[0]?.name).toBe("typescript"));
  });

  it("user", async () => {
    const { result } = renderHook(() => useUser(), { wrapper });
    await waitFor(() => expect(result.current.data?.pro).toBe(true));
  });

  it("health : {status, mcp} consommé tel quel", async () => {
    const { result } = renderHook(() => useHealth(), { wrapper });
    await waitFor(() => expect(result.current.data?.mcp).toBe("connected"));
    expect(result.current.data?.status).toBe("ok");
  });
});
