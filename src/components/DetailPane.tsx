import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { t } from "../i18n/fr";
import { api } from "../lib/api";
import { useAppState } from "../state/appState";
import { useCollections } from "../hooks/useStaticData";
import { useUpdateRaindrop, useTrashRaindrop } from "../hooks/useMutations";
import { Glyphe } from "../design/glyphes";
import { CarreCollection, PiluleEtiquette } from "../design/Signaux";
import type { Collection, RaindropItem } from "../../shared/types";

// Les champs éditables de la fiche (tags et emplacement viendront des Tasks
// 9-11). get_highlights (sidecar) transmet les items bruts {_id, text, note,
// color} : la conversion _id→id reste côté front (convention « le front ne
// voit jamais le format brut », enveloppe posée en Task 0c). Lecture seule
// en Phase 1 (spec §12).
type ChampEdition = "title" | "excerpt" | "note";
interface Surlignage {
  id: number;
  text: string;
  note: string;
  color: string;
}

// DESIGN.md §4 : « chaque lien reprend la signalétique de sa collection » —
// fil d'Ariane dans la fiche. Même marche bornée que racine() (Signaux) :
// une boucle de parents, donnée corrompue, ne dépasse jamais la longueur de
// l'arbre. La couleur du carré appartient à la racine (§4) — CarreCollection
// reçoit donc le titre de fil[0].
function chaine(arbre: Collection[], id: number): Collection[] {
  const out: Collection[] = [];
  let courant = arbre.find((c) => c.id === id);
  for (let i = 0; courant && i < arbre.length; i++) {
    out.unshift(courant);
    const parent = courant.parentId;
    courant = parent == null ? undefined : arbre.find((c) => c.id === parent);
  }
  return out;
}

// §9 : icône dessinée en SVG, jamais d'emoji — outline tant que le lien
// n'est pas favori, pleine ensuite (même étoile que la ligne).
function Etoile({ pleine }: { pleine: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill={pleine ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round">
      <path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" />
    </svg>
  );
}

const bouton = "rounded border border-app-border px-2 py-1 text-xs";
const coque = "bg-app p-3 text-sm";

export function DetailPane() {
  const { selectedRaindropId } = useAppState();
  const update = useUpdateRaindrop(selectedRaindropId ?? 0);
  const trash = useTrashRaindrop();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Pick<RaindropItem, ChampEdition>>>({});

  const detail = useQuery({
    queryKey: ["raindrop", selectedRaindropId],
    queryFn: () => api.get<RaindropItem>(`/api/raindrops/${selectedRaindropId}`),
    enabled: selectedRaindropId != null,
  });
  const surlignages = useQuery({
    queryKey: ["highlights", selectedRaindropId],
    queryFn: async () => {
      const brut = await api.get<{ items: { _id: number; text: string; note: string; color: string }[] }>(
        `/api/highlights/${selectedRaindropId}`,
      );
      return brut.items.map(({ _id, text, note, color }): Surlignage => ({ id: _id, text, note, color }));
    },
    enabled: selectedRaindropId != null,
  });
  const arbre = useCollections().data ?? [];

  // Changer d'item ferme l'édition ET purge le brouillon : sinon un brouillon
  // abandonné sur A repartirait vers B au prochain « Enregistrer ».
  useEffect(() => {
    setEditing(false);
    setDraft({});
  }, [selectedRaindropId]);

  if (selectedRaindropId == null)
    return <aside className={coque + " text-app-muted"}>{t("detail.guest")}</aside>;
  const r = detail.data;
  if (detail.isError)
    return <aside className={coque + " text-app-muted"}>{t("state.error", { message: detail.error.message })}</aside>;
  if (!r) return <aside className={coque + " text-app-muted"}>{t("state.loading")}</aside>;

  const setChamp = (key: ChampEdition, value: string) => setDraft((d) => ({ ...d, [key]: value }));
  // Enregistrer ne PATCH que ce qui a changé : un brouillon vide ne part pas.
  const enregistrer = () => {
    if (Object.keys(draft).length > 0) void update.mutateAsync(draft);
    setDraft({});
    setEditing(false);
  };
  const champ = (key: Exclude<ChampEdition, "title">, rows: number) =>
    editing ? (
      rows === 1 ? (
        <input className="w-full rounded border border-app-border bg-app-panel px-2 py-1 text-sm" value={String(draft[key] ?? r[key] ?? "")} onChange={(e) => setChamp(key, e.target.value)} />
      ) : (
        <textarea rows={rows} className="w-full rounded border border-app-border bg-app-panel px-2 py-1 text-sm" value={String(draft[key] ?? r[key] ?? "")} onChange={(e) => setChamp(key, e.target.value)} />
      )
    ) : (
      String(r[key] ?? "") !== "" && (
        <p className="whitespace-pre-wrap text-sm text-app-muted">{String(r[key])}</p>
      )
    );

  const fil = chaine(arbre, r.collectionId);

  return (
    <aside className={coque + " flex h-full flex-col gap-3 overflow-y-auto"}>
      {/* §4 : fil d'Ariane — le carré porte la teinte de la racine, les titres
          suivent le chemin. Arbre pas encore chargé ou collection inconnue :
          pas de fil (jamais de repli inventé). */}
      {fil.length > 0 && (
        <nav className="flex items-center gap-1 text-xs text-app-muted" aria-label={t("detail.breadcrumb")}>
          <CarreCollection collectionId={fil[0]!.id} titre={fil[0]!.title} />
          {fil.map((c, i) => (
            <span key={c.id} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden="true">›</span>}
              <span>{c.title}</span>
            </span>
          ))}
        </nav>
      )}
      {editing ? (
        <input
          className="titre-fiche w-full rounded border border-app-border bg-app-panel px-2 py-1"
          value={String(draft.title ?? r.title)}
          onChange={(e) => setChamp("title", e.target.value)}
        />
      ) : (
        <h2 className="titre-fiche">{r.title}</h2>
      )}
      {/* §2.1 + §7 : le glyphe précède l'URL dans le même filet secondaire ;
          chasse fixe pour l'URL seule. Quiet, jamais un accent (§6). */}
      <a className="flex items-center gap-1 text-app-muted" href={r.url} target="_blank" rel="noreferrer">
        <Glyphe type={r.type} />
        <span className="url truncate text-[11px]">{r.url}</span>
      </a>
      {champ("excerpt", 1)}
      {champ("note", 3)}
      {/* §2 : pilules 21 px en détail — inertes, une étiquette de fiche n'est
          pas une commande. */}
      <div className="flex flex-wrap gap-1">
        {r.tags.map((tag) => (
          <PiluleEtiquette key={tag} nom={tag} taille="detail" />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {editing ? (
          <>
            {/* §6 : l'action primaire se marque par la surface (sel), pas par une teinte. */}
            <button type="button" className="rounded bg-app-sel px-2 py-1 text-xs font-medium" onClick={enregistrer}>
              {t("detail.save")}
            </button>
            <button type="button" className={bouton} onClick={() => setEditing(false)}>
              {t("detail.cancel")}
            </button>
          </>
        ) : (
          <button type="button" className={bouton} onClick={() => setEditing(true)}>
            {t("detail.edit")}
          </button>
        )}
        <button type="button" className={bouton} onClick={() => void update.mutateAsync({ important: !r.important })}>
          <Etoile pleine={r.important} />
          {r.important ? t("detail.unfavorite") : t("detail.favorite")}
        </button>
        <a className={bouton + " inline-flex items-center"} href={r.url} target="_blank" rel="noreferrer">
          {t("detail.open")}
        </a>
        {/* `from` = collection courante : sans lui le sidecar ne mémorise pas
            l'origine et la restauration devient impossible (spec §4.2, Task 0b).
            --color-app-broken, seul rouge légitime : couleur d'un diagnostic (§6). */}
        <button
          type="button"
          className="rounded border border-app-broken px-2 py-1 text-xs text-app-broken"
          onClick={() => void trash.mutateAsync({ id: r.id, from: r.collectionId })}
        >
          {t("detail.trash")}
        </button>
      </div>
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-app-muted">{t("detail.highlights")}</h3>
        {(surlignages.data ?? []).map((h) => (
          <blockquote key={h.id} className="border-l-2 border-app-border pl-2 text-sm">
            {h.text}
            {h.note !== "" && <footer className="text-xs text-app-muted">{h.note}</footer>}
          </blockquote>
        ))}
      </section>
    </aside>
  );
}
