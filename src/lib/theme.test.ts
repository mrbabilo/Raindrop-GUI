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

// Le thème `system` suit l'OS À CHAUD. Trouvé dans les sources de templates
// (la checklist « clair/sombre » des bons shells desktop) : sans l'écouteur,
// basculer macOS ne changeait rien avant rechargement.
describe("ecouterSysteme — le système suit à chaud", () => {
  it("bascule la classe au changement de l'OS, et se désabonne proprement", () => {
    let sombre = false;
    const ajoutes: Array<() => void> = [];
    const retires: Array<() => void> = [];
    window.matchMedia = ((q: string) => ({
      matches: sombre && q.includes("dark"),
      addEventListener: (_: string, l: () => void) => ajoutes.push(l),
      removeEventListener: (_: string, l: () => void) => retires.push(l),
    })) as never;
    localStorage.setItem("raindrop-gui-theme", "system");
    const { unmount } = renderHook(() => useTheme());
    expect(ajoutes.length).toBeGreaterThan(0);
    // La présence d'abord : l'OS passe en sombre, la classe suit SANS re-render.
    act(() => {
      sombre = true;
      ajoutes.forEach((l) => l());
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    act(() => {
      sombre = false;
      ajoutes.forEach((l) => l());
    });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    // L'aller ne prouve rien sans le retour : le démontage désabonne.
    unmount();
    expect(retires.length).toBe(ajoutes.length);
  });

  it("les modes forcés n'écoutent PAS — l'OS ne doit pas écraser un choix", () => {
    const ajoutes: Array<() => void> = [];
    window.matchMedia = ((q: string) => ({
      matches: false,
      addEventListener: (_: string, l: () => void) => ajoutes.push(l),
      removeEventListener: vi.fn(),
    })) as never;
    localStorage.setItem("raindrop-gui-theme", "dark");
    const { unmount } = renderHook(() => useTheme());
    expect(ajoutes).toHaveLength(0);
    unmount();
  });
});
