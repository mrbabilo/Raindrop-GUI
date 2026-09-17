import { useEffect, useState, type FormEvent } from "react";
import { t } from "../i18n/fr";
import type { FrKey } from "../i18n/fr";
import { api } from "../lib/api";
import { useHealth } from "../hooks/useStaticData";
import { remplacerJeton, deconnecter, type Amorce } from "../lib/amorce";
import type { UserInfo } from "../hooks/useStaticData";

// Les états de `sidecar/mcp/lifecycle.ts`, traduits. Le littéral prouve au
// typecheck que chaque état a sa clé — le front ne montre jamais un
// identifiant interne (« starting » à l'écran serait une fuite de jargon).
const ETAT_MCP = {
  connected: "reglages.mcp.connected",
  starting: "reglages.mcp.starting",
  restarting: "reglages.mcp.restarting",
  crashed: "reglages.mcp.crashed",
  stopped: "reglages.mcp.stopped",
} as const satisfies Record<string, FrKey>;

/**
 * Réglages (spec §6) : l'état de la connexion, le remplacement du jeton et
 * la déconnexion. Overlay à l'idiome de la Palette ⌘K — App le monte
 * conditionnellement, son état repart donc à zéro à chaque ouverture.
 *
 * Volontairement ABSENT (DESIGN.md §9, l'écran ne surcharge jamais) : le
 * bouton de thème, qui vit déjà dans l'en-tête, et un « Redémarrer la
 * connexion » que la bannière porte là où il sert — ici on MONTRE l'état,
 * on ne le répare pas une seconde fois.
 */
export function Reglages({ onFermer, onEtat }: { onFermer: () => void; onEtat: (a: Amorce) => void }) {
  const { data } = useHealth();
  const [saisie, setSaisie] = useState(false);
  const [jeton, setJeton] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Échap ferme, comme la Palette. Écouteur de fenêtre plutôt que onKeyDown :
  // l'overlay n'a pas de champ toujours focalisé sur lequel l'accrocher.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFermer();
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [onFermer]);

  const etatMcp = data?.mcp && data.mcp in ETAT_MCP
    ? t(ETAT_MCP[data.mcp as keyof typeof ETAT_MCP])
    : t("reglages.mcp.inconnu");

  async function valider(e: FormEvent) {
    e.preventDefault();
    if (occupe || jeton.trim() === "") return;
    setOccupe(true);
    setErreur(null);
    const amorce = await remplacerJeton(jeton.trim());
    if (amorce.ecran !== "app") {
      // Sidecar mort, Node disparu : l'application EST en panne — la montrer
      // derrière un panneau serait un mensonge. Les écrans d'amorçage
      // portent les issues (Réessayer, Saisir un autre jeton).
      onEtat(amorce);
      return;
    }
    // Le sidecar a démarré avec le nouveau jeton, mais Raindrop peut encore
    // le refuser : même contrôle que le premier lancement.
    try {
      await api.get<UserInfo>("/api/user");
      onFermer();
    } catch {
      setOccupe(false);
      setErreur(t("reglages.refuse"));
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 p-4 pt-24" onClick={onFermer}>
      <div
        className="mx-auto max-w-lg rounded border border-app-border bg-app-panel p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 font-medium">{t("reglages.titre")}</h2>

        <p className="mb-1 text-xs uppercase tracking-wide text-app-muted">{t("reglages.connexion")}</p>
        <p className="mb-4 flex justify-between text-sm">
          <span>{t("reglages.pont")}</span>
          <span className="text-app-muted">{etatMcp}</span>
        </p>

        {saisie ? (
          <form onSubmit={valider} className="mb-4 flex flex-col gap-2">
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
            <button type="submit" className="btn self-start" disabled={occupe || jeton.trim() === ""}>
              {occupe ? t("boot.checking") : t("boot.validate")}
            </button>
            {erreur !== null && (
              <p role="alert" className="text-xs text-app-broken">
                {erreur}
              </p>
            )}
          </form>
        ) : (
          <p className="mb-4 text-xs text-app-muted">{t("reglages.note")}</p>
        )}

        <div className="flex gap-2">
          {!saisie && (
            <button type="button" className="btn" onClick={() => setSaisie(true)}>
              {t("reglages.remplacer")}
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => void deconnecter().then(onEtat)}
          >
            {t("reglages.deconnecter")}
          </button>
          <button type="button" className="btn ml-auto" onClick={onFermer}>
            {t("reglages.fermer")}
          </button>
        </div>
      </div>
    </div>
  );
}
