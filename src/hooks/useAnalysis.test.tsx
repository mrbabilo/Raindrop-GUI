import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useStartScan } from "./useAnalysis";

const { sendMock, jobEventsMock } = vi.hoisted(() => ({ sendMock: vi.fn(), jobEventsMock: vi.fn() }));
vi.mock("../lib/api", () => ({ api: { get: vi.fn(), send: sendMock } }));
vi.mock("../lib/sse", () => ({ jobEvents: jobEventsMock }));

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const avec = (qc: QueryClient) => ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

beforeEach(() => {
  sendMock.mockReset().mockResolvedValue({ jobId: "j1" });
  jobEventsMock.mockReset();
});

// Le suivi d'un scan (audit du 2026-09-23) : un flux qui se FERME sans terme
// — ni done, ni error, ni cancelled — laissait la mutation `pending` pour
// toujours. Elle doit se régler, et l'invalidation relire l'état vrai.
describe("useStartScan — la fin du suivi", () => {
  it("témoin : un done termine la mutation et invalide ['analysis']", async () => {
    jobEventsMock.mockImplementation(async (_id: string, h: { onEvent(e: object): void; onDone(): void }) => {
      h.onEvent({ kind: "done" });
      h.onDone();
    });
    const qc = client();
    const invalider = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useStartScan("links"), { wrapper: avec(qc) });
    result.current.mutate(undefined);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalider).toHaveBeenCalledWith({ queryKey: ["analysis"] });
  });

  it("flux clos SANS terme : la mutation se règle quand même, et invalide", async () => {
    jobEventsMock.mockResolvedValue(undefined); // le flux se ferme, rien d'autre
    const qc = client();
    const invalider = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useStartScan("links"), { wrapper: avec(qc) });
    result.current.mutate(undefined);
    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 1000 });
    expect(invalider).toHaveBeenCalledWith({ queryKey: ["analysis"] });
  });

  it("un event error rejette — l'échec ne se lit pas comme une fin normale", async () => {
    jobEventsMock.mockImplementation(async (_id: string, h: { onEvent(e: object): void; onDone(): void }) => {
      h.onEvent({ kind: "error", message: "MCP déconnecté" });
      h.onDone();
    });
    const { result } = renderHook(() => useStartScan("links"), { wrapper: avec(client()) });
    result.current.mutate(undefined);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("MCP déconnecté");
  });

  // Annuler coupe le flux SSE (AbortError) : ce que le scan a persisté avant
  // l'arrêt doit se relire — l'invalidation ne dépend pas de l'issue.
  it("un suivi interrompu (annulation, échec) invalide quand même", async () => {
    jobEventsMock.mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));
    const qc = client();
    const invalider = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useStartScan("links"), { wrapper: avec(qc) });
    result.current.mutate(undefined);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalider).toHaveBeenCalledWith({ queryKey: ["analysis"] });
  });
});
