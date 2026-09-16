import { useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";
const KEY = "raindrop-gui-theme";

export function initTheme(): ThemeMode {
  const mode = readStoredMode();
  apply(mode);
  return mode;
}

export function setTheme(mode: ThemeMode): void {
  localStorage.setItem(KEY, mode);
  apply(mode);
}

// Le hook, contrairement à initTheme()/setTheme(), expose l'état *résolu*
// (clair/sombre effectif) — pas seulement le mode brut stocké. Un appelant
// qui ne lit que `mode` ne peut pas distinguer "system + OS sombre" de
// "system + OS clair" sans reconsulter matchMedia lui-même.
export function useTheme(): {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
} {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode());

  // Le premier rendu calcule déjà `resolved` correctement (lecture pure,
  // sans mutation du DOM) ; l'effet ne fait qu'appliquer la classe .dark
  // sur <html>, comme initTheme()/setTheme() le feraient.
  useEffect(() => {
    apply(mode);
  }, [mode]);

  function setMode(next: ThemeMode): void {
    setTheme(next);
    setModeState(next);
  }

  return { mode, resolved: resolveDark(mode) ? "dark" : "light", setMode };
}

function readStoredMode(): ThemeMode {
  return (localStorage.getItem(KEY) as ThemeMode) ?? "system";
}

function resolveDark(mode: ThemeMode): boolean {
  return mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
}

function apply(mode: ThemeMode): void {
  document.documentElement.classList.toggle("dark", resolveDark(mode));
}
