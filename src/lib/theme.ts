export type ThemeMode = "system" | "light" | "dark";
const KEY = "raindrop-gui-theme";

export function initTheme(): ThemeMode {
  const mode = (localStorage.getItem(KEY) as ThemeMode) ?? "system";
  apply(mode);
  return mode;
}

export function setTheme(mode: ThemeMode): void {
  localStorage.setItem(KEY, mode);
  apply(mode);
}

function apply(mode: ThemeMode): void {
  const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}
