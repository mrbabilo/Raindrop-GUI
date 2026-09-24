import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
// fixtures AVANT les hooks : la factory vi.mock (hisée au-dessus des imports)
// les référence — elles doivent être évaluées avant le premier import du
// module mocké, sinon TDZ.
import { collections, tags } from "../test/fixtures";
import { useCollections, useTags, useUser, useHealth } from "./useStaticData";
import { api } from "../lib/api";

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

// Optimisation du 2026-09-24 : `/api/user` coûte DEUX créneaux de file
// (get_user, puis un search pour le total). Frais 30 s par défaut, il
// repartait à chaque retour sur le Nettoyage — pour un compte et un total qui
// ne servent qu'à des ESTIMATIONS. Il reste frais dix minutes.
describe("useUser — une lecture de compte ne se refait pas à chaque navigation", () => {
  afterEach(() => vi.useRealTimers());
  it("remonté une minute plus tard : aucune nouvelle requête", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
    const w = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const get = vi.mocked(api.get);
    get.mockClear();
    const premier = renderHook(() => useUser(), { wrapper: w });
    await waitFor(() => expect(premier.result.current.data?.bookmarksCount).toBe(5000));
    premier.unmount();
    vi.setSystemTime(Date.now() + 60_000); // au-delà des 30 s par défaut
    const second = renderHook(() => useUser(), { wrapper: w });
    await waitFor(() => expect(second.result.current.data?.bookmarksCount).toBe(5000));
    expect(get.mock.calls.filter((c) => c[0] === "/api/user")).toHaveLength(1);
  });
});
