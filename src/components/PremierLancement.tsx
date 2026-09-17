import { useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../i18n/fr";
import { appliquer, type Amorce, type EtatConnexion } from "../lib/amorce";
import { api } from "../lib/api";
import type { UserInfo } from "../hooks/useStaticData";

type Etape =
  | { phase: "saisie"; erreur: string | null }
  | { phase: "verification" }
  | { phase: "valide"; compte: UserInfo };

/**
 * Premier lancement (spec §6). L'ordre est contraint : `get_user` ne peut
 * répondre qu'à travers un sidecar DÉJÀ lancé avec ce jeton — on enregistre,
 * on lance, puis on interroge, et seulement alors on annonce le compte.
 */
export function PremierLancement({ onPret }: { onPret: (a: Amorce) => void }) {
  const [jeton, setJeton] = useState("");
  const [etape, setEtape] = useState<Etape>({ phase: "saisie", erreur: null });
  const occupe = etape.phase === "verification";

  async function valider(e: FormEvent) {
    e.preventDefault();
    // Garde de double envoi : deux validations rapides lanceraient deux
    // sidecars (même piège que le Composer).
    if (occupe || jeton.trim() === "") return;
    setEtape({ phase: "verification" });
    try {
      const etat = await invoke<EtatConnexion>("enregistrer_jeton", {
        jetonRaindrop: jeton.trim(),
      });
      if (etat.kind !== "pret") {
        // Node absent ou panne : ce n'est pas le jeton qui est en cause,
        // cet écran n'a rien à en dire — il remonte.
        onPret(appliquer(etat));
        return;
      }
      appliquer(etat); // pose window.RAINDROP_GUI : l'appel suivant peut aboutir
      setEtape({ phase: "valide", compte: await api.get<UserInfo>("/api/user") });
    } catch (err) {
      // Ne pas laisser une connexion à demi ouverte : le sidecar tourne avec
      // un jeton que Raindrop refuse, l'application ne lirait rien.
      delete window.RAINDROP_GUI;
      setEtape({
        phase: "saisie",
        erreur: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <main className="mx-auto flex h-screen max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="text-lg font-medium">{t("boot.title")}</h1>
      <p className="text-sm text-app-muted">{t("boot.explain")}</p>

      {etape.phase === "valide" ? (
        <>
          <p role="status" className="text-sm">
            {t("boot.account", {
              name: etape.compte.fullName,
              email: etape.compte.email,
              count: etape.compte.bookmarksCount,
            })}
          </p>
          <button type="button" className="btn self-start" onClick={() => onPret({ ecran: "app" })}>
            {t("boot.enter")}
          </button>
        </>
      ) : (
        <form onSubmit={valider} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {t("boot.tokenLabel")}
            <input
              type="password"
              className="input"
              autoFocus
              value={jeton}
              onChange={(e) => setJeton(e.target.value)}
            />
          </label>
          <p className="url text-xs text-app-muted">{t("boot.where")}</p>
          <button type="submit" className="btn self-start" disabled={occupe || jeton.trim() === ""}>
            {occupe ? t("boot.checking") : t("boot.validate")}
          </button>
          {etape.phase === "saisie" && etape.erreur !== null && (
            <p role="alert" className="text-xs text-app-broken">
              {t("state.error", { message: etape.erreur })}
            </p>
          )}
        </form>
      )}
    </main>
  );
}
