// Sonde d'audit temporaire : assertions sur le comportement attendu.
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { Composer } from "./components/Composer";
import { useOuvrirSignet } from "./hooks/useOuvrirSignet";
import { raindrop } from "./test/fixtures";
import { jobEvents } from "./lib/sse";

const mocks = vi.hoisted(() => ({ send: vi.fn(), create: vi.fn(), inventory: vi.fn(), go: vi.fn(), select: vi.fn() }));
vi.mock("./lib/api", () => ({ api: { send: mocks.send } }));
vi.mock("./hooks/useMutations", () => ({ useCreateRaindrop: () => ({ mutateAsync: mocks.create, isPending: false }) }));
vi.mock("./state/appState", () => ({ useAppState: () => ({ view: { kind: "list", collectionId: 1 }, go: mocks.go, selectRaindrop: mocks.select }) }));
vi.mock("./hooks/useBackup", () => ({ useArchives: () => ({}), useJobsEnVol: () => ({}), chargerInventaire: mocks.inventory }));

beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("ne transmet pas le titre de A lors de la création de B", async () => {
  mocks.send.mockImplementation(async (_method: string, path: string) => path === "/api/parse-url" ? { title: "Titre A" } : {});
  mocks.create.mockResolvedValue({});
  render(<Composer />);
  const input = screen.getByTestId("composer-input");
  fireEvent.change(input, { target: { value: "https://a.example" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  expect(screen.getByLabelText("Titre")).toHaveValue("Titre A");
  fireEvent.change(input, { target: { value: "https://b.example" } });
  await act(async () => { fireEvent.submit(input.closest("form")!); });
  expect(mocks.create.mock.calls[0]![0]).not.toHaveProperty("title", "Titre A");
});

it("conserve le nouveau brouillon quand la création précédente aboutit", async () => {
  let finish!: (value: unknown) => void;
  mocks.create.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<Composer />);
  const input = screen.getByTestId("composer-input");
  fireEvent.change(input, { target: { value: "https://a.example" } });
  fireEvent.submit(input.closest("form")!);
  fireEvent.change(input, { target: { value: "https://b.example" } });
  await act(async () => { finish({}); });
  expect(input).toHaveValue("https://b.example");
});

it("le dernier clic gagne même si son inventaire répond en premier", async () => {
  const pending: Array<(value: { set: Set<number> }) => void> = [];
  mocks.inventory.mockImplementation(() => new Promise(resolve => pending.push(resolve)));
  const { result } = renderHook(useOuvrirSignet);
  act(() => { result.current(raindrop({ id: 1 })); result.current(raindrop({ id: 2 })); });
  await act(async () => { pending[1]!({ set: new Set([1, 2]) }); });
  await act(async () => { pending[0]!({ set: new Set([1, 2]) }); });
  expect(mocks.select).toHaveBeenLastCalledWith(2);
});

it("ne navigue pas après démontage de la liste", async () => {
  let finish!: (value: { set: Set<number> }) => void;
  mocks.inventory.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { result, unmount } = renderHook(useOuvrirSignet);
  act(() => result.current(raindrop({ id: 1 })));
  unmount();
  await act(async () => { finish({ set: new Set([1]) }); });
  expect(mocks.go).not.toHaveBeenCalled();
});

it("décode un événement SSE dont les CRLF chevauchent les chunks", async () => {
  const chunks = ['event: done\r', '\ndata: {}\r', '\n\r', '\n'];
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({
    start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); },
  }))));
  const done = vi.fn();
  await jobEvents("audit", { onEvent: vi.fn(), onDone: done }, new AbortController().signal);
  expect(done).toHaveBeenCalledOnce();
});
