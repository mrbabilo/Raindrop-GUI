import { t } from "../i18n/fr";
import { Icone } from "../design/icones";
import { PiluleEtiquette } from "../design/Signaux";
import { useFiltreEtiquettes } from "../hooks/filtreEtiquettes";

/**
 * Les étiquettes du filtre courant, chacune retirable.
 *
 * DESIGN.md §9 : « un filtre posé ne peut pas devenir invisible ». Sans cette
 * rangée, un filtre à trois étiquettes ne se lirait qu'en retrouvant, dans une
 * liste déjà réduite, les pilules actives — c'est-à-dire pas du tout quand le
 * filtre ne rend rien.
 *
 * « et » entre les pilules : l'intersection est la seule sémantique offerte
 * par l'API (`OR` n'est pas un opérateur, mesuré) et c'est ce que compte
 * l'utilisateur quand une liste se réduit à un signet.
 */
export function EtiquettesRetenues() {
  const { actives, bascule, vider } = useFiltreEtiquettes();
  if (actives.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
      <span className="text-xs text-app-muted">{t("filter.tagsLabel", { n: actives.length })}</span>
      {actives.map((nom, i) => (
        <span key={nom} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-xs text-app-muted">{t("filter.tagsEt")}</span>}
          {/* Le clic RETIRE : la pilule d'une rangée nommée « retenues » ne
              peut vouloir dire qu'une chose. Son nom accessible le dit, car
              la pilule seule ne porte que le nom de l'étiquette. */}
          <PiluleEtiquette
            nom={nom}
            active
            titre={t("filter.removeTag", { name: nom })}
            onClick={() => bascule(nom)}
          />
        </span>
      ))}
      {/* §9 « masqué si nul » : rien à retirer, pas de commande. Deux
          étiquettes suffisent à rendre le retrait un par un fastidieux. */}
      {actives.length > 1 && (
        <button type="button" className="btn btn-icone" aria-label={t("filter.clearTags")} onClick={vider}>
          <Icone nom="croix" />
        </button>
      )}
    </div>
  );
}
