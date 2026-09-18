//! L'archivage des copies permanentes À LA DEMANDE (spec §2) : le tour de
//! plusieurs identifiants, un par un, sans jamais laisser l'échec de l'un
//! interrompre les suivants.
//!
//! `archiver()` (`archives.ts`) porte DÉJÀ son propre passage par la file
//! partagée, au rang "fond". Cette fonction ne fait JAMAIS elle-même un
//! second `file.run()` autour de la boucle — seulement `deps.file` passé tel
//! quel à chaque appel : `throttle.ts` sérialise strictement (une seule
//! tâche à la fois, `servirSuivant()` n'est rappelé que depuis le
//! `.finally()` de la tâche qui vient de finir). Un `file.run()` englobant
//! qui attendrait un `file.run()` interne sur LA MÊME instance ne serait
//! jamais servi : la tâche externe ne termine jamais, donc ne libère jamais
//! `enMarche`, donc l'interne n'est jamais lancée — un blocage définitif.

import { join } from "node:path";
import { archiver } from "./archives.js";
import type { JobHandle } from "../jobs/store.js";

interface File {
  run<T>(fn: () => Promise<T>, o?: { rang?: "interactif" | "fond" }): Promise<T>;
}

export interface ResultatArchivage {
  demandes: number;
  /** Identifiants menés jusqu'au bout de leur tentative (succès ET échecs) —
   *  `echecs` en est le sous-ensemble qui a raté. Sur une annulation, ce
   *  compte s'arrête là où le travail s'est arrêté ; ce qui est déjà écrit
   *  sur disque le reste (une archive écrite est une archive acquise). */
  faits: number;
  echecs: { id: number; raison: string }[];
  annule: boolean;
}

export interface Archivage {
  /** Archive les identifiants donnés, un par un. Rend le détail — un échec
   *  sur un signet n'interrompt jamais les suivants. */
  archiver(ids: number[], job?: JobHandle): Promise<ResultatArchivage>;
  enCours(): boolean;
}

export function makeArchivage(deps: {
  token: string;
  dossier: string; // le MÊME que `DepsSauvegarde.dossier`
  file: File; // la file partagée — jamais une seconde file locale
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): Archivage {
  // Exactement le chemin qu'emploie enregistrement.ts:40 — sinon la purge et
  // le budget (appelés au balayage complet) s'appliqueraient ailleurs que là
  // où cette fonction écrit.
  const dossierArchives = join(deps.dossier, "archives");
  let enVol = false;

  const archiverTous = async (ids: number[], job?: JobHandle): Promise<ResultatArchivage> => {
    const echecs: { id: number; raison: string }[] = [];
    let faits = 0;
    for (const id of ids) {
      // Testé AVANT chaque identifiant : le travail déjà fait reste acquis,
      // rien n'est jamais défait par une annulation.
      if (job?.isCancelled()) {
        return { demandes: ids.length, faits, echecs, annule: true };
      }
      // `archiver()` ne lève jamais — elle rend `{ok:false, raison}` — donc
      // aucun try/catch ici : un lien mort dont la copie a disparu ne doit
      // pas faire échouer les identifiants suivants.
      const r = await archiver({
        token: deps.token,
        baseUrl: deps.baseUrl,
        fetchImpl: deps.fetchImpl,
        file: deps.file,
        dossierArchives,
        raindropId: id,
      });
      if (!r.ok) echecs.push({ id, raison: r.raison });
      faits++;
      job?.progress(faits, ids.length);
    }
    return { demandes: ids.length, faits, echecs, annule: false };
  };

  return {
    enCours: () => enVol,
    archiver: (ids, job) => {
      if (enVol) return Promise.reject(new Error("un archivage est déjà en cours"));
      // `archiverTous` court jusqu'à son premier `await` AVANT que la ligne
      // suivante ne s'exécute : le drapeau est posé dans la MÊME trame
      // synchrone que ce contrôle, rien ne peut s'y intercaler (calqué sur
      // `makeSauvegarde`).
      enVol = true;
      const p = archiverTous(ids, job);
      return p.finally(() => {
        enVol = false;
      });
    },
  };
}
