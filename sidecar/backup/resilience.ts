//! La reprise en vol d'une lecture : pause sur 429, retry sur panne réseau.
//!
//! §1ter / §6 : « le réseau qui tombe devrait reprendre à la page suivante, et
//! le 429, désormais visible, devrait déclencher une pause avant reprise au
//! lieu d'être compté comme un échec ». Sur 245 requêtes, l'un comme l'autre
//! sont ROUTINIERS — et jusqu'ici l'un comme l'autre avortaient le job entier,
//! avec 2 min 20 à refaire.
//!
//! **Lectures seulement.** C'est la règle du dépôt (CLAUDE.md), et ce module
//! ne peut pas l'enfreindre par construction : il décore une `Lecture`, dont
//! le canal REST n'expose que des GET. Rejouer une écriture dont on ignore si
//! elle a abouti la ferait potentiellement deux fois ; rejouer une lecture ne
//! coûte qu'une requête.
//!
//! **Un DÉCORATEUR, pas une option de `makeLecture`.** L'instance de lecture
//! est construite une fois au démarrage du sidecar (`index.ts`), longtemps
//! avant qu'un job existe ; or la reprise doit pouvoir être INTERROMPUE par
//! l'annulation de ce job (`() => job.isCancelled()`). Poser le crochet à la
//! construction obligerait à un état mutable partagé entre tous les jobs. On
//! enveloppe donc la lecture là où le contexte existe — dans `executer()`.
//!
//! **La pause vit HORS de la file.** Chaque tentative re-entre dans
//! `file.run` : l'espacement de 550 ms est préservé, et surtout la pause ne
//! retient AUCUN créneau. Attendre à l'intérieur du créneau bloquerait le rang
//! « interactif » derrière soi — l'interface se figerait le temps de la pause,
//! ce que la file existe précisément pour empêcher.

import { ErreurHttpRaindrop, type Lecture } from "./lecture.js";

export type Reprise = "429" | "reseau";

/**
 * Ce qui se retente, et ce qui ne se retente pas.
 *
 * Un 401, un 403 ou un 404 ne guérissent pas en attendant : les rejouer trois
 * fois avec des pauses transformerait une erreur claire — jeton révoqué,
 * collection disparue — en panne lente et inexplicable. Ils remontent tout de
 * suite.
 *
 * Un 5xx est un hoquet du serveur : sur une LECTURE, le rejeu est sans effet
 * de bord. Tout ce qui n'est pas un statut HTTP (coupure réseau, `AbortError`
 * du timeout de 30 s, corps JSON tronqué) est transitoire par nature.
 */
export function classer(e: unknown): Reprise | null {
  if (e instanceof ErreurHttpRaindrop) {
    if (e.status === 429) return "429";
    return e.status >= 500 ? "reseau" : null;
  }
  return "reseau";
}

/**
 * Les pauses, par rang de tentative. Volontairement AVEUGLES aux en-têtes
 * `X-RateLimit-*` : ils ne sont lisibles que par le canal REST direct, et
 * CLAUDE.md interdit de s'en servir pour desserrer la file — qui est partagée
 * avec les appels MCP, eux totalement aveugles. S'en servir pour RESSERRER une
 * pause serait licite, mais nous n'avons jamais observé de 429 réel : écrire
 * un comportement sur un en-tête jamais vu serait le vendre avant de l'avoir.
 *
 * Le 429 attend plus longtemps parce que sa fenêtre se compte en minutes ;
 * une panne réseau, elle, se rétablit en secondes ou pas du tout.
 */
const PAUSES: Record<Reprise, readonly number[]> = {
  "429": [4_000, 8_000, 16_000],
  reseau: [1_000, 2_000, 4_000],
};

/** Une pause se dort par TRANCHES : sans cela, annuler pendant une attente de
 *  16 s laisserait l'interface sans réponse aussi longtemps. */
const TRANCHE_MS = 250;

export interface OptionsReprise {
  annule?(): boolean;
  avertir?(message: string, champs?: Record<string, unknown>): void;
  /** Injecté par les tests. Le défaut dort réellement. */
  dormir?(ms: number): Promise<void>;
  /** Tentatives SUPPLÉMENTAIRES après la première. 0 = comportement d'avant. */
  essais?: number;
}

const attendreVrai = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function avecReprise(base: Lecture, opts: OptionsReprise = {}): Lecture {
  const essais = opts.essais ?? 3;
  const dormir = opts.dormir ?? attendreVrai;

  /** Rend `true` si la pause est allée à son terme, `false` si annulée. */
  const patienter = async (ms: number): Promise<boolean> => {
    for (let reste = ms; reste > 0; reste -= TRANCHE_MS) {
      if (opts.annule?.()) return false;
      await dormir(Math.min(reste, TRANCHE_MS));
    }
    return !opts.annule?.();
  };

  const reprendre = async <T>(quoi: string, fn: () => Promise<T>): Promise<T> => {
    for (let tentative = 0; ; tentative++) {
      try {
        return await fn();
      } catch (e) {
        const genre = classer(e);
        // Épuisé, non reprenable, ou déjà annulé : l'erreur D'ORIGINE remonte.
        // Jamais une erreur de notre fabrication — l'appelant doit pouvoir
        // lire le vrai statut (`balayage.ts` en fait un verdict).
        if (genre === null || tentative >= essais || opts.annule?.()) throw e;
        const pause = PAUSES[genre][Math.min(tentative, PAUSES[genre].length - 1)]!;
        opts.avertir?.("lecture reprise après échec", {
          quoi,
          genre,
          tentative: tentative + 1,
          surTotal: essais,
          pauseMs: pause,
          cause: e instanceof Error ? e.message : String(e),
        });
        // Annulé PENDANT la pause : on cesse d'attendre et l'erreur remonte.
        // `balayage.ts` la relit à la lumière de `annule()` et la rend comme
        // une annulation, pas comme une panne — l'utilisateur qui annule n'a
        // pas à lire un message d'erreur.
        if (!(await patienter(pause))) throw e;
      }
    }
  };

  return {
    page: (collectionId, o) => reprendre(`page ${o.page}`, () => base.page(collectionId, o)),
    compteur: (collectionId) => reprendre("compteur", () => base.compteur(collectionId)),
    collections: () => reprendre("collections", () => base.collections()),
    collectionsEnfants: () => reprendre("collections/childrens", () => base.collectionsEnfants()),
    highlights: (page) => reprendre(`highlights ${page}`, () => base.highlights(page)),
    user: () => reprendre("user", () => base.user()),
  };
}
