//! La suppression de doublons CONSOLIDÉE : les étiquettes des copies remontent
//! dans le gardé avant la mise à la corbeille — rien de ce qui distingue une
//! copie ne meurt avec elle.
//!
//! Demande utilisateur du 2026-09-19 : « on garde la plus ancienne, mais on
//! récupère les étiquettes ». Les surlignages, eux, restent dans les copies :
//! le Phase 1 les tient en lecture seule (spec §3), et la corbeille est
//! réversible — un exemplaire restauré rend les siens.
//!
//! LECTURES AVANT ÉCRITURES, une paire à la fois : lire les étiquettes du
//! gardé et de chaque copie (le groupe stocké ne les porte pas), calculer
//! l'union, ne toucher le gardé QUE si l'union apporte quelque chose, puis
//! corbeiller les copies — origines mémorisées avant, comme le bulk (§4.2).
//! Un échec sur une copie n'arrête jamais les suivantes ; une étiquette
//! illisible ne bloque pas la corbeille, elle est rapportée comme
//! `nonFusionnée` — le refuser en silence ferait croire à une panne, le
//! bloquer ferait du nettoyage l'otage d'un hoquet.

import type { CallOutcome } from "../../shared/errors.js";
import type { JobHandle } from "../jobs/store.js";
import type { OriginStore } from "./origins.js";

export interface PaireDedupe {
  garde: number;
  copies: { id: number; collectionId: number }[];
}

export interface ResultatDedupe {
  paires: number;
  /** Copies mises à la corbeille (tentées avec succès). */
  corbeille: number;
  /** Copies dont les étiquettes ont été lues et consolidées. */
  fusionnees: number;
  /** Nombre d'étiquettes NOUVELLES effectivement ajoutées aux gardés. */
  etiquettesAjoutees: number;
  /** Copies dont les étiquettes n'ont pas pu être lues — corbeillées quand
   *  même, sans consolidation. */
  nonFusionnees: { id: number; raison: string }[];
  /** Copies non corbeillées. */
  echecs: { id: number; raison: string }[];
  /** Copies DÉJÀ en corbeille à l'exécution (corbeillées ailleurs depuis le
   *  scan) : ni supprimées, ni comptées dans `corbeille`. */
  deja?: number;
  annule: boolean;
}

type Mcp = (tool: string, args: Record<string, unknown>) => Promise<CallOutcome<unknown>>;

/** L'union des étiquettes, sans égard à la casse (le filtre serveur l'ignore,
 *  trap §Traps) : la première orthographe vue gagne — celles du gardé
 *  d'abord, ses choix ne doivent pas être réécrits par une copie. */
export function unionEtiquettes(garde: string[], autres: string[]): string[] {
  const vues = new Map<string, string>();
  for (const t of [...garde, ...autres]) {
    const cle = t.toLowerCase();
    if (!vues.has(cle)) vues.set(cle, t);
  }
  return [...vues.values()];
}

export function makeDedupe(deps: { mcp: Mcp; origins: OriginStore }) {
  // La lecture qui sert l'union dit AUSSI où vit le signet — sans requête de
  // plus. Les groupes sortent d'un cache calculé AU SCAN : un signet a pu
  // être corbeillé ailleurs depuis (audit du 2026-09-23).
  const lire = async (id: number): Promise<{ tags: string[]; enCorbeille: boolean }> => {
    const out = await deps.mcp("get_raindrop", { id });
    if (!out.ok) throw new Error(out.message);
    const d = out.data as { tags?: string[]; collection?: { $id?: number } };
    return { tags: d.tags ?? [], enCorbeille: d.collection?.$id === -99 };
  };

  return async function deduper(
    paires: PaireDedupe[],
    job?: JobHandle,
  ): Promise<ResultatDedupe> {
    const total = paires.reduce((n, p) => n + p.copies.length, 0);
    const r: ResultatDedupe = {
      paires: paires.length,
      corbeille: 0,
      fusionnees: 0,
      etiquettesAjoutees: 0,
      nonFusionnees: [],
      echecs: [],
      annule: false,
    };
    let faits = 0;
    const avance = () => job?.progress(++faits, total);

    for (const paire of paires) {
      if (job?.isCancelled()) {
        r.annule = true;
        return r;
      }
      // Le gardé d'abord : ses étiquettes sont la base de l'union, et une
      // lecture ratée ici dégrade TOUTE la paire en non-fusionnée — nommé.
      let base: string[] = [];
      try {
        const garde = await lire(paire.garde);
        // Le gardé corbeillé depuis le scan : corbeiller ses copies mettrait
        // le groupe ENTIER en corbeille — le contraire de ce que la Revue a
        // promis (« on en garde un »). La paire reste intacte, et le dit.
        if (garde.enCorbeille) {
          for (const copie of paire.copies) {
            r.echecs.push({ id: copie.id, raison: "gardé déjà en corbeille — paire laissée intacte" });
            avance();
          }
          avance();
          continue;
        }
        base = garde.tags;
      } catch (e) {
        for (const copie of paire.copies) {
          r.nonFusionnees.push({ id: copie.id, raison: `gardé illisible : ${e instanceof Error ? e.message : e}` });
        }
      }
      const nouvelles: string[] = [];
      // Une copie déjà corbeillée n'a rien à faire : `DELETE /raindrops/0`
      // l'ignorerait en répondant `result: true` — un succès inventé (même
      // classe que le -99). Écartée, comptée à part.
      const aCorbeiller: PaireDedupe["copies"] = [];
      for (const copie of paire.copies) {
        try {
          const c = await lire(copie.id);
          if (c.enCorbeille) {
            r.deja = (r.deja ?? 0) + 1;
            avance();
            continue;
          }
          nouvelles.push(...c.tags);
          r.fusionnees++;
        } catch (e) {
          r.nonFusionnees.push({ id: copie.id, raison: e instanceof Error ? e.message : String(e) });
        }
        aCorbeiller.push(copie);
        avance();
      }
      // Une seule écriture par gardé, et SEULEMENT si l'union apporte quelque
      // chose : réécrire des étiquettes identiques coûterait une écriture —
      // jamais retentée (trap §Traps) — pour zéro effet.
      const union = unionEtiquettes(base, nouvelles);
      if (nouvelles.length > 0 && union.length > (base ?? []).length) {
        const ajout = await deps.mcp("update_raindrop", { id: paire.garde, tags: union });
        if (ajout.ok) r.etiquettesAjoutees += union.length - (base ?? []).length;
        else
          for (const copie of paire.copies)
            r.nonFusionnees.push({ id: copie.id, raison: `gardé non mis à jour : ${ajout.message}` });
      }
      // Origines AVANT la corbeille (§4.2 — la corbeille ne les garde pas).
      if (aCorbeiller.length === 0) {
        avance();
        continue;
      }
      await Promise.all(aCorbeiller.map((c) => deps.origins.remember(c.id, c.collectionId)));
      const out = await deps.mcp("bulk_raindrops", {
        operation: "delete",
        // ⚠️ SÉMANTIQUE RÉELLE (code compilé MCP 1.3.1) : le bulk delete
        // frappe `DELETE /raindrops/{collection_id}` — la collection y est
        // la SOURCE depuis laquelle on retire les ids, pas la destination.
        // 0 (« Tous ») met à la corbeille ; -99 chercherait les ids DANS la
        // corbeille, n'y en trouve aucun (ils sont vivants), ne fait RIEN —
        // et répond `result: true`, un succès inventé. Corrigé le
        // 2026-09-20 : deux doublons « corbeillés » restaient intacts sans
        // la moindre erreur.
        collection_id: 0,
        ids: aCorbeiller.map((c) => c.id),
      });
      if (out.ok) {
        r.corbeille += aCorbeiller.length;
      } else {
        for (const copie of aCorbeiller)
          r.echecs.push({ id: copie.id, raison: out.message });
      }
      avance();
    }
    return r;
  };
}
