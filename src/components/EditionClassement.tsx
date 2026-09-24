import { useState } from "react";
import { t } from "../i18n/fr";
import { Icone } from "../design/icones";
import { nomIcone } from "../design/nomIcone";
import { variablesTeinte } from "../design/Signaux";
import { useCollections, useTags } from "../hooks/useStaticData";
import type { Collection } from "../../shared/types";

/** « Dev › Rust » : une sous-collection se nomme par son chemin — la liste
 *  est triée par titre, pas dans l'ordre de l'arbre. Marche bornée (une
 *  boucle de parents, donnée corrompue, ne tourne pas à l'infini). */
function chemin(arbre: readonly Collection[], c: Collection): string {
  const noms = [c.title];
  let parent = arbre.find((p) => p.id === c.parentId);
  for (let i = 0; parent && i < arbre.length; i++) {
    noms.unshift(parent.title);
    const suivant = parent.parentId;
    parent = arbre.find((p) => p.id === suivant);
  }
  return noms.join(" › ");
}

/**
 * Le CLASSEMENT d'un signet dans l'édition de la fiche : ses étiquettes et
 * sa collection (spec §116 — audit d'ergonomie du 2026-09-24). Ajouter une
 * étiquette à un seul signet coûtait cinq gestes, et en retirer une n'était
 * possible nulle part. Contrôlé : la fiche tient le brouillon, « Enregistrer »
 * l'envoie (`PUT /raindrop/{id}` REMPLACE la liste — c'est ce qu'on veut
 * ici, la liste envoyée est la liste voulue).
 */
export function EditionClassement({ tags, collectionId, onTags, onCollection }: {
  tags: string[];
  collectionId: number;
  onTags: (tags: string[]) => void;
  onCollection: (id: number) => void;
}) {
  const connues = useTags().data ?? [];
  const arbre = useCollections().data ?? [];
  const [saisie, setSaisie] = useState("");
  // Entrée ou virgule posent l'étiquette ; une étiquette déjà là (casse
  // ignorée, comme l'opérateur `#` de Raindrop) ne se double pas.
  const poser = (brut: string) => {
    const nom = brut.replace(/,/g, "").trim();
    setSaisie("");
    if (nom === "" || tags.some((x) => x.toLowerCase() === nom.toLowerCase())) return;
    onTags([...tags, nom]);
  };
  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
        {tags.map((nom) => (
          <span key={nom} className="tag tag-detail gap-1" style={variablesTeinte(nom)}>
            {nom}
            <button type="button" className="cursor-pointer" {...nomIcone(t("filter.removeTag", { name: nom }))} onClick={() => onTags(tags.filter((x) => x !== nom))}>
              <Icone nom="croix" />
            </button>
          </span>
        ))}
        <input
          list="etiquettes-connues"
          aria-label={t("detail.ajouterEtiquette")}
          placeholder={t("detail.ajouterEtiquettePlaceholder")}
          className="input w-40"
          value={saisie}
          onChange={(e) => (e.target.value.includes(",") ? poser(e.target.value) : setSaisie(e.target.value))}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            poser(saisie);
          }}
        />
        <datalist id="etiquettes-connues">
          {connues.map((tg) => <option key={tg.name} value={tg.name} />)}
        </datalist>
      </div>
      <select aria-label={t("detail.champCollection")} className="input" value={String(collectionId)} onChange={(e) => onCollection(Number(e.target.value))}>
        <option value="-1">{t("nav.unsorted")}</option>
        {arbre.map((c) => <option key={c.id} value={String(c.id)}>{chemin(arbre, c)}</option>)}
      </select>
    </>
  );
}
