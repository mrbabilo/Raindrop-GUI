import { t } from "../i18n/fr";
import { useAppState } from "../state/appState";
import { useRaindrops } from "../hooks/useRaindrops";
import { listQueryArgs } from "../hooks/listQuery";
import { Glyphe, NATURE_TYPES, type NatureType } from "../design/glyphes";

// DESIGN.md §11 : hauteur 26 px, rayon 7 px, fond `work` (bg-app-panel),
// texte `quiet` (text-app-muted) — ce sont des commandes, pas les pilules
// thématiques de §2. Actif = surface `sel`, jamais une teinte.
const chip = "flex h-[26px] items-center gap-1 rounded-[7px] bg-app-panel px-2 text-xs text-app-muted";
const chipOn = " bg-app-sel";

export function NatureChips({ focused }: { focused: boolean }) {
  const { view, patchList } = useAppState();
  // Toujours la vue non filtrée par nature (R6bP-1) : la queryKey se confond
  // avec celle de ListPane quand aucune puce n'est active (zéro requête en
  // plus), et le comptage ne s'effondre jamais quand une puce l'est.
  const query = useRaindrops(listQueryArgs(view, { omitMedia: true }));
  const media = view.kind === "list" ? view.media : undefined;

  if (!focused && !media) return null;

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
  // DESIGN.md §9 « masqué si nul » : une nature absente de la vue n'a pas de
  // puce — elle ne filtrerait rien, cliquer dessus viderait la liste. Seule
  // exception, la puce ACTIVE : sans elle, tomber à zéro résultat ferait
  // disparaître la seule commande capable de retirer le filtre.
  // Tri stable : à fréquence égale, l'ordre retombe sur le tableau §2.1.
  const ordered = [...NATURE_TYPES]
    .filter((type) => (counts.get(type) ?? 0) > 0 || media === type)
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  if (ordered.length === 0) return null;

  const toggle = (type: NatureType) => patchList({ media: media === type ? undefined : type });

  return (
    <div className="flex gap-1 px-3 pb-2">
      {ordered.map((type) => {
        const active = media === type;
        return (
          <button
            key={type}
            type="button"
            aria-pressed={active}
            className={chip + (active ? chipOn : "")}
            onClick={() => toggle(type)}
          >
            <Glyphe type={type} />
            {t(`nature.${type}`)}
          </button>
        );
      })}
    </div>
  );
}
