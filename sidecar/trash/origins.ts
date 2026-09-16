import { readFile, writeFile, rename } from "node:fs/promises";

/**
 * Mémoire des origines de corbeille (décision spec §4.2, restauration
 * hybride) : quand c'est le sidecar qui met un raindrop à la corbeille, il
 * note sa collection d'origine — la corbeille Raindrop ne la conserve pas
 * (collectionId → -99, removed → true, rien d'autre ; vérifié 2026-09-16).
 *
 * JAMAIS une source de vérité (§11) : fichier absent ou illisible = toutes
 * origines inconnues, jamais une erreur remontée à l'appelant — une perte
 * dégrade en « demander la destination au front », pas en incident.
 */

interface OriginsFile {
  version: 1;
  /** Clés = id du raindrop (JSON n'a que des clés string), valeurs = collection d'origine. */
  origins: Record<string, number>;
}

export interface OriginStore {
  remember(id: number, collectionId: number): Promise<void>;
  /** Lecture PURE — ne retire rien. Seul forget écrit. */
  take(ids: number[]): Promise<{ known: Map<number, number>; unknown: number[] }>;
  forget(ids: number[]): Promise<void>;
  /** Attente de la fin de la file d'écriture (tests, arrêt propre). */
  flush(): Promise<void>;
}

export function makeOriginStore(opts: { file: string }): OriginStore {
  let data: Record<string, number> = {};
  let loaded: Promise<void> | null = null;

  const load = async (): Promise<void> => {
    try {
      const parsed = JSON.parse(await readFile(opts.file, "utf8")) as OriginsFile;
      if (parsed.version === 1 && parsed.origins) data = { ...parsed.origins };
    } catch {
      data = {}; // absent ou corrompu → vide (cf. AnalysisCache.load)
    }
  };
  const ensureLoaded = (): Promise<void> => (loaded ??= load());

  // File d'écriture SÉRIALISÉE (patron logger.ts : le flake du plan 1 venait
  // de writes concurrents — deux tmp+rename entrelacés peuvent publier un
  // contenu plus ancien). Coalescing : au plus un save en attente, qui
  // figure l'état AU MOMENT de son exécution — N remembers concurrents
  // coûtent une écriture, pas N, sans jamais résoudre avant leur tour.
  let chain: Promise<unknown> = Promise.resolve();
  let savePending = false;
  const persist = (): Promise<void> => {
    if (savePending) return chain as Promise<void>;
    savePending = true;
    const task = chain.then(() => {
      savePending = false;
      const tmp = `${opts.file}.tmp`;
      return writeFile(tmp, JSON.stringify({ version: 1, origins: { ...data } } satisfies OriginsFile), "utf8").then(
        () => rename(tmp, opts.file),
      );
    });
    chain = task.catch(() => undefined); // la file continue même si un save échoue
    return task as Promise<void>;
  };

  return {
    async remember(id, collectionId) {
      await ensureLoaded();
      data[String(id)] = collectionId;
      await persist();
    },

    async take(ids) {
      await ensureLoaded();
      const known = new Map<number, number>();
      const unknown: number[] = [];
      for (const id of ids) {
        const dest = data[String(id)];
        if (dest === undefined) unknown.push(id);
        else known.set(id, dest);
      }
      return { known, unknown };
    },

    async forget(ids) {
      await ensureLoaded();
      let changed = false;
      for (const id of ids) {
        if (data[String(id)] !== undefined) {
          delete data[String(id)];
          changed = true;
        }
      }
      if (changed) await persist();
    },

    async flush() {
      await ensureLoaded();
      await chain.catch(() => undefined);
    },
  };
}
