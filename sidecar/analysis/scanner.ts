import type { AnalysisType } from "../../shared/types.js";
import type { CallOutcome } from "../../shared/errors.js";
import type { JobHandle, JobStore } from "../jobs/store.js";
import { runJob } from "../jobs/store.js";
import type { AnalysisCache } from "./cache.js";
import { fetchLibrarySnapshot } from "./snapshot.js";
import { checkAll, checkUrl } from "./linkchecker.js";
import type { CheckOutcome } from "./linkchecker.js";
import { findDuplicates } from "./duplicates.js";

const SAVE_EVERY = 20;
/** Et pas plus d'une persistance par intervalle (optimisation du 2026-09-24) :
 *  un `save()` sérialise ~6 Mo à la taille réelle et bloque la boucle
 *  d'événements ~55 ms — tous les 20 résultats, un scan complet en faisait
 *  611 (~34 s de CPU bloquant, ~3,6 Go écrits). Une coupure perd au plus cet
 *  intervalle de vérifications, que la reprise (`staleUrls`) refait. */
const SAVE_INTERVAL_MS = 15_000;
const TTL_JOURS_DEFAUT = 30;
const TIMEOUT_MS = 10_000;

export interface ScannerDeps {
  mcp: (tool: string, args: Record<string, unknown>) => Promise<CallOutcome<unknown>>;
  jobs: JobStore;
  cache: AnalysisCache;
  /** Seam de test — défaut : checkUrl prod (timeout 10 s, 1 retry réseau). */
  check?: (url: string) => Promise<CheckOutcome>;
  concurrency?: number;
  /** Timeout par requête HTTP du link checker (LINK_TIMEOUT_MS) — défaut 10 s. */
  timeoutMs?: number;
  ttlDays?: number;
  /** Horloge (ms) — seam de test du cadençage des persistances. */
  maintenant?: () => number;
}

export class Scanner {
  private running = new Set<AnalysisType>();

  constructor(private deps: ScannerDeps) {}

  isRunning(type: AnalysisType): boolean {
    return this.running.has(type);
  }

  /** Le TTL effectif, exposé pour que la route de statut n'ait pas à recopier
   *  le défaut. Une valeur de fraîcheur qui divergerait entre le scan et son
   *  affichage ferait annoncer « déjà vérifié » ce que le scan refera. */
  ttlJours(): number {
    return this.deps.ttlDays ?? TTL_JOURS_DEFAUT;
  }

  startScan(type: AnalysisType): string {
    if (this.running.has(type)) throw new Error(`scan ${type} déjà en cours`);
    this.running.add(type);
    const ttlDays = this.ttlJours();
    const concurrency = this.deps.concurrency ?? 6;
    const timeoutMs = this.deps.timeoutMs ?? TIMEOUT_MS;
    const check = this.deps.check ?? ((url: string) => checkUrl(url, { timeoutMs, retry: 1 }));

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

      // staleUrls rend {id,url} — le check attend {raindropId,url}.
      //
      // DÉDOUBLONNÉ PAR URL : plusieurs signets peuvent porter la même adresse
      // (430 sur la bibliothèque réelle, mesuré le 2026-09-19), et la vérifier
      // une fois par signet c'est autant de requêtes pour un verdict identique
      // — jusqu'à 10 s de délai chacune. Le résultat, lui, est indexé par URL
      // et `resultatsParSignet()` le redistribue à TOUS les signets
      // concernés : aucun n'est perdu. Effet de bord bienvenu, la progression
      // annonce enfin un total vrai plutôt qu'un total gonflé de redites.
      const vues = new Set<string>();
      const targets: { raindropId: number; url: string }[] = [];
      for (const t of this.deps.cache.staleUrls(snap.items, ttlDays)) {
        if (vues.has(t.url)) continue;
        vues.add(t.url);
        targets.push({ raindropId: t.id, url: t.url });
      }
      j.progress(0, targets.length, "vérification des liens");

      // un scan annulé ne rafraîchit pas la fraîcheur affichée du dashboard
      const out = await this.verifierTargets(j, targets, check, concurrency, timeoutMs);
      if (!j.isCancelled()) this.deps.cache.markScanDone("links");
      await this.deps.cache.save(); // attend aussi les saves périodiques déjà en file
      return out.stats;
    });

    const handle = job;
    handle.subscribe(() => {
      const s = handle.snapshot();
      if (s.status !== "running") this.running.delete(type);
    });
    return job.id;
  }

  /**
   * REVÉRIFICATION ciblée des indéterminés (ROADMAP 2026-09-22) : re-regarder
   * ce qu'on n'a pas su classer — 401/403/429 et les verdicts transport —
   * SANS balayer la bibliothèque et SANS rafraîchir la fraîcheur du
   * tableau de bord (une revérification n'est pas un scan : `markScanDone`
   * ne se pose pas, sinon « Relancer » croirait tout fait). Les URLs
   * revérifiées, elles, redeviennent fraîches : le scan TTL ne les refera
   * pas derrière nous. La garde est celle du domaine liens — même file
   * réseau, un seul geste de vérification à la fois, dans les deux sens.
   */
  startRecheckIndetermine(): string {
    if (this.running.has("links")) throw new Error("scan links déjà en cours");
    this.running.add("links");
    const concurrency = this.deps.concurrency ?? 6;
    const timeoutMs = this.deps.timeoutMs ?? TIMEOUT_MS;
    const check = this.deps.check ?? ((url: string) => checkUrl(url, { timeoutMs, retry: 1 }));

    const job = runJob(this.deps.jobs, "recheck-indeterminate", 0, async (j) => {
      const targets = this.deps.cache.ciblesRecheck("indeterminate");
      j.progress(0, targets.length, "revérification des indéterminés");
      const out = await this.verifierTargets(j, targets, check, concurrency, timeoutMs);
      await this.deps.cache.save();
      return out.stats;
    });

    const handle = job;
    handle.subscribe(() => {
      const s = handle.snapshot();
      if (s.status !== "running") this.running.delete("links");
    });
    return job.id;
  }

  /**
   * Le bloc réseau commun au scan et à la revérification : checkAll sur les
   * cibles, persistance sérialisée toutes les SAVE_EVERY (deux saves
   * entrelacés feraient planter le rename du .tmp unique — la chaîne se
   * répare d'elle-même après un échec), progression portant l'URL en cours.
   */
  private async verifierTargets(
    j: JobHandle,
    targets: { raindropId: number; url: string }[],
    check: (url: string) => Promise<CheckOutcome>,
    concurrency: number,
    timeoutMs: number,
  ) {
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
    const maintenant = this.deps.maintenant ?? Date.now;
    let dernierSave = maintenant();
    const out = await checkAll(targets, {
      timeoutMs,
      concurrency,
      retry: 1,
      checkImpl: (url) => check(url), // seam de test — défaut : checkUrl prod
      onUpdate: (r) => {
        if (aborted) return;
        this.deps.cache.setResult(r);
        done++;
        sinceSave++;
        j.progress(done, targets.length, r.url);
        if (sinceSave >= SAVE_EVERY && maintenant() - dernierSave >= SAVE_INTERVAL_MS) {
          sinceSave = 0;
          dernierSave = maintenant();
          void requestSave(); // persistance périodique (résultats partiels)
        }
      },
      isCancelled: () => j.isCancelled(),
    }).catch((e) => {
      aborted = true;
      throw e;
    });
    // ATTENDRE les saves périodiques en vol, sans en demander un de plus :
    // les deux appelants persistent juste après (markScanDone compris) — le
    // save final d'ici doublait le leur, 6 Mo sérialisés pour rien.
    await saving;
    return out;
  }
}
