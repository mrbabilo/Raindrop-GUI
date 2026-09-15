import type { AnalysisType } from "../../shared/types.js";
import type { CallOutcome } from "../../shared/errors.js";
import type { JobStore } from "../jobs/store.js";
import { runJob } from "../jobs/store.js";
import type { AnalysisCache } from "./cache.js";
import { fetchLibrarySnapshot } from "./snapshot.js";
import { checkAll, checkUrl } from "./linkchecker.js";
import type { CheckOutcome } from "./linkchecker.js";
import { findDuplicates } from "./duplicates.js";

const SAVE_EVERY = 20;
const TIMEOUT_MS = 10_000;

export interface ScannerDeps {
  mcp: (tool: string, args: Record<string, unknown>) => Promise<CallOutcome<unknown>>;
  jobs: JobStore;
  cache: AnalysisCache;
  /** Seam de test — défaut : checkUrl prod (timeout 10 s, 1 retry réseau). */
  check?: (url: string) => Promise<CheckOutcome>;
  concurrency?: number;
  ttlDays?: number;
}

export class Scanner {
  private running = new Set<AnalysisType>();

  constructor(private deps: ScannerDeps) {}

  isRunning(type: AnalysisType): boolean {
    return this.running.has(type);
  }

  startScan(type: AnalysisType): string {
    if (this.running.has(type)) throw new Error(`scan ${type} déjà en cours`);
    this.running.add(type);
    const ttlDays = this.deps.ttlDays ?? 30;
    const concurrency = this.deps.concurrency ?? 6;
    const check = this.deps.check ?? ((url: string) => checkUrl(url, { timeoutMs: TIMEOUT_MS, retry: 1 }));

    const job = runJob(this.deps.jobs, `scan-${type}`, 0, async (j) => {
      const snap = await fetchLibrarySnapshot(this.deps.mcp, {
        onProgress: (done, total) => j.progress(done, total, "lecture de la bibliothèque"),
        isCancelled: () => j.isCancelled(),
      });
      if (snap.cancelled) return { cancelled: true };
      this.deps.cache.setItemsIndex(snap.items);

      if (type === "duplicates") {
        const groups = findDuplicates(snap.items);
        this.deps.cache.setGroups(groups);
        this.deps.cache.markScanDone("duplicates");
        await this.deps.cache.save();
        return { groups: groups.exact.length + groups.normalized.length + groups.fuzzy.length };
      }

      // staleUrls rend {id,url} — le check attend {raindropId,url}
      const targets = this.deps.cache
        .staleUrls(snap.items, ttlDays)
        .map((t) => ({ raindropId: t.id, url: t.url }));
      j.progress(0, targets.length, "vérification des liens");

      // Les saves sont SÉRIALISÉS : save() passe par un .tmp unique, deux saves
      // entrelacés (périodique fire-and-forget vs final) feraient planter le
      // rename (ENOENT). La chaîne se répare d'elle-même après un échec.
      let saving: Promise<void> = Promise.resolve();
      const requestSave = (): Promise<void> => {
        const next = saving.then(() => this.deps.cache.save());
        saving = next.catch(() => undefined);
        return next;
      };

      // aborted : après l'échec d'un job, les workers survivants du pool
      // (fail() ne pose pas cancelled) ne doivent plus rien empiler.
      let aborted = false;
      let done = 0;
      let sinceSave = 0;
      const out = await checkAll(targets, {
        timeoutMs: TIMEOUT_MS,
        concurrency,
        retry: 1,
        checkImpl: (url) => check(url), // seam de test — défaut : checkUrl prod
        onUpdate: (r) => {
          if (aborted) return;
          this.deps.cache.setResult(r);
          done++;
          sinceSave++;
          j.progress(done, targets.length, r.url);
          if (sinceSave >= SAVE_EVERY) {
            sinceSave = 0;
            void requestSave(); // persistance périodique (résultats partiels)
          }
        },
        isCancelled: () => j.isCancelled(),
      }).catch((e) => {
        aborted = true;
        throw e;
      });

      // un scan annulé ne rafraîchit pas la fraîcheur affichée du dashboard
      if (!j.isCancelled()) this.deps.cache.markScanDone("links");
      await requestSave(); // attend aussi les saves périodiques déjà en file
      return out.stats;
    });

    const handle = job;
    handle.subscribe(() => {
      const s = handle.snapshot();
      if (s.status !== "running") this.running.delete(type);
    });
    return job.id;
  }
}
