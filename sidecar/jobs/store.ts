import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { JobProgress, JobSnapshot } from "../../shared/types.js";

export type JobEvent =
  | { kind: "progress"; progress: JobProgress }
  | { kind: "done"; result: unknown }
  | { kind: "error"; message: string }
  | { kind: "cancelled" };

const MAX_JOBS = 50;

export interface JobHandle {
  readonly id: string;
  progress(done: number, total: number, label?: string): void;
  isCancelled(): boolean;
  cancel(): void;
  finish(result?: unknown): void;
  fail(message: string): void;
  snapshot(): JobSnapshot;
  subscribe(cb: (evt: JobEvent) => void): () => void;
}

/** Copie défensive : le state interne ne fuit jamais vers les consommateurs. */
function toSnapshot(state: JobSnapshot): JobSnapshot {
  return { ...state, progress: { ...state.progress } };
}

export class JobStore {
  private jobs = new Map<string, InternalJob>();
  private handles = new Map<string, JobHandle>();

  create(type: string, total: number): JobHandle {
    const id = randomUUID();
    const emitter = new EventEmitter();
    const state: JobSnapshot = {
      id,
      type,
      status: "running",
      progress: { done: 0, total, label: null },
      error: null,
      createdAt: new Date().toISOString(),
      finishedAt: null,
    };
    const job: InternalJob = { state, emitter, cancelled: false, result: undefined };
    this.jobs.set(id, job);
    while (this.jobs.size > MAX_JOBS) {
      const oldest = this.jobs.keys().next().value;
      if (!oldest) break;
      this.jobs.delete(oldest);
    }
    const handle: JobHandle = {
      id,
      progress: (done, total, label) => {
        state.progress = { done, total, label: label ?? state.progress.label };
        this.emit(job, { kind: "progress", progress: state.progress });
      },
      isCancelled: () => job.cancelled,
      cancel: () => {
        if (state.status !== "running") return;
        job.cancelled = true;
        state.status = "cancelled";
        state.finishedAt = new Date().toISOString();
        this.emit(job, { kind: "cancelled" });
      },
      finish: (result) => {
        if (state.status !== "running") return;
        state.status = "done";
        state.finishedAt = new Date().toISOString();
        job.result = result;
        this.emit(job, { kind: "done", result });
      },
      fail: (message) => {
        if (state.status !== "running") return;
        state.status = "error";
        state.error = message;
        state.finishedAt = new Date().toISOString();
        this.emit(job, { kind: "error", message });
      },
      snapshot: () => toSnapshot(state),
      subscribe: (cb) => {
        emitter.on("event", cb);
        return () => emitter.off("event", cb);
      },
    };
    this.handles.set(id, handle);
    return handle;
  }

  get(id: string): JobSnapshot | undefined {
    const job = this.jobs.get(id);
    return job ? toSnapshot(job.state) : undefined;
  }

  getHandle(id: string): JobHandle | undefined {
    return this.handles.get(id);
  }

  getResult(id: string): unknown {
    return this.jobs.get(id)?.result;
  }

  list(): JobSnapshot[] {
    return [...this.jobs.values()].map((j) => toSnapshot(j.state));
  }

  private emit(job: InternalJob, evt: JobEvent): void {
    job.emitter.emit("event", evt);
  }
}

type InternalJob = {
  state: JobSnapshot;
  emitter: EventEmitter;
  cancelled: boolean;
  result: unknown;
};

/** Le journal tel que runJob l'écrit (optionnel : les appels qui n'en ont
 *  pas — et tous les tests existants — restent valides). */
export interface JournalJob {
  info(msg: string, champs?: Record<string, unknown>): void;
  error(msg: string, champs?: Record<string, unknown>): void;
}

/** Lance fn en arrière-plan : succès → finish, exception → fail.
 *
 *  `journal` (optionnel, fourni par les routes qui possèdent deps.journal)
 *  trace le CYCLE du job — lancé, terminé/annulé, échec avec la raison —
 *  en UN point unique : dedupe, scans, sauvegarde et archivage y passent
 *  sans que chaque module ait à se journaliser. */
export function runJob(
  store: JobStore,
  type: string,
  total: number,
  fn: (job: JobHandle) => Promise<unknown>,
  journal?: JournalJob,
): JobHandle {
  const job = store.create(type, total);
  journal?.info("job lancé", { type, total });
  void fn(job).then(
    (result) => {
      job.finish(result);
      // Un résultat qui porte `annule: true` se lit « job annulé » — c'est
      // ainsi que dedupe (et la sauvegarde) rapportent une annulation : le
      // job « finit » normalement, mais avec un mot différent à dire.
      const annule =
        !!result && typeof result === "object" && "annule" in result && result.annule === true;
      journal?.info(annule ? "job annulé" : "job terminé", {
        type,
        ...(result !== undefined ? { resultat: result } : {}),
      });
    },
    (e) => {
      const message = e instanceof Error ? e.message : String(e);
      job.fail(message);
      journal?.error("job en échec", { type, err: message });
    },
  );
  return job;
}
