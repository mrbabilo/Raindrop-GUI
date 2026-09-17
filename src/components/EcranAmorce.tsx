import { useState, type ReactNode } from "react";
import { t } from "../i18n/fr";
import { relancer, type Amorce } from "../lib/amorce";

// Les deux écrans qui disent pourquoi l'application ne peut PAS s'ouvrir.
// Même forme : un constat (venu de Rust), une instruction, et AU MOINS UNE
// ISSUE — sans elle, un jeton refusé enfermerait pour de bon (il est déjà au
// trousseau, la séquence le relit à chaque lancement) et aucun écran de
// réglages n'existe pour le changer.
function Ecran({
  titre,
  detail,
  aide,
  actions,
}: {
  titre: string;
  detail: string;
  aide: ReactNode;
  actions: ReactNode;
}) {
  return (
    <main className="mx-auto flex h-screen max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="text-lg font-medium">{titre}</h1>
      <p role="alert" className="text-sm text-app-broken">
        {detail}
      </p>
      <p className="text-sm text-app-muted">{aide}</p>
      <div className="flex gap-2">{actions}</div>
    </main>
  );
}

/** « Réessayer » passe par `relancer` : `amorcer` rendrait l'état mémorisé,
 *  donc la même panne, indéfiniment. */
function BoutonReessayer({ onEtat }: { onEtat: (a: Amorce) => void }) {
  const [occupe, setOccupe] = useState(false);
  return (
    <button
      type="button"
      className="btn"
      disabled={occupe}
      onClick={() => {
        setOccupe(true);
        void relancer().then((a) => {
          setOccupe(false);
          onEtat(a);
        });
      }}
    >
      {occupe ? t("boot.checking") : t("state.retry")}
    </button>
  );
}

export function Diagnostic({ detail, onEtat }: { detail: string; onEtat: (a: Amorce) => void }) {
  return (
    <Ecran
      titre={t("boot.nodeTitle")}
      detail={detail}
      aide={t("boot.nodeHelp")}
      actions={<BoutonReessayer onEtat={onEtat} />}
    />
  );
}

export function EcranPanne({ detail, onEtat }: { detail: string; onEtat: (a: Amorce) => void }) {
  return (
    <Ecran
      titre={t("boot.panneTitle")}
      detail={detail}
      aide={t("boot.panneHelp")}
      actions={
        <>
          <BoutonReessayer onEtat={onEtat} />
          {/* La seule porte vers la saisie : sans elle, un jeton refusé —
              déjà écrit au trousseau — enferme à chaque lancement. */}
          <button
            type="button"
            className="btn"
            onClick={() => onEtat({ ecran: "premier-lancement" })}
          >
            {t("boot.retrySaisie")}
          </button>
        </>
      }
    />
  );
}
