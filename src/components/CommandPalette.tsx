import { useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { t } from "../i18n/fr";
import { api } from "../lib/api";
import { useCollections, useTags } from "../hooks/useStaticData";
import { useAppState } from "../state/appState";

// Une entrée de la palette : `hint` affiche la catégorie (i18n), `run`
// porte l'action — une navigation via `go`, ou une sélection de fiche via
// selectRaindrop (R11P-2 : choisir un bookmark ouvre son détail).
interface Row {
  key: string;
  label: string;
  hint: string;
  run(): void;
}

// Palette ⌘K (Task 11) : bookmarks par recherche serveur (dès 2 caractères —
// contrat porté seul par `enabled`), collections/tags filtrés localement,
// vues de nettoyage et corbeille en accès direct. Montée par App via
// `open`/`onClose` ; App la monte conditionnellement, l'état (saisie,
// curseur) repart donc à zéro à chaque ouverture — `initialQuery` préremplit
// (tests, futur lien profond).
export function CommandPalette({ open, onClose, initialQuery = "" }: { open: boolean; onClose(): void; initialQuery?: string }) {
  const { go, selectRaindrop } = useAppState();
  const collections = useCollections();
  const tags = useTags();
  const [q, setQ] = useState(initialQuery);
  const [cursor, setCursor] = useState(0);

  // Recherche serveur : `{search, per_page: 8}` tel que contracté au plan.
  const bookmarks = useQuery({
    queryKey: ["cmdk", q],
    queryFn: () => api.get<{ items: { id: number; title: string }[] }>("/api/raindrops", { search: q, per_page: 8 }),
    enabled: open && q.length >= 2,
  });

  if (!open) return null;
  const lower = q.toLowerCase();
  // R11P-1 : la navigation tag porte label ET search `#tag` — le filtre
  // serveur `#tag` est prouvé en réel (search=#webdesign → count exact du
  // tag). Sans `search`, listQuery lit view.search absent : « Tous » non
  // filtré. Vues : formes réelles du type View (appState.tsx).
  const rows: Row[] = [
    // R11P-2 : choisir un bookmark sélectionne sa fiche dans le détail —
    // même geste qu'un clic sur une ligne de liste (l'URL y est cliquable) ;
    // pas de changement de vue, l'ouverture externe reste un clic depuis
    // la fiche.
    ...(bookmarks.data?.items ?? []).map((b) => ({ key: `b${b.id}`, label: b.title, hint: t("cmdk.hintBookmark"), run: () => selectRaindrop(b.id) })),
    ...(collections.data ?? [])
      .filter((c) => c.title.toLowerCase().includes(lower))
      .map((c) => ({ key: `c${c.id}`, label: c.title, hint: t("cmdk.hintCollection"), run: () => go({ kind: "list", collectionId: c.id, label: c.title }) })),
    ...(tags.data ?? [])
      .filter((tg) => tg.name.toLowerCase().includes(lower))
      .map((tg) => ({ key: `t${tg.name}`, label: `#${tg.name}`, hint: t("cmdk.hintTag"), run: () => go({ kind: "list", collectionId: 0, label: `#${tg.name}`, search: `#${tg.name}` }) })),
    { key: "cleanup", label: t("nav.cleanup"), hint: t("cmdk.hintView"), run: () => go({ kind: "cleanup" }) },
    { key: "dead", label: t("cleanup.dead"), hint: t("cmdk.hintView"), run: () => go({ kind: "cleanupView", type: "dead" }) },
    { key: "dup", label: t("cleanup.duplicates"), hint: t("cmdk.hintView"), run: () => go({ kind: "cleanupView", type: "duplicates" }) },
    // R15P-5 : la vue tags (T14) devient joignable — elle n'avait plus
    // aucune entrée depuis qu'elle existe.
    { key: "tags", label: t("nav.tags"), hint: t("cmdk.hintView"), run: () => go({ kind: "tags" }) },
    { key: "trash", label: t("nav.trash"), hint: t("cmdk.hintView"), run: () => go({ kind: "list", collectionId: -99, label: t("nav.trash") }) },
  ];

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") return onClose();
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, rows.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === "Enter") { rows[cursor]?.run(); onClose(); }
  };

  return (
    // DESIGN.md §6 : la ligne active prend la surface `sel` — même précédent
    // que la sidebar et les puces de nature (R6bP-2), « jamais une teinte ».
    // Le `bg-app-panel` du snippet aurait été invisible sur le panneau,
    // lui-même en `work`/`app-panel`.
    <div className="fixed inset-0 z-50 bg-black/40 p-4 pt-24" onClick={onClose}>
      <div
        className="mx-auto max-w-lg overflow-hidden rounded border border-app-border bg-app-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Motif combobox d'ARIA 1.2 : le focus ne quitte JAMAIS le champ,
            c'est `aria-activedescendant` qui désigne l'option courante, et
            `aria-controls` dit quelle liste le champ commande. La palette
            n'existe pas fermée (montée à l'ouverture), d'où `expanded` qui
            vaut toujours vrai — écrit comme une valeur, pas comme une
            chaîne figée dont on ne saurait plus si elle est un oubli. */}
        <input
          role="combobox"
          aria-expanded={true}
          aria-controls="cmdk-liste"
          aria-activedescendant={rows.length > 0 ? `cmdk-option-${cursor}` : undefined}
          autoFocus
          className="w-full border-b border-app-border bg-transparent px-3 py-2 text-sm outline-none"
          placeholder={t("cmdk.placeholder")}
          value={q}
          onChange={(e) => { setQ(e.target.value); setCursor(0); }}
          onKeyDown={onKey}
        />
        {/* `role="option"` sur le <li> lui-même : un <li> nu entre la listbox
            et ses options rompt la filiation qu'attend un lecteur d'écran, et
            poser ce rôle sur un bouton écrase le rôle d'un élément déjà
            interactif — le champ garde le focus, l'option n'a pas à le
            prendre. */}
        <ul role="listbox" id="cmdk-liste" className="max-h-80 overflow-y-auto text-sm">
          {rows.map((r, i) => (
            <li
              key={r.key}
              id={`cmdk-option-${i}`}
              role="option"
              aria-selected={i === cursor}
              className={"flex cursor-pointer justify-between px-3 py-2 text-left " + (i === cursor ? "bg-app-sel font-medium" : "")}
              onMouseEnter={() => setCursor(i)}
              onClick={() => { r.run(); onClose(); }}
            >
              <span className="truncate">{r.label}</span>
              <span className="text-xs text-app-muted">{r.hint}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
