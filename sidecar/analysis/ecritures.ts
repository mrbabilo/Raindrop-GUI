//! Le signal « la bibliothèque a changé par l'application » — il périme
//! l'instantané que les analyses se partagent (optimisation du 2026-09-24).

/** Les outils MCP qui ne font que LIRE. Tout le reste compte comme une
 *  écriture — un outil inconnu aussi : une relecture de trop coûte ~2 min,
 *  un instantané périmé ferait mentir l'écran. */
const LECTURE = /^(get|search|parse|check)_/;

export const ecrit = (outil: string): boolean => !LECTURE.test(outil);

/** Enveloppe un appelant MCP : chaque écriture — même refusée, l'état a pu
 *  changer quand même — est signalée APRÈS l'appel. */
export function surveillerEcritures<A extends unknown[], R>(
  mcp: (outil: string, ...args: A) => Promise<R>,
  surEcriture: (outil: string) => void,
): (outil: string, ...args: A) => Promise<R> {
  return async (outil, ...args) => {
    try {
      return await mcp(outil, ...args);
    } finally {
      if (ecrit(outil)) surEcriture(outil);
    }
  };
}
