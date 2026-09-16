import { describe, it, expect, beforeEach, vi } from "vitest";
import { initTheme, setTheme } from "./theme";

const mm = (matches: boolean) =>
  vi.fn().mockImplementation((q: string) => ({ matches: matches && q.includes("dark"), addEventListener: vi.fn(), removeEventListener: vi.fn() }));

describe("theme", () => {
  beforeEach(() => { localStorage.clear(); window.matchMedia = mm(false) as never; document.documentElement.className = ""; });

  it("suit le système (clair) par défaut", () => {
    initTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("applique dark en mode forcé et le persiste", () => {
    setTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("raindrop-gui-theme")).toBe("dark");
  });

  it("suit prefers-color-scheme en mode system", () => {
    window.matchMedia = mm(true) as never;
    initTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
