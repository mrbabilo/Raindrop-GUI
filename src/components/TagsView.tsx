import { useEffect, useRef, useState } from "react";
import { t } from "../i18n/fr";
import { Icone } from "../design/icones";
import { EtatListe } from "./EtatListe";
import { useAppState } from "../state/appState";
import { useTags } from "../hooks/useStaticData";
import { useTagManage } from "../hooks/useMutations";
import type { Tag } from "../../shared/types";

// Task 14 — la vue Tags : renommer, fusionner, supprimer. La liste suit la
// densité « entrée de navigation 28 px » (DESIGN.md §8, comme la sidebar) ;
// le nom reste du texte précédé du # — pas une pilule : les pilules sont
// l'étiquette portée par un lien (§2), ici c'est l'objet même du travail.
// R8P-1 : tout échec reste inline (role="alert"), état conservé. La
// suppression en masse est l'affaire de la Revue (T15) ; ici unitaire, avec
// confirm inline — deux gestes réels avant tout envoi (§10 : le bouton nomme
// ce qui va se produire).

// Erreur d'action inline (pattern T8/T12) : ce qui s'est passé, jamais silencieux.
function Erreur({ message }: { message: string }) {
  return (
    <p role="alert" className="text-xs text-app-broken">
      {t("state.error", { message })}
    </p>
  );
}

// Une ligne : case (sélection de fusion), #nom (compte), Renommer (input
// inline : Entrée envoie, Échap/blur abandonne), Supprimer qui devient
// « Confirmer » (niveau 1 — le second clic seul envoie ; blur/Échap désarme).
function LigneTag({ tag, coche, bascule }: { tag: Tag; coche: boolean; bascule: (name: string) => void }) {
  const manage = useTagManage();
  const [edition, setEdition] = useState(false);
  const [nom, setNom] = useState("");
  const [armee, setArmee] = useState(false);
  const ligneRef = useRef<HTMLLIElement>(null);
  const { go } = useAppState();
  const fermerEdition = () => {
    setEdition(false);
    setNom("");
  };
  const renommer = () => {
    const vise = nom.trim();
    if (vise === "") return;
    // Renommer vers le nom qu'elle porte déjà n'est pas un renommage : ça
    // ferait une écriture, une invalidation et un rechargement de toute la
    // liste pour rien. On ferme, simplement.
    if (vise === tag.name) {
      fermerEdition();
      return;
    }
    // Un envoi suffit : deux Entrée rapides lançaient deux renommages, le
    // second portant sur un nom qui n'existe plus.
    if (manage.isPending) return;
    manage.mutate({ operation: "rename", tags: [tag.name], new_name: vise }, { onSuccess: fermerEdition });
  };
  // Le `blur` ne suffit pas à désarmer : cliquer une zone non focalisable —
  // un fond, un titre, une autre ligne — ne déplace aucun focus, et le
  // bouton restait armé. Une suppression n'a pas à attendre là, prête à
  // partir au clic suivant.
  useEffect(() => {
    if (!armee) return;
    const dehors = (e: PointerEvent) => {
      if (ligneRef.current?.contains(e.target as Node | null)) return;
      setArmee(false);
    };
    document.addEventListener("pointerdown", dehors);
    return () => document.removeEventListener("pointerdown", dehors);
  }, [armee]);
  return (
    <li ref={ligneRef} className="flex min-h-7 items-center gap-2 rounded px-2 py-0.5 hover:bg-app-hover">
      <input type="checkbox" aria-label={tag.name} checked={coche} onChange={() => bascule(tag.name)} />
      {edition ? (
        <input
          autoFocus
          aria-label={t("tags.renameField", { name: tag.name })}
          className="input w-44"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          onBlur={fermerEdition}
          onKeyDown={(e) => {
            if (e.key === "Enter") renommer();
            if (e.key === "Escape") fermerEdition();
          }}
        />
      ) : (
        <>
          {/* Le nom MÈNE à ce qu'il range : cliquer une étiquette ouvre la
              liste filtrée sur elle. C'était le seul endroit de
              l'application où une étiquette ne réagissait pas.
              Le # décoratif reste hors du texte du span (les requêtes RTL ne
              lisent que les nœuds texte directs). */}
          <button
            type="button"
            className="flex-1 truncate text-left hover:underline"
            onClick={() => go({ kind: "list", collectionId: 0, label: t("nav.all"), search: `#${tag.name}` })}
          >
            #<span>{tag.name}</span>
          </button>
          <span className="text-xs text-app-muted">{tag.count}</span>
          <button
            type="button"
            className="btn btn-icone shrink-0"
            aria-label={t("tags.rename")}
            onClick={() => {
              setNom("");
              setEdition(true);
            }}
          >
            <Icone nom="crayon" />
          </button>
          {armee ? (
            <button
              type="button"
              className="btn shrink-0"
              disabled={manage.isPending}
              onBlur={() => setArmee(false)}
              onKeyDown={(e) => e.key === "Escape" && setArmee(false)}
              onClick={() => manage.mutate({ operation: "delete", tags: [tag.name] }, { onSuccess: () => setArmee(false) })}
            >
              {t("tags.confirm")}
            </button>
          ) : (
            <button type="button" className="btn shrink-0" onClick={() => setArmee(true)}>
              {t("tags.delete")}
            </button>
          )}
        </>
      )}
      {manage.isError && <Erreur message={String(manage.error?.message ?? "")} />}
    </li>
  );
}

// Zone de fusion, en pied de liste, visible dès que deux tags sont cochés
// (§9 : posée sur surface panel — la hiérarchie vient du niveau de surface).
function ZoneFusion({ coches, vider }: { coches: string[]; vider: () => void }) {
  const manage = useTagManage();
  const [nom, setNom] = useState("");
  if (coches.length < 2) return null;
  return (
    <div className="flex flex-col gap-2 rounded-[11px] bg-app-panel p-3">
      <div className="flex items-center gap-2">
        <input
          className="input"
          placeholder={t("tags.newName")}
          aria-label={t("tags.newName")}
          value={nom}
          onChange={(e) => setNom(e.target.value)}
        />
        <button
          type="button"
          className="btn"
          disabled={!nom.trim() || manage.isPending}
          onClick={() =>
            manage.mutate(
              { operation: "merge", tags: coches, new_name: nom.trim() },
              { onSuccess: () => { setNom(""); vider(); } },
            )
          }
        >
          {t("tags.merge")}
        </button>
      </div>
      {manage.isError && <Erreur message={String(manage.error?.message ?? "")} />}
    </div>
  );
}

export function TagsView() {
  const q = useTags();
  const [coches, setCoches] = useState<string[]>([]);
  const bascule = (name: string) =>
    setCoches((c) => (c.includes(name) ? c.filter((n) => n !== name) : [...c, name]));
  const liste = q.data ?? [];
  return (
    <section aria-label={t("nav.tags")} className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 px-4 pt-4">
        <h1 className="titre-fiche">{t("nav.tags")}</h1>
        {liste.length > 0 && <span className="text-xs text-app-muted">({liste.length})</span>}
      </header>
      {q.isLoading || q.isError || liste.length === 0 ? (
        // L'échec des étiquettes s'affichait comme « Rien ici » : une
        // bibliothèque sans étiquette et un sidecar injoignable disaient la
        // même chose.
        <EtatListe
          chargement={!!q.isLoading}
          erreur={q.isError ? q.error?.message : null}
          vide={liste.length === 0}
          reessayer={() => void q.refetch()}
        />
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-4 pb-2">
          {liste.map((tg) => (
            <LigneTag key={tg.name} tag={tg} coche={coches.includes(tg.name)} bascule={bascule} />
          ))}
        </ul>
      )}
      <div className="px-4 pb-4">
        <ZoneFusion coches={coches} vider={() => setCoches([])} />
      </div>
    </section>
  );
}
