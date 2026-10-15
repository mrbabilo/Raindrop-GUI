import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useExclusiveAction } from "./useExclusiveAction";

it("refuse un second lancement avant le rendu et libère après résolution", async () => {
  const { result } = renderHook(useExclusiveAction);
  let release!: () => void;
  const action = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
  let running!: Promise<void>;
  act(() => {
    running = result.current.run(action);
    void result.current.run(action);
  });
  expect(action).toHaveBeenCalledTimes(1);
  expect(result.current.pending).toBe(true);
  await act(async () => { release(); await running; });
  expect(result.current.pending).toBe(false);
  await act(async () => { await result.current.run(async () => {}); });
});

it("libère le verrou après un rejet et autorise un nouvel essai", async () => {
  const { result } = renderHook(useExclusiveAction);
  await act(async () => {
    await expect(result.current.run(async () => { throw new Error("échec"); })).rejects.toThrow("échec");
  });
  expect(result.current.pending).toBe(false);
  const retry = vi.fn(async () => {});
  await act(async () => { await result.current.run(retry); });
  expect(retry).toHaveBeenCalledTimes(1);
});
