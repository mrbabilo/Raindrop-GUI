import { invoke, isTauri } from "@tauri-apps/api/core";

// Miroir du contrat Rust (src-tauri/src/commandes.rs, EtatConnexion).
// Le discriminant `kind` est sérialisé en snake_case côté Rust ; ces noms
// doivent correspondre exactement.
export type EtatConnexion =
  | { kind: "pret"; port: number; token: string }
  | { kind: "jeton_requis" }
  | { kind: "node_absent"; detail: string }
  | { kind: "panne"; detail: string };

export type Amorce =
  | { ecran: "app" }
  | { ecran: "premier-lancement" }
  | { ecran: "diagnostic"; detail: string }
  | { ecran: "panne"; detail: string };

/**
 * Traduit l'état rendu par Tauri en écran à montrer — et, quand tout est
 * prêt, POSE `window.RAINDROP_GUI`.
 *
 * C'est la charnière de la décision D1 : `connection.ts` lit ce global
 * synchroniquement, à chaque requête. En le remplissant ici, avant le
 * premier rendu, on garde `getConnection()` synchrone et on ne touche ni
 * `api.ts`, ni `sse.ts`, ni leurs tests.
 */
export function appliquer(etat: EtatConnexion): Amorce {
  switch (etat.kind) {
    case "pret":
      window.RAINDROP_GUI = { port: etat.port, token: etat.token };
      return { ecran: "app" };
    case "jeton_requis":
      return { ecran: "premier-lancement" };
    case "node_absent":
      return { ecran: "diagnostic", detail: etat.detail };
    case "panne":
      return { ecran: "panne", detail: etat.detail };
  }
}

async function demander(
  commande:
    | "etat_connexion"
    | "relancer"
    | "installer_runtime"
    | "enregistrer_jeton"
    | "deconnecter",
  args?: Record<string, unknown>,
): Promise<Amorce> {
  // Hors webview (développement au navigateur), le proxy Vite et
  // VITE_LOCAL_API_TOKEN suffisent : rien à demander à personne.
  if (!isTauri()) return { ecran: "app" };
  try {
    // `invoke(cmd)` et `invoke(cmd, undefined)` sont équivalents pour Tauri,
    // mais pas pour une assertion de test : garder la forme minimale quand
    // la commande ne prend rien évite de faire fuir un détail
    // d'implémentation dans les tests des commandes sans argument.
    const etat =
      args === undefined
        ? await invoke<EtatConnexion>(commande)
        : await invoke<EtatConnexion>(commande, args);
    return appliquer(etat);
  } catch (e) {
    // Sans cette garde, un rejet laisse une page blanche : le rendu n'a
    // jamais lieu et rien n'explique pourquoi.
    return { ecran: "panne", detail: e instanceof Error ? e.message : String(e) };
  }
}

/** Au premier rendu : lit l'état auquel la séquence de démarrage a abouti. */
export const amorcer = (): Promise<Amorce> => demander("etat_connexion");

/**
 * Ce qu'appelle « Réessayer ». `etat_connexion` rend l'état MÉMORISÉ : un
 * réessai qui passerait par elle rendrait éternellement la même panne, et
 * l'écran de panne serait un cul-de-sac.
 */
export const relancer = (): Promise<Amorce> => demander("relancer");

/**
 * Ce qu'appelle « Installer Node » (runtime géré, spec §3.2 amendée) :
 * Rust installe PUIS rejoue la séquence — l'état rendu remplace l'écran
 * courant via `appliquer`, exactement comme `relancer`.
 */
export const installerRuntime = (): Promise<Amorce> => demander("installer_runtime");

/**
 * Réglages (spec §6) : remplacer le jeton SANS repasser par le premier
 * lancement — Rust écrit au trousseau, relance le sidecar, attend le MCP
 * connecté, et rend le nouvel état (Pret, ou Panne si le jeton est refusé
 * par la suite de l'appel /api/user du front).
 */
export const remplacerJeton = (jeton: string): Promise<Amorce> =>
  demander("enregistrer_jeton", { jetonRaindrop: jeton });

/**
 * Réglages : déconnexion — efface le jeton du trousseau, arrête le
 * sidecar, et rend l'écran de premier lancement.
 */
export const deconnecter = (): Promise<Amorce> => demander("deconnecter");

/**
 * La progression de l'installation en cours (poll toutes les 500 ms côté
 * écran de diagnostic — même modèle que `etat_connexion`, pas d'événements
 * Tauri). Hors Tauri, ou commande en échec : `null` — l'écran garde alors
 * son libellé générique.
 */
export async function progressionInstallation(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<string | null>("progression_installation");
  } catch {
    return null;
  }
}
