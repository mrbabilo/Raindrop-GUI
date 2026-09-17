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
  it("collections : liste PLATE (aucun arbre reconstruit), mais TRIÉE", async () => {
    const { result } = renderHook(() => useCollections(), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(3));
    // Plate : l'enfant (Rust, parentId 101) reste une entrée comme une autre,
    // le front ne niche rien — c'est `parentId` qui porte la hiérarchie.
    expect(result.current.data!.find((c) => c.title === "Rust")!.parentId).toBe(101);
    // Triée à la source : l'API rend son propre ordre (Dev, Design, Rust),
    // un seul endroit le range pour que sidebar, palette ⌘K et destinations
    // de déplacement lisent le même arbre (lib/ordre.ts).
    expect(result.current.data!.map((c) => c.title)).toEqual(["Design", "Dev", "Rust"]);
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
