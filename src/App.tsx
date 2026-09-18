import { useEffect, useState } from "react";
import { t } from "./i18n/fr";
import type { Amorce } from "./lib/amorce";
import { useTheme } from "./lib/theme";
import { useSidebarRepliee } from "./lib/panneaux";
import { useAppState } from "./state/appState";
import { Sidebar } from "./components/Sidebar";
import { Icone } from "./design/icones";
import { TopBar } from "./components/TopBar";
import { ListPane } from "./components/ListPane";
import { CleanupDashboard } from "./components/CleanupDashboard";
import { CleanupView } from "./components/CleanupView";
import { ReviewPage } from "./components/ReviewPage";
import { TagsView } from "./components/TagsView";
import { CollectionView } from "./components/CollectionView";
import { DetailPane } from "./components/DetailPane";
import { CommandPalette } from "./components/CommandPalette";
import { Banners } from "./components/Banners";
import { Reglages } from "./components/Reglages";
import { FantomeDrag } from "./components/FantomeDrag";

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

export default function App({ onEtat }: { onEtat: (a: Amorce) => void }) {
  const { resolved, setMode } = useTheme();
  const { view, go, selectedRaindropId, selectRaindrop } = useAppState();
  // R15P-3 : le retour de la Revue revient à la vue d'origine qu'elle porte
  // (posée par BulkBar/CleanupView) ; sans origine notée, repli sur « Tous ».
  const goBack = () =>
    go(
      view.kind === "review" && view.returnView
        ? view.returnView
        : { kind: "list", collectionId: 0, label: t("nav.all") },
    );
  const isDark = resolved === "dark";
  // Task 10 : ⌘E amène le focus dans le composer, quel que soit le champ
  // occupé — le data-testid="composer-input" est le contrat du focus (plan).
  // En vue review, pas de composer monté : le raccourci ne fait rien.
  // Task 11 : ⌘K ouvre la palette ; Échap et le clic-dehors la referment
  // (portés par le composant). Montée conditionnelle : chaque ouverture
  // repart d'une saisie vide.
  const [cmdkOpen, setCmdkOpen] = useState(false);
  // ⌘, — le raccourci macOS des réglages, partout dans le système.
  const [reglagesOuvert, setReglagesOuvert] = useState(false);
  const { repliee, basculer } = useSidebarRepliee();
  // Le volet détail ne s'affiche QUE sur un signet ouvert : une colonne de
  // 320 px occupée par « Sélectionnez un bookmark » coûte le tiers de la
  // largeur utile pour ne rien dire.
  const detailOuvert = selectedRaindropId !== null;
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
      if (e.metaKey && e.key === ",") {
        e.preventDefault();
        setReglagesOuvert(true);
      }
    }
    window.addEventListener("keydown", surRaccourci);
    return () => window.removeEventListener("keydown", surRaccourci);
  }, []);
  function toggleTheme() {
    setMode(isDark ? "light" : "dark");
  }

  return (
    // Task 16 : les bannières dégradées (spec §7) vivent au-dessus de la
    // grille — en état sain Banners rend null et la géométrie est inchangée.
    <div className="flex h-screen min-h-0 flex-col bg-app text-app-ink">
      <Banners />
      {/* Ce que l'on transporte pendant un déplacement — au-dessus de tout,
          inerte au pointeur (il ne doit jamais masquer sa propre cible). */}
      <FantomeDrag />

      {/* L'en-tête de l'APPLICATION, hors de la grille et pleine largeur.
        Il y était auparavant la cellule ligne 1 / colonne 1 — donc de la
        largeur de la barre latérale : la replier réduisait l'en-tête avec
        elle, le bouton de repli disparaissait (plus moyen de la rouvrir) et
        les icônes se déplaçaient. Le titre, les réglages et le thème sont
        à l'application, pas au panneau de gauche. */}
      <header className="flex items-center gap-3 border-b border-app-border bg-app px-4 py-2">
        <button
          type="button"
          className="btn btn-icone"
          aria-label={repliee ? t("nav.deplier") : t("nav.replier")}
          aria-pressed={repliee}
          onClick={basculer}
        >
          <Icone nom="panneauLateral" />
        </button>
        <span className="font-medium">{t("app.title")}</span>
        {/* L'indicateur MCP de l'en-tête (Task 2) est subsumé par <Banners /> :
            un seul émetteur du message, la bannière porte en plus l'action. */}
        <button
          type="button"
          className="btn btn-icone ml-auto"
          aria-label={t("reglages.titre")}
          onClick={() => setReglagesOuvert(true)}
        >
          <Icone nom="engrenage" />
        </button>
        <button
          type="button"
          className="btn"
          aria-label={isDark ? t("theme.toLight") : t("theme.toDark")}
          onClick={toggleTheme}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </button>
      </header>

      {/* Les colonnes latérales sont CONDITIONNELLES : repliée, la barre
          latérale rend sa largeur à la liste ; fermé, le détail aussi. Les
          classes sont écrites en toutes lettres — Tailwind ne voit pas les
          noms construits à l'exécution. */}
      <div
        className={
          "grid min-h-0 flex-1 grid-rows-[auto_1fr] " +
          (repliee
            ? detailOuvert
              ? "grid-cols-[0px_minmax(0,1fr)_320px]"
              : "grid-cols-[0px_minmax(0,1fr)_0px]"
            : detailOuvert
              ? "grid-cols-[240px_minmax(0,1fr)_320px]"
              : "grid-cols-[240px_minmax(0,1fr)_0px]")
        }
      >
        {/* Row 1 col 1 : la cellule que l'en-tête occupait — vide désormais,
            elle ne sert qu'à laisser TopBar en colonne 2. */}
        <div aria-hidden="true" className="border-b border-app-border bg-app" />
        {/* Row 1 col 2 : la barre recherche/filtres/tri de la vue courante
            (rend une cellule vide hors vue list). */}
        <TopBar />
        <div className="border-b border-app-border bg-app" aria-hidden="true" />
        {/* Repliée, la barre latérale n'est pas RENDUE — et pas seulement
            réduite à zéro. Une colonne de 0 px laisserait son contenu
            atteignable au clavier tout en étant invisible : des arrêts de
            tabulation dans un panneau qu'on ne voit pas. */}
        {repliee ? <div aria-hidden="true" /> : <Sidebar />}
        {/* Task 12 : la vue cleanup prend la place de la liste — dashboard de
            nettoyage (compteurs, fraîcheur, scans SSE annulables). Task 13 :
            les vues de traitement cleanupView/* qu'il rend joignables.
            Task 14 : la vue tags (renommer, fusionner, supprimer).
            Task 15 : la Revue de l'action — deux niveaux de confirmation,
            exécution puis retour (goBack, R15P-3). */}
        {view.kind === "review" ? (
          <ReviewPage review={view} goBack={goBack} />
        ) : view.kind === "cleanup" ? (
          <CleanupDashboard />
        ) : view.kind === "cleanupView" ? (
          <CleanupView type={view.type} />
        ) : view.kind === "tags" ? (
          <TagsView />
        ) : view.kind === "collection" ? (
          // Vue d'une collection parente : signets directs puis une section
          // par sous-collection (design validé 2026-09-17).
          <CollectionView />
        ) : (
          <ListPane />
        )}
        {/* Row 2 col 3 : le détail — aperçu, édition inline, actions,
            surlignages (Task 8). Monté SEULEMENT sur un signet ouvert : sa
            colonne est à zéro le reste du temps, et le composant démonté
            n'émet aucune requête. */}
        {detailOuvert && <DetailPane onFermer={() => selectRaindrop(null)} />}
        {/* Palette ⌘K (Task 11) : overlay fixed, hors flux de la grille. */}
        {cmdkOpen && <CommandPalette open onClose={() => setCmdkOpen(false)} />}
        {/* Réglages ⌘, (spec §6) : monté conditionnellement, comme la
            palette — chaque ouverture repart d'un état neuf. */}
        {reglagesOuvert && (
          <Reglages onFermer={() => setReglagesOuvert(false)} onEtat={onEtat} />
        )}
      </div>
    </div>
  );
}
