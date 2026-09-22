import { readFile, writeFile, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { SmartList, SmartListView } from "../../shared/types.js";

/**
 * Dépôt des vues sauvegardées (spec 2026-09-22) : un JSON en app-data, au
 * patron de trash-origins.json — fichier absent ou illisible = liste vide,
 * jamais une erreur remontée au front (la section barre latérale dit son
 * état). Écritures sérialisées (deux tmp+rename entrelacés peuvent publier
 * un contenu plus ancien — flake du plan 1, patron logger.ts).
 *
 * UN écart assumé avec origins.ts : un échec disque ICI rejette. Les
 * origines de corbeille sont un cache d'accompagnement (§11 : perte
 * dégradée) ; les vues sauvegardées sont la mémoire de l'utilisateur — une
 * création répondue 200 mais non écrite serait un succès inventé.
 */

interface FichierSmartLists {
  version: 1;
  smartlists: SmartList[];
}

export interface SmartListStore {
  list(): Promise<SmartList[]>;
  /** Crée : le store pose l'id (stable, généré ici) et la date — le front
   *  n'a pas voix dessus (spec §3). */
  add(v: { label: string; vue: SmartListView }): Promise<SmartList>;
  rename(id: string, label: string): Promise<SmartList | null>;
  remove(id: string): Promise<boolean>;
}

export function makeSmartListStore(opts: { file: string }): SmartListStore {
  let data: SmartList[] = [];
  let loaded: Promise<void> | null = null;

  const load = async (): Promise<void> => {
    try {
      const parsed = JSON.parse(await readFile(opts.file, "utf8")) as FichierSmartLists;
      if (parsed.version === 1 && Array.isArray(parsed.smartlists)) data = [...parsed.smartlists];
    } catch {
      data = []; // absent ou corrompu → liste vide (patron du dépôt)
    }
  };
  const ensureLoaded = (): Promise<void> => (loaded ??= load());

  let chain: Promise<unknown> = Promise.resolve();
  const persist = (): Promise<void> => {
    const task = chain.then(() => {
      const tmp = `${opts.file}.tmp`;
      return writeFile(tmp, JSON.stringify({ version: 1, smartlists: data } satisfies FichierSmartLists), "utf8").then(
        () => rename(tmp, opts.file),
      );
    });
    chain = task.catch(() => undefined); // la file survit à un échec ; l'appelant VOIT le rejet
    return task;
  };

  return {
    async list() {
      await ensureLoaded();
      return [...data];
    },
    async add(v) {
      await ensureLoaded();
      const sl: SmartList = {
        id: `sl-${randomUUID()}`,
        label: v.label,
        vue: { ...v.vue },
        cree: new Date().toISOString(),
      };
      data = [...data, sl];
      await persist();
      return sl;
    },
    async rename(id, label) {
      await ensureLoaded();
      const sl = data.find((s) => s.id === id);
      if (!sl) return null;
      data = data.map((s) => (s.id === id ? { ...s, label } : s));
      await persist();
      return { ...sl, label };
    },
    async remove(id) {
      await ensureLoaded();
      if (!data.some((s) => s.id === id)) return false;
      data = data.filter((s) => s.id !== id);
      await persist();
      return true;
    },
  };
}
