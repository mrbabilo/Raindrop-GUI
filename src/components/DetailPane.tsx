import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { t } from "../i18n/fr";
import { Icone } from "../design/icones";
import { api } from "../lib/api";
import { useAppState } from "../state/appState";
import { useFiltreEtiquettes } from "../hooks/filtreEtiquettes";
import { useCollections } from "../hooks/useStaticData";
import { ActionsLecture } from "./ActionsLecture";
import { useArchives } from "../hooks/useBackup";
import { useUpdateRaindrop, useTrashRaindrop } from "../hooks/useMutations";
import { RestaurationCorbeille } from "./DetailPane.corbeille";
import { Glyphe } from "../design/glyphes";
import { Etoile } from "../design/Etoile";
import { CarreCollection, PiluleEtiquette } from "../design/Signaux";
import type { Collection, RaindropItem } from "../../shared/types";
import { nomIcone } from "../design/nomIcone";

// Les champs éditables de la fiche (tags et emplacement viendront des Tasks
// 9-11). Les surlignages sont lus directement dans `r.highlights` — déjà
// normalisés par le mapper sidecar ({id: ObjectId chaîne, text, note,
// created}) : la route dédiée /api/highlights/:id appelait un endpoint
// fantôme (404 réel pour tout raindrop, ruling R8cP-1) et a été supprimée.
// Lecture seule en Phase 1 (spec §12).
type ChampEdition = "title" | "excerpt" | "note";

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

// §9 : l'étoile est UNE icône au trait pour toute l'interface — dessinée
// dans src/design/Etoile.tsx (R8P-2, FIX ledger revue finale : la liste
// consomme la même que la fiche, plus d'étoile pleine locale).
const bouton = "rounded border border-app-border px-2 py-1 text-xs";
const coque = "bg-app p-3 text-sm";

export function DetailPane({ onFermer }: { onFermer?: () => void }) {
  const { selectedRaindropId } = useAppState();
  // Cliquer une étiquette montre ce qu'elle range — et un second clic la
  // retire. Le geste est le même partout (hooks/filtreEtiquettes.ts), y
  // compris quand la fiche est ouverte au-dessus d'une vue sans filtres.
  const filtreTags = useFiltreEtiquettes();
  const update = useUpdateRaindrop(selectedRaindropId ?? 0);
  const trash = useTrashRaindrop();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Pick<RaindropItem, ChampEdition>>>({});

  const detail = useQuery({
    queryKey: ["raindrop", selectedRaindropId],
    queryFn: () => api.get<RaindropItem>(`/api/raindrops/${selectedRaindropId}`),
    enabled: selectedRaindropId != null,
  });
  const arbre = useCollections().data ?? [];
  // Rien de sélectionné : la fiche ne demande RIEN (contrat de son test).
  const archives = useArchives({ enabled: selectedRaindropId != null }).data?.set;
  const archive = selectedRaindropId != null && archives?.has(selectedRaindropId) === true;

  // Changer d'item ferme l'édition ET purge le brouillon : sinon un brouillon
  // abandonné sur A repartirait vers B au prochain « Enregistrer ».
  // Revue finale : les mutations aussi se réarment (reset) — l'état d'échec
  // suit l'observateur, pas la clé : sans lui, l'alerte d'un PATCH raté sur
  // A s'afficherait encore sur B (update.error comme trash.error).
  useEffect(() => {
    setEditing(false);
    setDraft({});
    update.reset();
    trash.reset();
  }, [selectedRaindropId]);

  // Quitter l'édition JETTE le brouillon : « Annuler » refermait seulement,
  // et rouvrir montrait la saisie abandonnée — qu'« Enregistrer » envoyait
  // ensuite (audit UX du 2026-09-23).
  const annuler = () => {
    setEditing(false);
    setDraft({});
    update.reset();
  };

  // Échap referme le volet — même idiome que la palette et les Réglages.
  // Écouteur de fenêtre : le volet n'a pas de champ toujours focalisé.
  // Pendant une édition inline, Échap annule la saisie, et seulement elle.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editing) annuler();
      else onFermer?.();
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [onFermer, editing]);

  /** La coque du volet — et sa SORTIE. Le bouton de fermeture ne vivait que
   *  dans le rendu principal : une fiche qui restait en chargement, ou qui
   *  échouait, laissait l'utilisateur enfermé dans un panneau sans issue.
   *  Toute branche passe désormais par ici. */
  const enveloppe = (contenu: ReactNode) => (
    <aside className={coque + " text-app-muted"}>
      {onFermer && (
        <button type="button" className="btn btn-icone mb-2 ml-auto flex" {...nomIcone(t("detail.fermer"))} onClick={onFermer}>
          <Icone nom="croix" />
        </button>
      )}
      {contenu}
    </aside>
  );

  if (selectedRaindropId == null) return enveloppe(t("detail.guest"));
  const r = detail.data;
  if (detail.isError) return enveloppe(t("state.error", { message: detail.error.message }));
  if (!r) return enveloppe(t("state.loading"));

  const setChamp = (key: ChampEdition, value: string) => setDraft((d) => ({ ...d, [key]: value }));
  // Enregistrer ne PATCH que ce qui a changé, et ne referme l'édition qu'en
  // cas de succès : un PATCH en échec laisse le brouillon intact (R8P-1),
  // l'erreur s'affiche inline via update.isError — jamais de saisie détruite
  // en silence.
  const enregistrer = () => {
    if (Object.keys(draft).length === 0) {
      setEditing(false);
      return;
    }
    update.mutateAsync(draft).then(
      () => {
        setDraft({});
        setEditing(false);
      },
      () => { /* erreur déjà exposée par la mutation (update.isError) */ },
    );
  };
  const champ = (key: Exclude<ChampEdition, "title">, rows: number) =>
    editing ? (
      rows === 1 ? (
        <input aria-label={t("detail.champExtrait")} className="w-full rounded border border-app-border bg-app-panel px-2 py-1 text-sm" value={String(draft[key] ?? r[key] ?? "")} onChange={(e) => setChamp(key, e.target.value)} />
      ) : (
        <textarea aria-label={t("detail.champNote")} rows={rows} className="w-full rounded border border-app-border bg-app-panel px-2 py-1 text-sm" value={String(draft[key] ?? r[key] ?? "")} onChange={(e) => setChamp(key, e.target.value)} />
      )
    ) : (
      String(r[key] ?? "") !== "" && (
        <p className="whitespace-pre-wrap text-sm text-app-muted">{String(r[key])}</p>
      )
    );

  const fil = chaine(arbre, r.collectionId);

  return (
    <aside className={coque + " flex h-full flex-col gap-3 overflow-y-auto"}>
      {/* Le volet s'ouvre sur un clic : il doit pouvoir se refermer sans en
          passer par un autre signet. Échap le referme aussi (voir l'effet). */}
      {onFermer && (
        <button type="button" className="btn btn-icone self-end" {...nomIcone(t("detail.fermer"))} onClick={onFermer}>
          <Icone nom="croix" />
        </button>
      )}
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
          aria-label={t("composer.titleAria")}
          className="titre-fiche w-full rounded border border-app-border bg-app-panel px-2 py-1"
          value={String(draft.title ?? r.title)}
          onChange={(e) => setChamp("title", e.target.value)}
        />
      ) : (
        <h2 className="titre-fiche">{r.title}</h2>
      )}
      {/* §2.1 + §7 : le glyphe précède l'URL dans le même filet secondaire ;
          chasse fixe pour l'URL seule. Quiet, jamais un accent (§6). */}
      {/* `href` en http(s) SEULEMENT : l'URL d'un signet est une donnée, et un
          bookmarklet `javascript:` deviendrait du script DANS le webview qui
          porte le jeton local (audit du 2026-09-23 — même borne que les liens
          du mode lecture). Hors http(s), l'adresse se lit sans se suivre. */}
      <a className="flex items-center gap-1 text-app-muted" href={/^https?:\/\//i.test(r.url) ? r.url : undefined} target="_blank" rel="noreferrer">
        <Glyphe type={r.type} />
        <span className="url truncate text-[11px]">{r.url}</span>
      </a>
      {champ("excerpt", 1)}
      {champ("note", 3)}
      {/* §2 : pilules 21 px en détail, et CLIQUABLES comme celles de la liste
          — une étiquette ressemble partout à la même chose, en rendre la
          moitié inerte fait douter de l'autre. */}
      <div className="flex flex-wrap gap-1">
        {r.tags.map((tag) => (
          <PiluleEtiquette
              key={tag}
              nom={tag}
              taille="detail"
              active={filtreTags.estActive(tag)}
              onClick={() => filtreTags.bascule(tag)}
            />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {editing ? (
          <>
            {/* §6 : l'action primaire se marque par la surface (sel), pas par une teinte. */}
            <button type="button" className="btn btn-icone bg-app-sel" {...nomIcone(t("detail.save"))} onClick={enregistrer}>
              <Icone nom="coche" />
            </button>
            <button type="button" className="btn btn-icone" {...nomIcone(t("detail.cancel"))} onClick={annuler}>
              <Icone nom="croix" />
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-icone" {...nomIcone(t("detail.edit"))} onClick={() => setEditing(true)}>
            <Icone nom="crayon" />
          </button>
        )}
        {/* §9 « une icône par geste » : le favori ne garde que l'étoile. Son
            nom accessible porte l'état (les libellés n'ont pas bougé, ils ont
            changé de place) ; à l'œil, c'est la surface `sel` qui le dit —
            l'étoile n'a pas de variante pleine (§9, Etoile.tsx).
            Plus de bouton « Ouvrir » : la ligne d'URL ci-dessus EST le lien,
            deux points d'entrée pour un geste (§9). */}
        <button
          type="button"
          {...nomIcone(r.important ? t("detail.unfavorite") : t("detail.favorite"))}
          aria-pressed={r.important}
          className={bouton + " inline-flex items-center" + (r.important ? " bg-app-sel" : "")}
          onClick={() => void update.mutateAsync({ important: !r.important }).catch(() => { /* inline via update.isError */ })}
        >
          <Etoile />
        </button>
        {/* Un corbeillé ne peut pas être re-corbeillé : le geste devient
            RESTAURER — à l'origine mémorisée, ou vers la destination choisie
            ici si elle est inconnue (§4.2). Le bloc vit dans
            DetailPane.corbeille.tsx (cliquet de build_app.py). */}
        {r.collectionId === -99 ? (
          <RestaurationCorbeille r={r} />
        ) : (
          <button
            type="button"
            className="rounded border border-app-broken px-2 py-1 text-xs text-app-broken"
            onClick={() => void trash.mutateAsync({ id: r.id, from: r.collectionId }).catch(() => { /* inline via trash.isError */ })}
          >
            {t("detail.trash")}
          </button>
        )}
      </div>
      {/* Les deux gestes de contenu (spec lecture §1) : « Lire » l'archive,
          « Voir la page » la page réelle. Le marqueur ci-dessous dit l'ÉTAT
          (« Archivé » / copiable), ces boutons disent le GESTE. */}
      <ActionsLecture r={r} />
      {/* R8P-1 : l'échec d'une écriture s'affiche ici, inline — l'édition
          reste ouverte et le brouillon intact (Enregistrer), l'item reste
          affiché (Corbeille). --color-app-broken : couleur d'un diagnostic (§6). */}
      {(update.isError || trash.isError) && (
        <p role="alert" className="text-xs text-app-broken">
          {t("state.error", { message: String((update.error ?? trash.error)?.message ?? "") })}
        </p>
      )}
      {/* Trois états, jamais confondus (spec sélection §4.1) : archivé EN
          LOCAL, copiable mais pas encore archivé, ou rien du tout. Le
          troisième ne s'affiche pas — §9, « masqué si nul ». */}
      {archive ? (
        <p className="text-xs text-app-muted">{t("marque.archive")}</p>
      ) : r.cache?.status === "ready" ? (
        <p className="text-xs text-app-muted">{t("marque.copiable")}</p>
      ) : null}
      {/* §9 « masqué si nul » : pas de surlignage, pas de section — le titre
          seul annoncerait un contenu que la fiche n'a pas. */}
      {r.highlights.length > 0 && (
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-app-muted">{t("detail.highlights")}</h3>
        {r.highlights.map((h) => (
          <blockquote key={h.id} className="border-l-2 border-app-border pl-2 text-sm">
            {h.text}
            {h.note !== "" && <footer className="text-xs text-app-muted">{h.note}</footer>}
          </blockquote>
        ))}
      </section>
      )}
    </aside>
  );
}
