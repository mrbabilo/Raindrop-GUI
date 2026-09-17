import { useEffect, useState } from "react";
import { t } from "../i18n/fr";
import { api } from "../lib/api";
import { useHealth } from "../hooks/useStaticData";

// Bannières d'état dégradé (spec §7, Task 16) — posées au-dessus de la grille,
// hors du flux des vues. DESIGN.md §9 : pas d'ombre, pas de bordure — la
// surface panel suffit à détacher la bande ; le diagnostic reprend le filet
// de 3 px des états (§5), la FORME des bannières est donc celle des lignes.
export function Banners() {
  const { data, refetch } = useHealth();
  // Hors-ligne : l'état initial vient de navigator.onLine, puis les événements
  // online/offline du navigateur font foi (spec §7 : lecture cache maintenue).
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const revenu = () => setOnline(true);
    const perdu = () => setOnline(false);
    window.addEventListener("online", revenu);
    window.addEventListener("offline", perdu);
    return () => {
      window.removeEventListener("online", revenu);
      window.removeEventListener("offline", perdu);
    };
  }, []);
  const [erreur, setErreur] = useState<string | null>(null);
  const [relance, setRelance] = useState(false);

  // Le sidecar ne rapporte « connected » qu'une fois le MCP prêt ; tout autre
  // état de lifecycle.ts (starting/restarting/crashed/stopped) est dégradé —
  // le « crashed » du plan est couvert, sans bande morte pour les transitoires.
  const mcpEnRade = data !== undefined && data.mcp !== "connected";

  async function redemarre() {
    setErreur(null);
    setRelance(true);
    try {
      await api.send("POST", "/api/mcp/restart");
      await refetch(); // « puis invalidate health » (plan) : la bannière se
      // lève d'elle-même si la reconnexion a réussi.
    } catch (e) {
      // R8P-1 : l'échec du redémarrage reste inline sur la bannière.
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setRelance(false);
    }
  }

  if (!mcpEnRade && online) return null;
  return (
    <div className="flex flex-col gap-1">
      {mcpEnRade && (
        <div
          role="alert"
          className="filet filet-broken flex items-center gap-3 bg-app-panel px-4 py-2"
        >
          <span className="text-app-broken">{t("banner.crashed")}</span>
          <button type="button" className="btn" disabled={relance} onClick={redemarre}>
            {t("banner.restart")}
          </button>
          {/* Pas de `role="alert"` ici : la bannière qui l'entoure en porte
              déjà un, et deux régions live imbriquées font annoncer le
              message deux fois — ou pas du tout, selon le lecteur. */}
          {erreur && (
            <p className="text-xs text-app-broken">
              {t("state.error", { message: erreur })}
            </p>
          )}
        </div>
      )}
      {!online && (
        <div role="status" className="filet filet-moved flex items-center gap-3 bg-app-panel px-4 py-2">
          {/* Hors-ligne : un état dégradé de l'environnement, incertain mais
              provisoire — l'ambre de « redirection » (--color-app-moved, §5/§6)
              le porte ; ni le rouge (diagnostic de lien) ni le gris `unsure`
              (donnée invérifiable), et aucune couleur nouvelle (§6). */}
          <span className="text-app-moved">{t("banner.offline")}</span>
        </div>
      )}
    </div>
  );
}
