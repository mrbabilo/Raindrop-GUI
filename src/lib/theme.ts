import { useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";
const KEY = "raindrop-gui-theme";

export function setTheme(mode: ThemeMode): void {
  localStorage.setItem(KEY, mode);
  apply(mode);
}

// Le hook expose l'état *résolu* (clair/sombre effectif) — pas seulement le
// mode brut stocké. Un appelant qui ne lit que `mode` ne peut pas distinguer
// "system + OS sombre" de "system + OS clair" sans reconsulter matchMedia
// lui-même.
export function useTheme(): {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
} {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode());

  // Le premier rendu calcule déjà `resolved` correctement (lecture pure,
  // sans mutation du DOM) ; l'effet ne fait qu'appliquer la classe .dark
  // sur <html>.
  useEffect(() => {
    apply(mode);
  }, [mode]);

  // Le mode `system` suit l'OS À CHAUD : sans cet écouteur, `matchMedia`
  // n'est lu qu'au rendu — basculer macOS en sombre laissait l'application
  // dans l'ancien thème jusqu'à un rechargement (écrit dans la ROADMAP
  // « Hors ligne » du 2026-09-18 ; l'écoute n'a rien d'hors ligne).
  useEffect(() => {
    if (mode !== "system") return;
    return ecouterSysteme(() => apply("system"));
  }, [mode]);

  function setMode(next: ThemeMode): void {
    setTheme(next);
    setModeState(next);
  }

  return { mode, resolved: resolveDark(mode) ? "dark" : "light", setMode };
}

/** L'écoute du thème système, extraite du hook : testable sans composant,
 *  le harnais `matchMedia` de jsdom détenant ses propres écouteurs. */
export function ecouterSysteme(alerter: () => void): () => void {
  const media = matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", alerter);
  return () => media.removeEventListener("change", alerter);
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
