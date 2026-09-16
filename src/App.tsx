import { useEffect, useState } from "react";
import { t } from "./i18n/fr";
import { useTheme } from "./lib/theme";
import { useHealth } from "./hooks/useStaticData";
import { useAppState } from "./state/appState";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { ListPane } from "./components/ListPane";
import { DetailPane } from "./components/DetailPane";
import { CommandPalette } from "./components/CommandPalette";

// Task 9 : la vue review prend la place de la liste — stub en attendant la
// Revue de l'action (Task 15 : aperçu filtrable, export CSV, exécution,
// frappe « SUPPRIMER » pour le vidage — spec §4.2).
function RevueStub() {
  return (
    <section aria-label={t("review.title")} className="flex h-full items-center justify-center bg-app text-app-muted">
      {t("review.title")}
    </section>
  );
}

// Icônes SVG (DESIGN.md §9 : jamais d'emoji), grille 16px, trait 1,7.
function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3.3" stroke="currentColor" strokeWidth="1.7" />
      <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <path d="M8 1.2v1.8M8 13v1.8M1.2 8h1.8M13 8h1.8" />
        <path d="M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3" />
      </g>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13.2 9.8A5.6 5.6 0 0 1 6.2 2.8a5.6 5.6 0 1 0 7 7Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function App() {
  const { resolved, setMode } = useTheme();
  const { data: health } = useHealth();
  const { view } = useAppState();
  const isDark = resolved === "dark";
  const mcpDown = health !== undefined && health.mcp !== "connected";
  // Task 10 : ⌘E amène le focus dans le composer, quel que soit le champ
  // occupé — le data-testid="composer-input" est le contrat du focus (plan).
  // En vue review, pas de composer monté : le raccourci ne fait rien.
  // Task 11 : ⌘K ouvre la palette ; Échap et le clic-dehors la referment
  // (portés par le composant). Montée conditionnelle : chaque ouverture
  // repart d'une saisie vide.
  const [cmdkOpen, setCmdkOpen] = useState(false);
  useEffect(() => {
    function surRaccourci(e: KeyboardEvent) {
      if (e.metaKey && e.key === "e") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('[data-testid="composer-input"]')?.focus();
      }
      if (e.metaKey && e.key === "k") {
        e.preventDefault();
        setCmdkOpen(true);
      }
    }
    window.addEventListener("keydown", surRaccourci);
    return () => window.removeEventListener("keydown", surRaccourci);
  }, []);
  function toggleTheme() {
    setMode(isDark ? "light" : "dark");
  }

  return (
    <div className="grid h-screen grid-cols-[240px_minmax(0,1fr)_320px] grid-rows-[auto_1fr] bg-app text-app-ink">
      <header className="flex items-center gap-3 border-b border-app-border bg-app px-4 py-2">
        <span className="font-medium">{t("app.title")}</span>
        {mcpDown && (
          <span className="text-app-broken" role="status">
            {t("banner.crashed")}
          </span>
        )}
        <button
          type="button"
          className="btn ml-auto"
          aria-label={isDark ? t("theme.toLight") : t("theme.toDark")}
          onClick={toggleTheme}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </button>
      </header>
      {/* Row 1 col 2 : la barre recherche/filtres/tri de la vue courante
          (rend une cellule vide hors vue list). */}
      <TopBar />
      <div className="border-b border-app-border bg-app" aria-hidden="true" />
      <Sidebar />
      {view.kind === "review" ? <RevueStub /> : <ListPane />}
      {/* Row 2 col 3 : détail permanent — aperçu, édition inline, actions,
          surlignages (Task 8). */}
      <DetailPane />
      {/* Palette ⌘K (Task 11) : overlay fixed, hors flux de la grille. */}
      {cmdkOpen && <CommandPalette open onClose={() => setCmdkOpen(false)} />}
    </div>
  );
}
