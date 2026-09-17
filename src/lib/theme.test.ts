import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { setTheme, useTheme } from "./theme";

const mm = (matches: boolean) =>
  vi.fn().mockImplementation((q: string) => ({ matches: matches && q.includes("dark"), addEventListener: vi.fn(), removeEventListener: vi.fn() }));

beforeEach(() => { localStorage.clear(); window.matchMedia = mm(false) as never; document.documentElement.className = ""; });

// initTheme() a été retirée : elle appliquait un mode SANS exposer d'état —
// le hook fait les deux (premier rendu + effet) et est le seul consommateur
// réel du boot. Ces contrats passent donc par lui.
describe("theme", () => {
  it("suit le système (clair) par défaut", () => {
    const { result } = renderHook(() => useTheme());
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(result.current.resolved).toBe("light");
  });

  it("applique dark en mode forcé et le persiste", () => {
    setTheme("dark");
    const { result } = renderHook(() => useTheme());
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("raindrop-gui-theme")).toBe("dark");
    expect(result.current.resolved).toBe("dark");
  });

  it("suit prefers-color-scheme en mode system", () => {
    localStorage.setItem("raindrop-gui-theme", "system");
    window.matchMedia = mm(true) as never;
    renderHook(() => useTheme());
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("setMode change le mode, le persiste et l'applique", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setMode("dark"));
    expect(result.current.mode).toBe("dark");
    expect(localStorage.getItem("raindrop-gui-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
