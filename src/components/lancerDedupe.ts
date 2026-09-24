import { api } from "../lib/api";
import { jobEvents } from "../lib/sse";
import type { ResultatDedupe } from "../hooks/useAnalysis";

/** Un item de la Revue de dédoublonnage : une copie, et le gardé qu'elle rejoint. */
interface CopieRevue {
  id: number;
  collectionId: number;
  dedupeGarde?: { id: number };
}

/**
 * Lance le job de dédoublonnage et le suit jusqu'à son terme — sorti de
 * ReviewPage (plafond de 400 lignes, audit UX du 2026-09-23).
 *
 * Les paires se reconstruisent des items RESTANTS : une copie désélectionnée
 * sort de sa paire ; un gardé n'est jamais un item. Rend le RÉSULTAT du
 * terme (sérialisé à plat sur `done`, sse.ts) — le jeter cachait les échecs.
 */
export async function lancerDedupe(
  restants: readonly CopieRevue[],
  surProgression: (p: { done: number; total: number }) => void,
): Promise<ResultatDedupe | undefined> {
  const parGarde = new Map<number, { id: number; collectionId: number }[]>();
  for (const i of restants) {
    if (!i.dedupeGarde) continue;
    const arr = parGarde.get(i.dedupeGarde.id) ?? [];
    arr.push({ id: i.id, collectionId: i.collectionId });
    parGarde.set(i.dedupeGarde.id, arr);
  }
  const { jobId, total } = await api.send<{ jobId: string; total: number }>(
    "POST",
    "/api/raindrops/dedupe",
    { paires: [...parGarde.entries()].map(([garde, copies]) => ({ garde, copies })) },
  );
  surProgression({ done: 0, total });
  let resultat: ResultatDedupe | undefined;
  await new Promise<void>((resolve, reject) => {
    // Même garde que useStartScan : l'event `error` rejette AVANT le onDone,
    // sinon l'échec se résoudrait comme une fin normale.
    let settled = false;
    void jobEvents(jobId, {
      onEvent: (e: { kind: string; message?: unknown; progress?: { done?: number } }) => {
        if (e.kind === "error") {
          settled = true;
          reject(new Error(typeof e.message === "string" && e.message ? e.message : "event error sans message"));
          return;
        }
        if (e.kind === "progress") {
          const p = e.progress;
          if (p && typeof p.done === "number") surProgression({ done: p.done, total });
          return;
        }
        if (e.kind !== "done") return;
        const { kind: _kind, ...reste } = e;
        resultat = reste as ResultatDedupe;
      },
      onDone: () => {
        if (!settled) resolve();
      },
    }, new AbortController().signal).catch((err: unknown) => {
      if (!settled) reject(err);
    });
  });
  return resultat;
}
