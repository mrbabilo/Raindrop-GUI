//! Le contrat du moteur de sauvegarde — ce qu'il promet, ce qu'on lui
//! fournit — séparé de son orchestration (`sauvegarde.ts`) le 2026-09-19.
//! Les consommateurs qui ne font que PARLER de sauvegardes (deps, routes,
//! enregistreur) n'ont pas à importer la fabrique.

import type { JobHandle } from "../jobs/store.js";
import type { Menage } from "./enregistrement.js";
import type { EntreeInstantane, Manifeste } from "./manifeste.js";
import type { Lecture } from "./lecture.js";

export interface ResultatSauvegarde extends EntreeInstantane {
  /** Renseigné quand un incrémental a dû basculer en balayage complet : c'est
   *  le « et le dit » de §6, porté jusqu'au résultat du job (donc jusqu'à
   *  l'interface), pas seulement jusqu'aux journaux. Volontairement HORS de
   *  l'entrée écrite au manifeste, qui reste un `EntreeInstantane` nu. */
  bascule?: string;
  /** Pourquoi l'instantané n'est pas complet, le cas échéant. */
  raison?: string;
  /** Ce que le ménage des archives a retiré — orphelines et évincées au
   *  budget. Comme `bascule`, il vit HORS de l'entrée écrite au manifeste :
   *  c'est un événement de CETTE exécution, pas une propriété de
   *  l'instantané. ABSENT quand rien n'a été retiré. */
  menage?: Menage;
}

export interface StatutSauvegarde {
  actif: boolean;
  dossier?: string;
  raison?: string;
  dernier?: EntreeInstantane | null;
  instantanes?: number;
}

export interface Sauvegarde {
  /** Le mode s'appelle `balayage`, PAS `complet` : `complet` désigne déjà la
   *  FIDÉLITÉ d'un instantané (`EntreeInstantane.complet`), et ce sens-là est
   *  écrit sur disque — dans `manifest.json` comme dans `meta.json`. Le
   *  renommer invaliderait les sauvegardes existantes ; c'est donc le mode
   *  qui a cédé le mot, et il nomme désormais le geste plutôt qu'une qualité. */
  executer(mode: "balayage" | "incremental", job?: JobHandle): Promise<ResultatSauvegarde>;
  /** Une sauvegarde est-elle en vol ? La route s'en sert pour refuser la
   *  seconde, comme `scanner.isRunning` pour les scans. */
  enCours(): boolean;
  doitBalayerComplet(m: Manifeste, maintenant: Date): boolean;
  doitSauvegarderAuDemarrage(m: Manifeste, maintenant: Date): boolean;
  statut(): Promise<StatutSauvegarde>;
}

// `file` et `token` figuraient ici par anticipation de l'archivage à la
// demande (§5.4) et n'étaient lus NULLE PART : l'orchestration ne fait que
// purger et borner le dossier d'archives, elle n'appelle jamais `archiver()`.
// `token` y gardait surtout une COPIE du jeton Raindrop dans une structure qui
// n'en avait pas l'usage. Ils reviendront avec l'appelant qui en aura besoin.
export interface DepsSauvegarde {
  lecture: Lecture;
  dossier: string;
  avertir?: (message: string, champs?: Record<string, unknown>) => void;
  maintenant?: () => Date;
  /** Couture de test, comme `maintenant` : les pauses de reprise se comptent
   *  en secondes, et une suite de tests n'a pas à les dormir. */
  dormir?: (ms: number) => Promise<void>;
}
