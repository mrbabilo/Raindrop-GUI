/**
 * Placeholder Task 7 — usage type-only dans sidecar/api/deps.ts, pour que le
 * typecheck passe avant la Task 10. Ce fichier est REMPLACÉ INTÉGRALEMENT par
 * la Task 10 (JobStore réel : handles, exécution, lockfile).
 */
export interface JobStore {
  get(id: string): unknown;
  list(): unknown[];
}
