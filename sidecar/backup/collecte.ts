//! Ce qu'un instantané contient, et comment chaque pièce est écrite (§5.1).
//!
//! Séparé de `sauvegarde.ts` (qui décide et fait tourner) selon la frontière
//! naturelle : ici on COLLECTE et on écrit, là-bas on choisit le mode, on
//! enregistre au manifeste et on fait la rotation.
//!
//! Toute pièce écrite est RELUE dans la foulée (§6) : « une archive jamais
//! relue est une archive qu'on CROIT bonne ». Une pièce qui échoue à sa
//! vérification n'interrompt pas la sauvegarde — elle rend l'instantané
//! INCOMPLET, donc invisible pour `dernierValide()` (Task 6), et reste sur
//! disque (elle peut être partiellement exploitable).

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { ouvrirJsonl, verifierJsonl } from "./instantane.js";
import { balayerComplet } from "./balayage.js";
import type { Lecture } from "./lecture.js";

/** Les noms de fichiers de l'arborescence §4.2 — le futur module de copie de
 *  travail lit cet arbre tel quel, ils ne sont pas libres. */
export const NOMS = {
  raindrops: "raindrops.jsonl",
  corbeille: "trash.jsonl",
  collections: "collections.json",
  surlignages: "highlights.json",
  utilisateur: "user.json",
  meta: "meta.json",
} as const;

const PAR_PAGE = 50;
/** Garde-fou : 500 pages de surlignages (25 000) valent mieux qu'une boucle
 *  infinie si l'API cessait de renvoyer une page courte en fin de liste. */
const MAX_PAGES_SURLIGNAGES = 500;

export interface Empreinte {
  lignes: number;
  sha256: string;
}

export interface Piece {
  nom: string;
  empreinte: Empreinte;
  /** Faux = la pièce n'a pas pu être écrite fidèlement (voir `raison`). */
  fidele: boolean;
  raison?: string;
  /** Nombre d'éléments — `lignes` pour un JSONL, le compte annoncé pour une
   *  collection balayée. */
  count: number;
  /** Les identifiants collectés (balayage seulement) — alimente la purge des
   *  archives orphelines (§5.4). */
  ids?: Set<number>;
}

const relire = async (chemin: string, nom: string, e: Empreinte, raison?: string): Promise<Piece> => {
  const v = await verifierJsonl(chemin, e);
  const echec = raison ?? (v.ok ? undefined : `${nom} : ${v.raison ?? "vérification échouée"}`);
  return {
    nom,
    empreinte: e,
    fidele: v.ok && raison === undefined,
    ...(echec === undefined ? {} : { raison: echec }),
    count: e.lignes,
  };
};

/**
 * Un document JSON d'une seule ligne (`collections.json`, `highlights.json`,
 * `user.json`, `meta.json`).
 *
 * Une ligne unique : le fichier reste un `.json` que n'importe quoi ouvre, ET
 * un JSONL d'une ligne que `verifierJsonl` sait relire — une seule mécanique
 * de vérification pour toutes les pièces, au lieu d'une exception par format.
 */
export async function ecrireDocument(dossier: string, nom: string, valeur: unknown): Promise<Piece> {
  const chemin = join(dossier, nom);
  const e = await ouvrirJsonl(chemin);
  await e.ligne(valeur);
  return relire(chemin, nom, await e.fermer());
}

/** Tous les surlignages par l'endpoint GLOBAL (§5.1). Un appel par bookmark
 *  serait 12 210 requêtes, ≈ 2 heures — c'est la raison d'être de cette
 *  fonction, et ce que son test interdit. */
export async function tousLesSurlignages(lecture: Lecture): Promise<unknown[]> {
  const tous: unknown[] = [];
  for (let page = 0; page < MAX_PAGES_SURLIGNAGES; page++) {
    const p = await lecture.highlights(page);
    tous.push(...p.items);
    if (p.items.length < PAR_PAGE) break;
  }
  return tous;
}

/** Les pièces qui ne dépendent pas de la collection balayée : arborescence,
 *  surlignages, compte. Trois requêtes, quel que soit le mode. */
export async function collecterAuxiliaires(deps: { lecture: Lecture; dossier: string }): Promise<Piece[]> {
  // « L'arborescence complète » (§5.1) = les racines PLUS les imbriquées, en
  // un seul document : `/collections` seul ne rend que le premier niveau, et
  // un instantané qui omet la hiérarchie en silence est exactement ce que ce
  // lot corrige. Chaque collection porte son `parent`, l'arbre se reconstruit.
  const collections = [...(await deps.lecture.collections()), ...(await deps.lecture.collectionsEnfants())];
  const surlignages = await tousLesSurlignages(deps.lecture);
  const utilisateur = await deps.lecture.user();
  return [
    await ecrireDocument(deps.dossier, NOMS.collections, collections),
    await ecrireDocument(deps.dossier, NOMS.surlignages, surlignages),
    await ecrireDocument(deps.dossier, NOMS.utilisateur, utilisateur),
  ];
}

/** Balaye une collection dans `<dossier>/<nom>` puis relit le fichier. */
export async function balayerEtRelire(deps: {
  lecture: Lecture;
  dossier: string;
  nom: string;
  collectionId: number;
  onProgress?(faits: number, total: number): void;
  annule?(): boolean;
}): Promise<Piece> {
  const chemin = join(deps.dossier, deps.nom);
  const r = await balayerComplet({
    lecture: deps.lecture,
    chemin,
    collectionId: deps.collectionId,
    ...(deps.onProgress ? { onProgress: deps.onProgress } : {}),
    ...(deps.annule ? { annule: deps.annule } : {}),
  });
  const piece = await relire(
    chemin,
    deps.nom,
    { lignes: r.lignes, sha256: r.sha256 },
    r.complet ? undefined : `${deps.nom} : ${r.raison ?? "balayage incomplet"}`,
  );
  return { ...piece, count: r.countFinal, ids: r.ids };
}

/**
 * L'instantané précédent PLUS les éléments modifiés, en un instantané neuf.
 *
 * L'incrémental ne produit pas un delta : chaque instantané reste une copie
 * complète et autonome, sinon la rotation (§5.5) effacerait un maillon et
 * rendrait illisibles tous les suivants. La fusion se fait LIGNE À LIGNE,
 * sans charger les 11 Mo en mémoire — c'est la raison d'être du JSONL (§4.2).
 */
export async function fusionner(deps: {
  source: string;
  dossier: string;
  nom: string;
  modifies: unknown[];
}): Promise<Piece> {
  const parId = new Map<number, unknown>();
  for (const m of deps.modifies) {
    const id = (m as { _id?: number })._id;
    if (typeof id === "number") parId.set(id, m);
  }
  const chemin = join(deps.dossier, deps.nom);
  const ecrivain = await ouvrirJsonl(chemin);
  const flux = createInterface({
    input: createReadStream(deps.source, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const ligne of flux) {
    if (ligne === "") continue;
    const objet = JSON.parse(ligne) as { _id?: number };
    const id = objet._id;
    const remplacant = typeof id === "number" ? parId.get(id) : undefined;
    if (remplacant !== undefined && typeof id === "number") {
      await ecrivain.ligne(remplacant);
      parId.delete(id);
    } else {
      await ecrivain.ligne(objet);
    }
  }
  // Ce qui reste n'était pas dans l'instantané précédent : des créations.
  for (const neuf of parId.values()) await ecrivain.ligne(neuf);
  return relire(chemin, deps.nom, await ecrivain.fermer());
}
