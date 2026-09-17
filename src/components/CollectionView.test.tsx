import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { raindrop, collections } from "../test/fixtures";
import { CollectionView } from "./CollectionView";
import { AppStateProvider, useAppState } from "../state/appState";
import { DragProvider } from "../state/drag";

vi.mock("../hooks/useStaticData", () => ({ useCollections: () => ({ data: collections }) }));
vi.mock("../lib/api", () => ({ api: { get: vi.fn(), send: vi.fn() } }));

// Le sidecar pagine à 50 : une collection de 414 rend 50 items et count 414.
// C'est l'écart entre les deux qui fait apparaître « Voir les N ».
const page = (n: number, total: number, prefixe: string) => ({
  pages: [{
    items: Array.from({ length: n }, (_, i) => raindrop({ id: Number(`${prefixe}${i}`), title: `${prefixe}-${i}` })),
    count: total, page: 0, perPage: 50,
  }],
});

const parPage: Record<number, { n: number; total: number }> = {};
// Référence STABLE entre deux rendus, comme le vrai TanStack Query : un objet
// neuf à chaque appel ferait boucler tout consommateur qui observe `data`.
const memo = new Map<string, ReturnType<typeof page>>();
vi.mock("../hooks/useRaindrops", () => ({
  useRaindrops: ({ collectionId }: { collectionId: number }) => {
    const p = parPage[collectionId] ?? { n: 0, total: 0 };
    const cle = `${collectionId}:${p.n}:${p.total}`;
    if (!memo.has(cle)) memo.set(cle, page(p.n, p.total, String(collectionId)));
    return { data: memo.get(cle)!, isLoading: false, isError: false };
  },
}));

beforeEach(() => {
  for (const k of Object.keys(parPage)) delete parPage[Number(k)];
  memo.clear();
});

const Aller = ({ id, label }: { id: number; label: string }) => {
  const { go } = useAppState();
  useEffect(() => { go({ kind: "collection", collectionId: id, label }); }, [id]);
  return null;
};

const Spy = () => {
  const { view } = useAppState();
  return <span data-testid="view">{JSON.stringify(view)}</span>;
};

const rendu = (id = 101, label = "Dev") =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppStateProvider>
        <DragProvider>
          <Aller id={id} label={label} />
          <Spy />
          <CollectionView />
        </DragProvider>
      </AppStateProvider>
    </QueryClientProvider>,
  );

describe("CollectionView", () => {
  // La forme même de la vue : d'abord ce qui est DANS la collection, puis une
  // section par sous-collection — Rust est enfant de Dev dans les fixtures.
  it("montre les signets directs, puis une section par sous-collection", () => {
    parPage[101] = { n: 2, total: 2 };
    parPage[201] = { n: 3, total: 3 };
    rendu();
    expect(screen.getByRole("heading", { name: "Dev", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("101-0")).toBeInTheDocument(); // signet direct
    const section = screen.getByRole("region", { name: "Rust" });
    expect(section).toBeInTheDocument();
    expect(section.textContent).toContain("201-0");
  });

  // L'arbitrage assumé : une section ne charge que sa première page, et le
  // compte exact reste annoncé. Sans cela, une collection à dix enfants
  // ferait onze requêtes espacées de 550 ms.
  it("une section incomplète propose « Voir les N » et y navigue", async () => {
    parPage[101] = { n: 0, total: 0 };
    parPage[201] = { n: 50, total: 414 };
    rendu();
    const voir = screen.getByRole("button", { name: /Voir les 414/ });
    await userEvent.click(voir);
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({
      kind: "list", collectionId: 201,
    });
  });

  // §9 « masqué si nul » : tout est chargé, il n'y a rien de plus à voir.
  it("une section complète ne propose rien de plus", () => {
    parPage[101] = { n: 0, total: 0 };
    parPage[201] = { n: 3, total: 3 };
    rendu();
    expect(screen.queryByRole("button", { name: /Voir les/ })).not.toBeInTheDocument();
  });

  // Les contrôles sont en tête et UNIQUES : une section n'a ni tri, ni
  // recherche, ni bascule d'affichage à elle (le grief fait à Raindrop).
  it("aucune section ne duplique les contrôles globaux", () => {
    parPage[101] = { n: 1, total: 1 };
    parPage[201] = { n: 1, total: 1 };
    rendu();
    const section = screen.getByRole("region", { name: "Rust" });
    expect(section.querySelector("select")).toBeNull();
    expect(section.querySelector('input[type="search"], input[placeholder]')).toBeNull();
  });

  // Cocher dans une section doit compter : sans remontée des items chargés,
  // la barre d'actions en masse resterait vide et le geste sans effet.
  it("cocher un signet d'une section alimente la barre d'actions", async () => {
    parPage[101] = { n: 0, total: 0 };
    parPage[201] = { n: 2, total: 2 };
    rendu();
    const section = screen.getByRole("region", { name: "Rust" });
    const cases = section.querySelectorAll('input[type="checkbox"]');
    await userEvent.click(cases[0]!);
    expect(screen.getByText("1 sélectionné(s)")).toBeInTheDocument();
  });
});
