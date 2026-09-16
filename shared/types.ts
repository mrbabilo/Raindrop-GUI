// DTO normalisés : le sidecar transforme les réponses brutes Raindrop
// (ex. `link`, `collection: {$id}`) en cette forme stable pour le front.

export interface RaindropItem {
  id: number;
  url: string;
  title: string;
  excerpt: string;
  note: string;
  domain: string;
  tags: string[];
  created: string; // ISO 8601
  lastUpdate: string; // ISO 8601
  important: boolean;
  type: string; // link | article | image | video | document | audio
  cover: string | null;
  collectionId: number;
  cache: { status: string } | null; // copie permanente Pro — gratuite dans le snapshot (2026-09-16)
  broken: boolean; // verdict serveur — gratuit dans le snapshot (2026-09-16)
}

export interface Collection {
  id: number;
  title: string;
  parentId: number | null;
  count: number;
  public: boolean;
  view: string;
  cover: string | null; // DESIGN.md §4 : icône Raindrop, 68/216 collections
  color: string | null;
}

export interface Tag {
  name: string;
  count: number;
}

export interface Highlight {
  id: number;
  text: string;
  note: string;
  color: string;
  raindropId: number;
  created: string;
}

export interface RaindropUser {
  id: number;
  email: string;
  fullName: string;
  pro: boolean;
  bookmarksCount: number;
}

export interface Paginated<T> {
  items: T[];
  count: number; // total côté serveur
  page: number;
  perPage: number;
}

// ─── Analyse locale (§5.1) ───────────────────────────────────────────────────

export type LinkStatus =
  | "ok"
  | "redirect" // avec chaîne et URL finale
  | "dead" // 4xx/5xx, DNS, timeout, connexion refusée
  | "indeterminate"; // 401/403/429 anti-bot → vérification manuelle

export type RedirectKind = "permanent" | "temporary";

export interface LinkCheckResult {
  raindropId: number;
  url: string; // URL sauvegardée
  status: LinkStatus;
  httpStatus: number | null;
  redirectChain: string[] | null; // URLs intermédiaires, null si pas de redirect
  finalUrl: string | null;
  redirectKind: RedirectKind | null;
  reason: string | null; // ex. "dns", "timeout", "conn_refused", "http_404"
  checkedAt: string; // ISO 8601
}

export interface DuplicateGroup {
  key: string; // clé de groupement
  kind: "exact" | "normalized" | "fuzzy";
  items: Pick<RaindropItem, "id" | "url" | "title" | "collectionId" | "created">[];
}

export type AnalysisType = "links" | "duplicates";

export interface AnalysisStatusEntry {
  lastScan: string | null; // ISO du dernier scan terminé (ou en cours : startedAt)
  running: boolean;
}

// ─── Jobs ────────────────────────────────────────────────────────────────────

export type JobStatus = "running" | "done" | "cancelled" | "error";

export interface JobProgress {
  done: number;
  total: number;
  label: string | null; // ex. dernière URL scannée
}

export interface JobSnapshot {
  id: string;
  type: string; // "scan-links" | "scan-duplicates" | ...
  status: JobStatus;
  progress: JobProgress;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}
