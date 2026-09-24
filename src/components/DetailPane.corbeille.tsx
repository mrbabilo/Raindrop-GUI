import { useEffect, useState } from "react";
import { t } from "../i18n/fr";
import { useUnrestore } from "../hooks/useMutations";
import { useCollections } from "../hooks/useStaticData";
import type { RaindropItem } from "../../shared/types";

// Le bloc corbeillé de la fiche (§4.2 — la corbeille Raindrop ne garde pas
// les origines) : « Restaurer » à l'origine mémorisée, sinon un sélecteur de
// destination. Extrait de DetailPane (cliquet de build_app.py : la fiche
// dépassait la cible de 300) — son test, DetailPane.corbeille.test.tsx,
// couvre le comportement à travers DetailPane et suit sans changer.
export function RestaurationCorbeille({ r }: { r: RaindropItem }) {
  const unrestore = useUnrestore();
  const arbre = useCollections().data ?? [];
  const [destInconnue, setDestInconnue] = useState(false);
  const [dest, setDest] = useState("");
  // Changer d'item réarme le sélecteur. L'extraction a repris le réarmement
  // de dest/destInconnue que la fiche portait (son useEffect) ; le reset
  // d'unrestore, lui, est NOUVEAU à l'extraction — amélioration : l'erreur
  // d'unrestore suit désormais le changement d'item au lieu de fuiter sur
  // le suivant.
  useEffect(() => {
    setDestInconnue(false);
    setDest("");
    unrestore.reset();
    // Dépendances volontairement limitées à r.id : le reset suit le CHANGEMENT
    // d'item, pas chaque re-render (unrestore est une instance neuve par rendu).
  }, [r.id]);

  return (
    <>
      {/* L'état se DIT : après « Mettre à la corbeille », la fiche reste
          ouverte et devient l'« Annuler » — c'est ici qu'on restaure. */}
      <p role="status" className="basis-full text-xs text-app-muted">{t("detail.dansCorbeille")}</p>
      <button
        type="button"
        className="rounded border border-app-border px-2 py-1 text-xs"
        disabled={destInconnue && dest === ""}
        onClick={() =>
          void unrestore.mutateAsync(
            destInconnue ? { ids: [r.id], toCollectionId: Number(dest) } : { ids: [r.id] },
          ).then(
            (res) => setDestInconnue((res.unknown ?? []).includes(r.id)),
            () => { /* erreur inline via unrestore.isError ci-dessous */ },
          )
        }
      >
        {t("detail.restore")}
      </button>
      {destInconnue && (
        <>
          <span className="shrink-0 text-xs text-app-broken">{t("cleanup.unknown-origin")}</span>
          <select
            aria-label={t("bulk.destination")}
            className="input w-36 shrink-0"
            value={dest}
            onChange={(e) => setDest(e.target.value)}
          >
            <option value="">{t("bulk.chooseCollection")}</option>
            {arbre.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.title}
              </option>
            ))}
          </select>
        </>
      )}
      {unrestore.isError && (
        <p role="alert" className="text-xs text-app-broken">
          {t("state.error", { message: String(unrestore.error?.message ?? "") })}
        </p>
      )}
    </>
  );
}
