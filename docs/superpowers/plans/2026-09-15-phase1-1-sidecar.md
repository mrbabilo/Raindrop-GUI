# Raindrop-GUI Phase 1 — Plan 1/3 : Sidecar (pont MCP + API locale + moteur d'analyse)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Sidecar Node/TypeScript autonome qui expose les tools du serveur MCP `@kud/mcp-raindrop-io` en API REST locale authentifiée, plus un moteur d'analyse local (doublons, liens morts, redirections) avec jobs SSE — testable seul au curl et en Vitest, sans front ni Tauri.

**Architecture :** Process Node unique : client MCP (`@modelcontextprotocol/sdk`) connecté en stdio au subprocess `@kud/mcp-raindrop-io`, servi par un serveur HTTP Hono bindé sur `127.0.0.1:0` avec auth Bearer. Un adaptateur injectable (transport) permet de tester tout le pont contre un **fake MCP server in-process**. Le moteur d'analyse (§5.1 de la spec) fait ses propres requêtes HTTP vers les URLs bookmarkées — jamais via Raindrop.

**Tech Stack :** Node ≥ 20 (ESM), TypeScript 5 (`nodenext`), Hono 4, `@modelcontextprotocol/sdk` ^1.27.1, `@kud/mcp-raindrop-io` **1.3.1 exactement** (épinglé), zod ^4, Vitest, tsx.

**Spec :** `docs/superpowers/specs/2026-09-15-raindrop-gui-design.md` (§2 architecture, §3 corrections contraignantes, §5 couche sidecar, §7 états dégradés, §8 tests)

## Global Constraints

- **Dép MCP épinglée** : `"@kud/mcp-raindrop-io": "1.3.1"` (pas de `^`), spawn direct de `node_modules/@kud/mcp-raindrop-io/dist/index.js` — jamais `npx`.
- **Node ≥ 20** requis ; imports ESM : **tous les imports relatifs portent l'extension `.js`** (moduleResolution `nodenext`).
- **Pas de workspaces** : un seul `package.json` racine. Types partagés front/sidecar dans `shared/`.
- **Bind 127.0.0.1 uniquement, port 0** (attribué par l'OS) ; token Bearer local obligatoire sur toutes les routes sauf aucune.
- **Le tool MCP `update_raindrop` n'expose PAS `url`** (vérifié sur v1.3.1 : `{id, title, excerpt, note, tags, important, collection_id}`) → la correction d'URL des redirections passe par un appel **REST direct** à `https://api.raindrop.io/rest/v1/raindrop/:id` (PUT, Bearer token Raindrop) dans `sidecar/direct/raindropRest.ts`.
- **Le serveur MCP v1.3.1 retourne** : succès = `content[0].text` contenant du **JSON pur** ; échec = texte préfixé **`Error: `**. Toute erreur HTTP Raindrop (429 comprise) est aplanie en `Error: failed to …` par le package → **le 429 est indétectable côté MCP** : le rate limiting est **proactif** (espacement 550 ms ≈ 109 req/min < 120) + 1 retry à 2 s sur échec des lectures, jamais des écritures.
- **23 tools** (la spec dit 22 — liste réelle vérifiée sur v1.3.1) : `search_raindrops`, `get_raindrop`, `create_raindrop`, `update_raindrop`, `delete_raindrop`, `create_raindrops`, `bulk_raindrops`, `get_collections`, `get_child_collections`, `get_collection`, `create_collection`, `update_collection`, `delete_collection`, `cleanup_collections`, `get_tags`, `manage_tags`, `get_highlights`, `manage_highlight`, `get_user`, `parse_url`, `check_urls_exist`, `library_audit`, `empty_trash`. **`library_audit` n'est pas exposé en REST** (l'analyse est locale, §5.1).
- Codes d'erreur uniformes : `MCP_TIMEOUT` → HTTP 504, `MCP_CRASHED` → 503, `RATE_LIMITED` → 429, `RAINDROP_API` → 502, `INVALID_INPUT` → 400.
- **Corbeille Raindrop = collection `-99`**, Tous = `0`, Non classés = `-1`. `search_raindrops` `per_page` max **50**.
- Textes de l'app en français, externalisés (pour le front ; le sidecar logue en anglais, messages d'erreur API en anglais).
- Fichiers app-data : `~/Library/Application Support/Raindrop-GUI/` (surchargeable par `APPDATA_DIR` pour les tests).
- Chaque task finit par des tests verts puis un commit.

## Structure des fichiers (cible fin de plan)

```
Raindrop-GUI/
├── package.json                  # deps racine + scripts dev/test/build
├── tsconfig.json                 # solution : shared + sidecar
├── vitest.config.ts
├── shared/
│   ├── types.ts                  # DTO normalisés consommés par le front (plan 2)
│   └── errors.ts                 # ErrorCode + ApiErrorBody + mapping HTTP
├── sidecar/
│   ├── index.ts                  # bootstrap : env, logs, MCP, HTTP, lockfile, shutdown
│   ├── config.ts                 # parsing env (zod) + constantes
│   ├── logger.ts                 # JSONL + rotation 7 jours
│   ├── lockfile.ts               # {port, token, pid} + réutilisation pid vivant
│   ├── mcp/
│   │   ├── connection.ts         # 1 connexion : transport injectable + callTool typé
│   │   ├── throttle.ts           # queue séquentielle + espacement 550 ms + retry lecture
│   │   └── lifecycle.ts          # spawn/restart ×3 backoff, états, events
│   ├── api/
│   │   ├── app.ts                # Hono : bearer, erreurs uniformes, /api/health
│   │   ├── deps.ts               # assemblage throttle×lifecycle → deps des routes
│   │   ├── sse.ts                # helper streamSSE des jobs
│   │   └── routes/
│   │       ├── raindrops.ts      # GET/POST/PATCH/DELETE /api/raindrops*, /bulk
│   │       ├── collections.ts
│   │       ├── tags.ts
│   │       ├── highlights.ts
│   │       ├── user.ts           # /api/user, /api/parse-url, /api/check-urls
│   │       ├── maintenance.ts    # /api/empty-trash, /api/collections/cleanup
│   │       ├── analysis.ts       # /api/analysis/scan|results/:type|status
│   │       └── jobs.ts           # /api/jobs/:id + /api/jobs/:id/events (SSE)
│   ├── direct/
│   │   └── raindropRest.ts       # REST direct (update url) — abstraction de secours §3.3
│   ├── jobs/
│   │   └── store.ts              # jobs {id, type, status, progress, cancel()}
│   ├── analysis/
│   │   ├── normalize.ts          # normalisation URL (pur)
│   │   ├── duplicates.ts         # groupes exacts + normalisés + fuzzy (pur)
│   │   ├── linkchecker.ts        # HEAD→GET, redirects chaîne, concurrence 6, timeout, retry
│   │   ├── snapshot.ts           # bibliothèque paginée via search_raindrops (50/page)
│   │   ├── cache.ts              # analysis.json + TTL 30 j
│   │   └── scanner.ts            # orchestration job scan (SSE, annulable, incrémental)
│   └── testing/
│       ├── fakeServer.ts         # builder MCP server factice (fixtures déterministes)
│       ├── fixtureStdio.ts       # entry stdio pour tests lifecycle (node via tsx)
│       └── targetServer.ts       # serveur HTTP de simulation pour le link checker
└── docs/superpowers/plans/       # ce plan
```

---

### Task 1 : Scaffold racine (package, TS, Vitest)

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore` (append)
- Test: `sidecar/smoke.test.ts` (supprimé à la Task 2)

**Interfaces:**
- Produces: scripts npm `test`, `typecheck`, `dev:sidecar`, `build:sidecar` ; conventions ESM/nodenext valables pour tout le plan.

- [ ] **Step 1: Écrire package.json, tsconfig.json, vitest.config.ts**

`package.json` :

```json
{
  "name": "raindrop-gui",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev:sidecar": "tsx watch sidecar/index.ts",
    "build:sidecar": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@kud/mcp-raindrop-io": "1.3.1",
    "@modelcontextprotocol/sdk": "^1.27.1",
    "@hono/node-server": "^1.14.0",
    "hono": "^4.9.0",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@types/node": "^24",
    "tsx": "^4.20.0",
    "typescript": "^5.9.0",
    "vitest": "^3.2.0"
  }
}
```

`tsconfig.json` :

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "outDir": "dist-sidecar",
    "rootDir": "."
  },
  "include": ["shared/**/*.ts", "sidecar/**/*.ts"],
  "exclude": ["**/*.test.ts", "sidecar/testing/**"]
}
```

> Note : `sidecar/testing/**` est exclu du build (code de test uniquement), mais **inclus par Vitest**. Les imports relatifs du code buildé portent toujours l'extension `.js`.

`vitest.config.ts` :

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["shared/**/*.test.ts", "sidecar/**/*.test.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
```

- [ ] **Step 2: Compléter .gitignore**

`.gitignore` couvre déjà `node_modules/`, `dist-sidecar/` et `*.tsbuildinfo`
(posé avec les conventions projet, avant l'exécution du plan) — vérifier et
ajouter seulement ce qui manque.

- [ ] **Step 3: Test de fumée Vitest**

`sidecar/smoke.test.ts` :

```ts
import { describe, it, expect } from "vitest";

describe("scaffold", () => {
  it("exécute vitest en ESM/TypeScript", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Installer et vérifier**

Run: `npm install && npm test && npm run typecheck`
Expected: install OK (le dépôt doit contenir `node_modules/@kud/mcp-raindrop-io/dist/index.js`), test PASS, typecheck OK.

- [ ] **Step 5: Vérifier le tool MCP listé par le package épinglé**

Run: `node --input-type=module -e "console.log(Object.keys(await import('@kud/mcp-raindrop-io/dist/index.js')).length)"`
Expected: exit 0 (le module se charge ; l'exit 1 signifierait un token requis au import-time — voir note Task 6 sur `MCP_RAINDROPIO_TOKEN`).
Note : si l'import échoue pour cause de token, ce n'est pas bloquant : le package vérifie le token dans son `main()` d'exécution ; on le spawn toujours avec le token en env.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore sidecar/smoke.test.ts
git commit -m "feat(sidecar): scaffold racine — deps épinglées, TS nodenext, Vitest"
```

---

### Task 2 : Types partagés et erreurs API

**Files:**
- Create: `shared/types.ts`, `shared/errors.ts`
- Test: `shared/errors.test.ts`
- Delete: `sidecar/smoke.test.ts`

**Interfaces:**
- Produces (tout le plan + front) : `RaindropItem`, `Collection`, `Tag`, `Highlight`, `RaindropUser`, `ErrorCode`, `ApiErrorBody`, `errorStatus(code)`, `apiError(c, code, message, tool?)`, `CallOutcome<T>`.

- [ ] **Step 1: Écrire shared/types.ts**

```ts
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
}

export interface Collection {
  id: number;
  title: string;
  parentId: number | null;
  count: number;
  public: boolean;
  view: string;
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
```

- [ ] **Step 2: Écrire shared/errors.ts**

```ts
import type { Context } from "hono";

export type ErrorCode =
  | "MCP_TIMEOUT"
  | "MCP_CRASHED"
  | "RATE_LIMITED"
  | "RAINDROP_API"
  | "INVALID_INPUT";

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; tool?: string };
}

const STATUS_BY_CODE: Record<ErrorCode, 400 | 429 | 502 | 503 | 504> = {
  INVALID_INPUT: 400,
  RATE_LIMITED: 429,
  RAINDROP_API: 502,
  MCP_CRASHED: 503,
  MCP_TIMEOUT: 504,
};

export function errorStatus(code: ErrorCode): number {
  return STATUS_BY_CODE[code];
}

/** Résultat typé d'un appel tool MCP (succès métier ou erreur classée). */
export type CallOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; message: string; tool?: string };

/** Réponse HTTP d'erreur uniforme `{error:{code,message,tool?}}`. */
export function apiError(
  c: Context,
  code: ErrorCode,
  message: string,
  tool?: string,
): Response {
  const body: ApiErrorBody = { error: { code, message, ...(tool ? { tool } : {}) } };
  return c.json(body, errorStatus(code) as 400 | 429 | 502 | 503 | 504);
}
```

- [ ] **Step 3: Écrire le test**

`shared/errors.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { errorStatus } from "./errors.js";

describe("errorStatus", () => {
  it("mappe chaque code sur le statut HTTP de la spec", () => {
    expect(errorStatus("INVALID_INPUT")).toBe(400);
    expect(errorStatus("RATE_LIMITED")).toBe(429);
    expect(errorStatus("RAINDROP_API")).toBe(502);
    expect(errorStatus("MCP_CRASHED")).toBe(503);
    expect(errorStatus("MCP_TIMEOUT")).toBe(504);
  });
});
```

- [ ] **Step 4: Supprimer la fumée, vérifier**

Run: `rm sidecar/smoke.test.ts && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts shared/errors.ts shared/errors.test.ts
git commit -m "feat(shared): DTO normalisés, codes d'erreur API uniformes"
```

---

### Task 3 : Fake MCP server in-process (fixtures déterministes)

**Files:**
- Create: `sidecar/testing/fakeServer.ts`
- Test: `sidecar/testing/fakeServer.test.ts`

**Interfaces:**
- Produces : `buildFakeRaindropServer(opts?: { raindropCount?: number; failTools?: string[] }) => Promise<McpServer>` et `connectFake() => Promise<{ client: Client; server: McpServer }>` (paire InMemory déjà connectée). Les Tasks 4, 7–10, 13, 14 consomment `connectFake`.
- Sémantique : implémente les tools utilisés par les routes, avec données en mémoire. `failTools: string[]` fait échouer les tools nommés (réponse `Error: …`) pour tester les erreurs.

- [ ] **Step 1: Écrire le fake**

`sidecar/testing/fakeServer.ts` :

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";

// ─── Fixtures déterministes ──────────────────────────────────────────────────

export interface FakeRaindrop {
  id: number;
  link: string;
  title: string;
  excerpt: string;
  note: string;
  tags: string[];
  created: string;
  lastUpdate: string;
  important: boolean;
  type: string;
  cover: string | null;
  collectionId: number;
  removed: boolean; // corbeille
}

let nextId = 1000;

export function makeFixtures(raindropCount = 60) {
  const domains = ["example.com", "docs.python.org", "github.com", "news.ycombinator.com"];
  const tagPool = ["typescript", "rust", "design", "outils", "à-lire", "ia"];
  const collections = [
    { id: 101, title: "Dev", parentId: null as number | null, count: 0, public: false, view: "list" },
    { id: 102, title: "Design", parentId: null, count: 0, public: false, view: "grid" },
    { id: 201, title: "Rust", parentId: 101, count: 0, public: false, view: "list" },
  ];
  const raindrops: FakeRaindrop[] = [];
  for (let i = 0; i < raindropCount; i++) {
    const domain = domains[i % domains.length]!;
    raindrops.push({
      id: nextId++,
      link: `https://${domain}/page-${i}`,
      title: `Article ${i} sur ${domain}`,
      excerpt: `Extrait ${i}`,
      note: "",
      tags: i % 3 === 0 ? [] : [tagPool[i % tagPool.length]!],
      created: new Date(Date.UTC(2025, 0, 1 + (i % 28), 12)).toISOString(),
      lastUpdate: new Date(Date.UTC(2025, 5, 1 + (i % 28), 12)).toISOString(),
      important: i % 7 === 0,
      type: "link",
      cover: null,
      collectionId: collections[i % collections.length]!.id,
      removed: false,
    });
  }
  // Doublons assumés pour les tests d'analyse
  const dupSrc = raindrops[0]!;
  raindrops.push({ ...dupSrc, id: nextId++, title: "Copie exacte" });
  raindrops.push({
    ...dupSrc,
    id: nextId++,
    title: "Copie normalisée",
    link: dupSrc.link.replace("http://", "https://") + "/",
  });
  return { raindrops, collections, tags: tagPool };
}

// ─── Serveur factice ─────────────────────────────────────────────────────────

/**
 * Sérialise au format BRUT Raindrop API (celui que renvoie le vrai package
 * MCP) : les mappers du sidecar sont ainsi testés contre la vraie forme.
 */
function toRaw(r: FakeRaindrop) {
  return {
    id: r.id,
    link: r.link,
    title: r.title,
    excerpt: r.excerpt,
    note: r.note,
    tags: r.tags,
    created: r.created,
    last_update: r.lastUpdate,
    important: r.important,
    type: r.type,
    domain: new URL(r.link).hostname,
    cover: r.cover ? [{ src: r.cover }] : [],
    collection: { $id: r.collectionId },
  };
}

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });
const err = (msg: string) => ({ content: [{ type: "text" as const, text: `Error: ${msg}` }] });

export function buildFakeRaindropServer(opts?: {
  raindropCount?: number;
  failTools?: string[];
}) {
  const fail = new Set(opts?.failTools ?? []);
  const fx = makeFixtures(opts?.raindropCount ?? 60);
  const server = new McpServer({ name: "fake-raindrop", version: "0.0.1" });

  const guard = (name: string) => (fail.has(name) ? err(`fake failure: ${name}`) : null);

  server.registerTool(
    "search_raindrops",
    {
      inputSchema: {
        collection_id: z.number().default(0),
        search: z.string().optional(),
        page: z.number().default(0),
        per_page: z.number().default(25),
        important: z.boolean().optional(),
        notag: z.boolean().optional(),
      },
    },
    async ({ collection_id, page, per_page, important, notag }) => {
      const g = guard("search_raindrops");
      if (g) return g;
      let items = fx.raindrops.filter((r) => (collection_id === -99 ? r.removed : !r.removed));
      if (collection_id > 0) items = items.filter((r) => r.collectionId === collection_id);
      if (important) items = items.filter((r) => r.important);
      if (notag) items = items.filter((r) => r.tags.length === 0);
      const start = page * per_page;
      return ok({ count: items.length, items: items.slice(start, start + per_page).map(toRaw) });
    },
  );

  server.registerTool(
    "get_raindrop",
    { inputSchema: { id: z.number() } },
    async ({ id }) => {
      const g = guard("get_raindrop");
      if (g) return g;
      const r = fx.raindrops.find((x) => x.id === id);
      return r ? ok(toRaw(r)) : err(`raindrop ${id} not found`);
    },
  );

  server.registerTool(
    "create_raindrop",
    {
      inputSchema: {
        link: z.string().url(),
        title: z.string().optional(),
        collection_id: z.number().optional(),
        tags: z.array(z.string()).optional(),
      },
    },
    async (a) => {
      const g = guard("create_raindrop");
      if (g) return g;
      const r: FakeRaindrop = {
        id: nextId++,
        link: a.link,
        title: a.title ?? a.link,
        excerpt: "",
        note: "",
        tags: a.tags ?? [],
        created: new Date().toISOString(),
        lastUpdate: new Date().toISOString(),
        important: false,
        type: "link",
        cover: null,
        collectionId: a.collection_id ?? -1,
        removed: false,
      };
      fx.raindrops.push(r);
      return ok(toRaw(r));
    },
  );

  server.registerTool(
    "update_raindrop",
    {
      inputSchema: {
        id: z.number(),
        title: z.string().optional(),
        excerpt: z.string().optional(),
        note: z.string().optional(),
        tags: z.array(z.string()).optional(),
        important: z.boolean().optional(),
        collection_id: z.number().optional(),
      },
    },
    async ({ id, ...patch }) => {
      const g = guard("update_raindrop");
      if (g) return g;
      const r = fx.raindrops.find((x) => x.id === id);
      if (!r) return err(`raindrop ${id} not found`);
      if (patch.title != null) r.title = patch.title;
      if (patch.excerpt != null) r.excerpt = patch.excerpt;
      if (patch.note != null) r.note = patch.note;
      if (patch.tags != null) r.tags = patch.tags;
      if (patch.important != null) r.important = patch.important;
      if (patch.collection_id != null) r.collectionId = patch.collection_id;
      return ok(toRaw(r));
    },
  );

  server.registerTool(
    "delete_raindrop",
    { inputSchema: { id: z.number() } },
    async ({ id }) => {
      const g = guard("delete_raindrop");
      if (g) return g;
      const r = fx.raindrops.find((x) => x.id === id);
      if (!r) return err(`raindrop ${id} not found`);
      r.removed = true;
      return ok({ deleted: true });
    },
  );

  server.registerTool(
    "bulk_raindrops",
    {
      inputSchema: {
        operation: z.enum(["update", "move", "delete"]),
        collection_id: z.number(),
        ids: z.array(z.number()).optional(),
        to_collection_id: z.number().optional(),
        tags: z.array(z.string()).optional(),
        important: z.boolean().optional(),
      },
    },
    async ({ operation, collection_id, ids, to_collection_id, tags, important }) => {
      const g = guard("bulk_raindrops");
      if (g) return g;
      const inScope = (r: FakeRaindrop) =>
        (ids ? ids.includes(r.id) : true) &&
        (collection_id === 0 || collection_id === -99 ? true : r.collectionId === collection_id);
      let n = 0;
      for (const r of fx.raindrops) {
        if (!inScope(r)) continue;
        if (operation === "delete") r.removed = true;
        if (operation === "move" && to_collection_id != null) r.collectionId = to_collection_id;
        if (operation === "update") {
          if (tags != null) r.tags = tags;
          if (important != null) r.important = important;
        }
        n++;
      }
      return ok({ affected: n });
    },
  );

  server.registerTool("get_collections", { inputSchema: {} }, async () => {
    const g = guard("get_collections");
    if (g) return g;
    return ok({ items: fx.collections.filter((c) => c.parentId === null) });
  });

  server.registerTool("get_child_collections", { inputSchema: {} }, async () => {
    const g = guard("get_child_collections");
    if (g) return g;
    return ok({ items: fx.collections.filter((c) => c.parentId !== null) });
  });

  server.registerTool(
    "get_collection",
    { inputSchema: { id: z.number() } },
    async ({ id }) => {
      const c = fx.collections.find((x) => x.id === id);
      return c ? ok(c) : err(`collection ${id} not found`);
    },
  );

  server.registerTool(
    "create_collection",
    {
      inputSchema: {
        title: z.string(),
        parent_id: z.number().optional(),
      },
    },
    async ({ title, parent_id }) => {
      const g = guard("create_collection");
      if (g) return g;
      const c = { id: nextId++, title, parentId: parent_id ?? null, count: 0, public: false, view: "list" };
      fx.collections.push(c);
      return ok(c);
    },
  );

  server.registerTool(
    "update_collection",
    { inputSchema: { id: z.number(), title: z.string().optional() } },
    async ({ id, title }) => {
      const c = fx.collections.find((x) => x.id === id);
      if (!c) return err(`collection ${id} not found`);
      if (title != null) c.title = title;
      return ok(c);
    },
  );

  server.registerTool(
    "delete_collection",
    { inputSchema: { id: z.number() } },
    async ({ id }) => {
      const g = guard("delete_collection");
      if (g) return g;
      const i = fx.collections.findIndex((x) => x.id === id);
      if (i === -1) return err(`collection ${id} not found`);
      fx.collections.splice(i, 1);
      return ok({ deleted: true });
    },
  );

  server.registerTool(
    "cleanup_collections",
    { inputSchema: { confirm: z.boolean().default(false) } },
    async ({ confirm }) => {
      const g = guard("cleanup_collections");
      if (g) return g;
      if (!confirm) return ok({ message: "Pass confirm: true" });
      return ok({ cleaned: 0 });
    },
  );

  server.registerTool(
    "get_tags",
    { inputSchema: { collection_id: z.number().optional() } },
    async () => {
      const g = guard("get_tags");
      if (g) return g;
      const counts = new Map<string, number>();
      for (const r of fx.raindrops) {
        if (r.removed) continue;
        for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
      }
      // format brut Raindrop : {_id, count} (normalisé par la route GET /api/tags)
      return ok({ items: [...counts].map(([name, count]) => ({ _id: name, count })) });
    },
  );

  server.registerTool(
    "manage_tags",
    {
      inputSchema: {
        operation: z.enum(["rename", "merge", "delete"]),
        tags: z.array(z.string()),
        new_name: z.string().optional(),
      },
    },
    async ({ operation, tags, new_name }) => {
      const g = guard("manage_tags");
      if (g) return g;
      for (const r of fx.raindrops) {
        if (operation === "delete") r.tags = r.tags.filter((t) => !tags.includes(t));
        if (operation === "rename" && r.tags.includes(tags[0]!))
          r.tags = r.tags.map((t) => (t === tags[0] ? new_name! : t));
        if (operation === "merge" && r.tags.some((t) => tags.includes(t)))
          r.tags = [...r.tags.filter((t) => !tags.includes(t)), new_name!];
      }
      return ok({ done: true });
    },
  );

  server.registerTool(
    "get_highlights",
    { inputSchema: { raindrop_id: z.number().optional() } },
    async () => {
      const g = guard("get_highlights");
      if (g) return g;
      return ok({ items: [] });
    },
  );

  server.registerTool("get_user", { inputSchema: {} }, async () => {
    const g = guard("get_user");
    if (g) return g;
    return ok({
      id: 42,
      email: "moi@example.com",
      fullName: "Utilisateur Test",
      pro: true,
      bookmarksCount: fx.raindrops.filter((r) => !r.removed).length,
    });
  });

  server.registerTool(
    "parse_url",
    { inputSchema: { url: z.string().url() } },
    async ({ url }) => {
      const g = guard("parse_url");
      if (g) return g;
      return ok({ title: `Meta de ${url}`, description: "Description factice", type: "link" });
    },
  );

  server.registerTool(
    "check_urls_exist",
    { inputSchema: { urls: z.array(z.string().url()) } },
    async ({ urls }) => {
      const g = guard("check_urls_exist");
      if (g) return g;
      const items = urls.map((u) => ({ url: u, exists: fx.raindrops.some((r) => r.link === u) }));
      return ok({ items });
    },
  );

  server.registerTool(
    "empty_trash",
    { inputSchema: { confirm: z.boolean().default(false) } },
    async ({ confirm }) => {
      const g = guard("empty_trash");
      if (g) return g;
      if (!confirm) return ok({ message: "Pass confirm: true" });
      const n = fx.raindrops.filter((r) => r.removed).length;
      for (const r of fx.raindrops) if (r.removed) r.removed = false; // vidée = disparue
      fx.raindrops.splice(0, fx.raindrops.length, ...fx.raindrops.filter((r) => !r.removed));
      return ok({ deleted: n });
    },
  );

  return { server, fixtures: fx };
}

/** Paire client↔serveur in-memory déjà connectée (handshake fait). */
export async function connectFake(opts?: {
  raindropCount?: number;
  failTools?: string[];
}) {
  const { server, fixtures } = buildFakeRaindropServer(opts);
  const client = new Client({ name: "fake-client", version: "0.0.1" });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return { client, server, fixtures };
}
```

- [ ] **Step 2: Écrire le test de connexion**

`sidecar/testing/fakeServer.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { connectFake } from "./fakeServer.js";

describe("fake MCP server", () => {
  it("liste les tools et répond au search", async () => {
    const { client, fixtures } = await connectFake({ raindropCount: 30 });
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("search_raindrops");

    const res = await client.callTool({ name: "search_raindrops", arguments: { per_page: 10 } });
    const text = (res.content as [{ type: string; text: string }])[0]!.text;
    const data = JSON.parse(text) as { count: number; items: unknown[] };
    expect(data.count).toBe(30);
    expect(data.items).toHaveLength(10);
    expect(fixtures.raindrops.length).toBeGreaterThan(30);
  });

  it("échoue selon failTools avec le préfixe 'Error: '", async () => {
    const { client } = await connectFake({ failTools: ["get_user"] });
    const res = await client.callTool({ name: "get_user", arguments: {} });
    const text = (res.content as [{ type: string; text: string }])[0]!.text;
    expect(text.startsWith("Error: ")).toBe(true);
  });
});
```

- [ ] **Step 3: Vérifier**

Run: `npm test`
Expected: PASS (2 tests fake + 1 errors).

- [ ] **Step 4: Commit**

```bash
git add sidecar/testing/fakeServer.ts sidecar/testing/fakeServer.test.ts
git commit -m "test(sidecar): fake MCP server in-process avec fixtures déterministes"
```

---

### Task 4 : Connexion MCP typée (transport injectable, timeout par appel)

**Files:**
- Create: `sidecar/mcp/connection.ts`
- Test: `sidecar/mcp/connection.test.ts`

**Interfaces:**
- Consumes : `connectFake()` (Task 3), `CallOutcome` (Task 2).
- Produces (Task 6, 8+ consomment) :
  - `interface McpTransportFactory { create(): Promise<Transport> }` — prod : stdio vers le subprocess ; test : InMemory.
  - `class McpConnection { static create(factory, opts?: {timeoutMs?: number}): Promise<McpConnection> ; call<T>(tool, args, timeoutMs?): Promise<CallOutcome<T>> ; close(): Promise<void> }`
  - Comportement d'erreur : texte `Error: …` → `{ok:false, code:"RAINDROP_API"}` ; timeout → `MCP_TIMEOUT` ; transport fermé → `MCP_CRASHED`.

- [ ] **Step 1: Écrire le test d'abord**

`sidecar/mcp/connection.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { connectFake } from "../testing/fakeServer.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { McpConnection } from "./connection.js";

const inMemoryFactory = async (fakeOpts?: Parameters<typeof connectFake>[0]) => {
  const { client, server } = await connectFake(fakeOpts);
  const factory = {
    // Le transport côté "connexion" est celui du client existant : on le réutilise.
    create: async (): Promise<Transport> => {
      throw new Error("use prebuilt pair");
    },
  };
  return { client, server, factory };
};

describe("McpConnection", () => {
  it("parse le JSON de succès en CallOutcome ok", async () => {
    const { client } = await inMemoryFactory();
    // Connexion directe autour du client déjà connecté :
    const conn = McpConnection.fromClient(client);
    const out = await conn.call<{ fullName: string }>("get_user", {});
    expect(out).toEqual({ ok: true, data: { id: 42, email: "moi@example.com", fullName: "Utilisateur Test", pro: true, bookmarksCount: expect.any(Number) } });
    await conn.close();
  });

  it("classe une réponse 'Error: …' en RAINDROP_API", async () => {
    const { client } = await inMemoryFactory({ failTools: ["get_user"] });
    const conn = McpConnection.fromClient(client);
    const out = await conn.call("get_user", {});
    expect(out).toMatchObject({ ok: false, code: "RAINDROP_API" });
    await conn.close();
  });

  it("classe un timeout en MCP_TIMEOUT", async () => {
    const { client } = await inMemoryFactory();
    const conn = McpConnection.fromClient(client);
    const out = await conn.call("get_user", {}, 1); // 1 ms : timeout garanti
    expect(out).toMatchObject({ ok: false, code: "MCP_TIMEOUT" });
    await conn.close();
  });

  it("classe une connexion morte en MCP_CRASHED", async () => {
    const { client } = await inMemoryFactory();
    const conn = McpConnection.fromClient(client);
    await conn.close();
    const out = await conn.call("get_user", {});
    expect(out).toMatchObject({ ok: false, code: "MCP_CRASHED" });
  });
});
```

> Ajustement autorisé pendant l'implémentation : si `InMemoryTransport.createLinkedPair()` ne permet pas le pattern `fromClient` tel quel, remplacer `fromClient` par un constructeur `new McpConnection(client, opts)` et faire `static connect(factory)` pour le cas stdio — l'important est la surface `call()` + codes d'erreur.

- [ ] **Step 2: Exécuter et constater l'échec**

Run: `npm test -- sidecar/mcp/connection.test.ts`
Expected: FAIL — `McpConnection` n'existe pas.

- [ ] **Step 3: Implémenter McpConnection**

`sidecar/mcp/connection.ts` :

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { CallOutcome } from "../../shared/errors.js";

export interface McpTransportFactory {
  create(): Promise<Transport>;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** Représente le JSON renvoyé par les tools du package MCP. */
class ToolError extends Error {}

function parseToolText(text: string): unknown {
  if (text.startsWith("Error: ")) throw new ToolError(text.slice("Error: ".length));
  return JSON.parse(text);
}

export class McpConnection {
  private transport: Transport | null = null;
  private constructor(private client: Client, private owned: boolean) {}

  /** Connexion vers un transport arbitraire (prod : stdio, test : injecté). */
  static async connect(
    factory: McpTransportFactory,
    opts?: { timeoutMs?: number },
  ): Promise<McpConnection> {
    const client = new Client({ name: "raindrop-gui-sidecar", version: "0.1.0" });
    const transport = await factory.create();
    await client.connect(transport);
    const conn = new McpConnection(client, true);
    conn.transport = transport;
    void opts; // le timeout est par appel (call())
    return conn;
  }

  /** Test helper : enveloppe un client déjà connecté (paire InMemory). */
  static fromClient(client: Client): McpConnection {
    return new McpConnection(client, false);
  }

  async call<T>(
    tool: string,
    args: Record<string, unknown>,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<CallOutcome<T>> {
    try {
      const result = await this.client.callTool(
        { name: tool, arguments: args },
        undefined,
        { timeout: timeoutMs },
      );
      const block = result.content?.[0] as { type: string; text: string } | undefined;
      if (result.isError || !block || block.type !== "text") {
        return { ok: false, code: "RAINDROP_API", message: `réponse invalide du tool ${tool}`, tool };
      }
      const data = parseToolText(block.text);
      return { ok: true, data: data as T };
    } catch (e) {
      return classifyError(e, tool);
    }
  }

  /** Notification de mort du transport (crash subprocess) — consommé par McpLifecycle. */
  onClose(cb: () => void): void {
    if (this.transport) this.transport.onclose = cb;
  }

  async close(): Promise<void> {
    if (!this.owned) return;
    if (this.transport) this.transport.onclose = undefined;
    await this.client.close();
  }
}

function classifyError(e: unknown, tool: string): CallOutcome<never> {
  if (e instanceof ToolError) {
    return { ok: false, code: "RAINDROP_API", message: e.message, tool };
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (/timed out|timeout/i.test(msg)) {
    return { ok: false, code: "MCP_TIMEOUT", message: msg, tool };
  }
  if (/closed|not connected/i.test(msg)) {
    return { ok: false, code: "MCP_CRASHED", message: msg, tool };
  }
  return { ok: false, code: "MCP_CRASHED", message: msg, tool };
}

/** Factory prod : stdio vers le package épinglé. Token passé par env. */
export function stdioFactory(mcpEntryPath: string, token: string): McpTransportFactory {
  return {
    create: async () =>
      new StdioClientTransport({
        command: process.execPath,
        args: [mcpEntryPath],
        env: { ...process.env, MCP_RAINDROPIO_TOKEN: token } as Record<string, string>,
        stderr: "pipe",
      }),
  };
}
```

- [ ] **Step 4: Adapter le test si nécessaire, vérifier**

Run: `npm test -- sidecar/mcp/connection.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add sidecar/mcp/connection.ts sidecar/mcp/connection.test.ts
git commit -m "feat(sidecar): connexion MCP typée — codes MCP_TIMEOUT/MCP_CRASHED/RAINDROP_API"
```

---

### Task 5 : Throttle séquentiel (rate limiting proactif)

**Files:**
- Create: `sidecar/mcp/throttle.ts`
- Test: `sidecar/mcp/throttle.test.ts`

**Interfaces:**
- Consumes : rien (générique).
- Produces (Task 7 deps) : `class Throttle { constructor(minIntervalMs: number) ; run<T>(fn: () => Promise<T>): Promise<T> }` — sérialise, espace les démarrages d'au moins `minIntervalMs`, et expose `readonly pendingCount: number`.

- [ ] **Step 1: Écrire le test d'abord**

`sidecar/mcp/throttle.test.ts` :

```ts
import { describe, it, expect, vi } from "vitest";
import { Throttle } from "./throttle.js";

describe("Throttle", () => {
  it("sérialise et espace les appels d'au moins minIntervalMs", async () => {
    const t = new Throttle(50);
    const starts: number[] = [];
    const job = (n: number) => async () => {
      starts.push(Date.now());
      return n;
    };
    const [a, b, c] = await Promise.all([t.run(job(1)), t.run(job(2)), t.run(job(3))]);
    expect([a, b, c]).toEqual([1, 2, 3]);
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(45); // marge timer
    expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(45);
  });

  it("ne compte pas le temps d'exécution dans l'intervalle", async () => {
    const t = new Throttle(30);
    const slow = async () => {
      await new Promise((r) => setTimeout(r, 80));
      return "ok";
    };
    const p1 = t.run(slow);
    const start = Date.now();
    await t.run(async () => "second");
    await p1;
    // le 2e démarre après la FIN du 1er (sérialisation), pas 30 ms après son DÉBUT
    expect(Date.now() - start).toBeGreaterThanOrEqual(75);
  });

  it("propage l'erreur sans bloquer la suite", async () => {
    const t = new Throttle(1);
    await expect(t.run(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    await expect(t.run(async () => 42)).resolves.toBe(42);
    expect(t.pendingCount).toBe(0);
  });

  it("les timers d'espacement sont libérés après usage (pas de fuite vitest)", async () => {
    vi.useFakeTimers();
    const t = new Throttle(100);
    const p = t.run(async () => 1);
    await vi.advanceTimersByTimeAsync(150);
    await expect(p).resolves.toBe(1);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Exécuter et constater l'échec**

Run: `npm test -- sidecar/mcp/throttle.test.ts`
Expected: FAIL — module absent.

- [ ] **Step 3: Implémenter**

`sidecar/mcp/throttle.ts` :

```ts
/**
 * File séquentielle avec espacement minimum entre DÉBUTS d'appels.
 * 120 req/min autorisées par Raindrop → 550 ms ≈ 109 req/min (marge).
 * Le 429 HTTP est indétectable via MCP (aplati en "Error: ..." par le
 * package) : la protection est préventive, pas réactive (contrainte plan).
 */
export class Throttle {
  private queue: Promise<unknown> = Promise.resolve();
  private lastStart = 0;
  private _pending = 0;

  constructor(public readonly minIntervalMs: number) {}

  get pendingCount(): number {
    return this._pending;
  }

  run<T>(fn: () => Promise<T>): Promise<T> {
    this._pending++;
    const result = this.queue.then(async () => {
      const now = Date.now();
      const wait = Math.max(0, this.lastStart + this.minIntervalMs - now);
      if (wait > 0) await new Promise<void>((r) => setTimeout(r, wait));
      this.lastStart = Date.now();
      try {
        return await fn();
      } finally {
        this._pending--;
      }
    });
    // la file continue même si l'appel échoue
    this.queue = result.catch(() => undefined);
    return result as Promise<T>;
  }
}
```

- [ ] **Step 4: Vérifier**

Run: `npm test -- sidecar/mcp/throttle.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add sidecar/mcp/throttle.ts sidecar/mcp/throttle.test.ts
git commit -m "feat(sidecar): throttle séquentiel 550 ms pour la limite 120 req/min"
```

---

### Task 6 : Cycle de vie du subprocess MCP (restart ×3, états)

**Files:**
- Create: `sidecar/mcp/lifecycle.ts`, `sidecar/testing/fixtureStdio.ts`
- Test: `sidecar/mcp/lifecycle.test.ts`

**Interfaces:**
- Consumes : `McpConnection`, `stdioFactory` (Task 4) ; `buildFakeRaindropServer` (Task 3).
- Produces (Task 7 deps, §7 bannière front) :
  - `type LifecycleState = "starting" | "connected" | "restarting" | "crashed" | "stopped"`.
  - `class McpLifecycle extends TypedEmitter` (EventEmitter typé : `state` event) :
    - `constructor(opts: { factory: McpTransportFactory; maxRestarts?: number; restartBackoffMs?: number })` (défauts : 3, séquence 1000/2000/4000)
    - `start(): Promise<void>` — connecte (connect = health-check : un `listTools` réussit), émet `state`.
    - `call<T>(tool, args, timeoutMs?): Promise<CallOutcome<T>>` — délègue à la connexion courante ; si état ≠ connected → `{ok:false, code:"MCP_CRASHED"}`.
    - `restart(): Promise<void>` — redémarrage manuel (bouton UI) : remet le compteur d'échecs à zéro.
    - `stop(): Promise<void>` — arrêt propre (état `stopped`, plus de redémarrage auto).
    - `get state(): LifecycleState`.
  - Détection de crash : `transport.onclose`/`onerror` → si `!stopping` → relance auto jusqu'à `maxRestarts` (compteur remis à zéro après 60 s de connexion stable), sinon état `crashed`.

- [ ] **Step 1: Écrire l'entry stdio de test**

`sidecar/testing/fixtureStdio.ts` — exécuté comme subprocess par les tests lifecycle :

```ts
// Usage : tsx sidecar/testing/fixtureStdio.ts <mode>
// modes : healthy | crash-after-connect | slow-exit
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const mode = process.argv[2] ?? "healthy";
const { server } = await import("./fakeServer.js").then((m) => m.buildFakeRaindropServer());
const transport = new StdioServerTransport();
await server.connect(transport);
if (mode === "crash-after-connect") {
  setTimeout(() => process.exit(1), 200);
}
if (mode === "slow-exit") {
  // reste vivant jusqu'au SIGTERM du test
}
```

- [ ] **Step 2: Écrire le test d'abord**

`sidecar/mcp/lifecycle.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { McpLifecycle } from "./lifecycle.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const tsx = fileURLToPath(new URL("../../../node_modules/.bin/tsx", import.meta.url));

function fixtureFactory(mode: string, backoff = 50) {
  return {
    create: async () => {
      const t = new StdioClientTransport({
        command: tsx,
        args: [`${here}../testing/fixtureStdio.ts`, mode],
        env: { ...process.env } as Record<string, string>,
        stderr: "pipe",
      });
      return t;
    },
  };
}

describe("McpLifecycle", () => {
  it("démarre sain : health-check listTools passe", async () => {
    const lc = new McpLifecycle({ factory: fixtureFactory("healthy"), restartBackoffMs: 50 });
    await lc.start();
    expect(lc.state).toBe("connected");
    const out = await lc.call<{ email: string }>("get_user", {});
    expect(out.ok).toBe(true);
    await lc.stop();
    expect(lc.state).toBe("stopped");
  }, 20000);

  it("redémarre automatiquement après un crash du subprocess", async () => {
    const lc = new McpLifecycle({ factory: fixtureFactory("crash-after-connect"), restartBackoffMs: 50 });
    await lc.start();
    // le fixture s'arrête 200 ms après connect → restart auto attendu
    await new Promise((r) => setTimeout(r, 1500));
    expect(lc.state).toBe("connected");
    const out = await lc.call<{ id: number }>("get_user", {});
    expect(out.ok).toBe(true);
    await lc.stop();
  }, 20000);

  it("passe en crashed après maxRestarts échecs et call renvoie MCP_CRASHED", async () => {
    let attempts = 0;
    const failingFactory = {
      create: async () => {
        attempts++;
        throw new Error("spawn impossible (simulé)");
      },
    };
    const lc = new McpLifecycle({
      factory: failingFactory,
      maxRestarts: 2,
      restartBackoffMs: 20,
    });
    await expect(lc.start()).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 100));
    expect(lc.state).toBe("crashed");
    const out = await lc.call("get_user", {});
    expect(out).toMatchObject({ ok: false, code: "MCP_CRASHED" });
    expect(attempts).toBeGreaterThanOrEqual(3); // initial + 2 restarts
  }, 20000);

  it("restart() manuel répare un état crashed", async () => {
    const lc = new McpLifecycle({
      factory: fixtureFactory("healthy"),
      maxRestarts: 0,
      restartBackoffMs: 20,
    });
    await lc.start();
    await lc.stop();
    await lc.restart();
    expect(lc.state).toBe("connected");
    await lc.stop();
  }, 20000);

  // nettoyage : spawn() importé seulement pour forcer le keep-alive du process
  void spawn;
});
```

- [ ] **Step 3: Exécuter et constater l'échec**

Run: `npm test -- sidecar/mcp/lifecycle.test.ts`
Expected: FAIL — `McpLifecycle` n'existe pas.

- [ ] **Step 4: Implémenter McpLifecycle**

`sidecar/mcp/lifecycle.ts` :

```ts
import { EventEmitter } from "node:events";
import { McpConnection } from "./connection.js";
import type { McpTransportFactory } from "./connection.js";
import type { CallOutcome } from "../../shared/errors.js";

export type LifecycleState = "starting" | "connected" | "restarting" | "crashed" | "stopped";

export interface LifecycleEvents {
  state: (state: LifecycleState) => void;
}

export class McpLifecycle {
  private conn: McpConnection | null = null;
  private _state: LifecycleState = "stopped";
  private emitter = new EventEmitter();
  private restartsLeft: number;
  private stopping = false;
  private readonly maxRestarts: number;
  private readonly restartBackoffMs: number;
  private connectedSince = 0;
  private readonly stableMs = 60_000;

  constructor(opts: {
    factory: McpTransportFactory;
    maxRestarts?: number;
    restartBackoffMs?: number;
  }) {
    this.maxRestarts = opts.maxRestarts ?? 3;
    this.restartsLeft = this.maxRestarts;
    this.restartBackoffMs = opts.restartBackoffMs ?? 1000;
    this.factory = opts.factory;
  }

  private factory: McpTransportFactory;

  get state(): LifecycleState {
    return this._state;
  }

  on<K extends keyof LifecycleEvents>(event: K, listener: LifecycleEvents[K]): void {
    this.emitter.on(event, listener);
  }

  private setState(s: LifecycleState): void {
    this._state = s;
    this.emitter.emit("state", s);
  }

  async start(): Promise<void> {
    this.stopping = false;
    this.setState("starting");
    await this.connectOnce();
  }

  private async connectOnce(): Promise<void> {
    this.conn?.close().catch(() => undefined);
    this.conn = await McpConnection.connect(this.factory);
    // Health-check : le handshake + listTools implicite du SDK a réussi.
    const transport = this.conn; // onclose surveillé via wrapper ci-dessous
    void transport;
    this.markConnected();
    // Surveiller la mort de la connexion : le SDK émet close sur le client.
    this.conn.onClose(() => this.handleClose());
  }

  private markConnected(): void {
    this.connectedSince = Date.now();
    this.setState("connected");
  }

  private handleClose(): void {
    if (this.stopping || this._state === "crashed" || this._state === "stopped") return;
    // connexion stable > 60 s : on repart sur un quota complet de restarts
    if (Date.now() - this.connectedSince > this.stableMs) this.restartsLeft = this.maxRestarts;
    void this.autoRestart();
  }

  private async autoRestart(): Promise<void> {
    if (this.restartsLeft <= 0) {
      this.setState("crashed");
      return;
    }
    this.restartsLeft--;
    this.setState("restarting");
    const delay = this.restartBackoffMs * 2 ** (this.maxRestarts - this.restartsLeft - 1);
    await new Promise((r) => setTimeout(r, delay));
    if (this.stopping) return;
    try {
      await this.connectOnce();
    } catch {
      await this.autoRestart();
    }
  }

  /** Redémarrage manuel (bouton UI) : quota d'échecs remis à zéro. */
  async restart(): Promise<void> {
    this.stopping = false;
    this.restartsLeft = this.maxRestarts;
    this.setState("restarting");
    try {
      await this.connectOnce();
    } catch (e) {
      this.setState("crashed");
      throw e;
    }
  }

  async call<T>(
    tool: string,
    args: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<CallOutcome<T>> {
    if (this._state !== "connected" || !this.conn) {
      return { ok: false, code: "MCP_CRASHED", message: `MCP indisponible (état: ${this._state})`, tool };
    }
    return this.conn.call<T>(tool, args, timeoutMs);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.setState("stopped");
    await this.conn?.close().catch(() => undefined);
    this.conn = null;
  }
}
```

- [ ] **Step 5: Vérifier**

Run: `npm test -- sidecar/mcp/lifecycle.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add sidecar/mcp/lifecycle.ts sidecar/mcp/lifecycle.test.ts sidecar/testing/fixtureStdio.ts sidecar/mcp/connection.ts
git commit -m "feat(sidecar): cycle de vie subprocess MCP — restart auto ×3 backoff, état crashed"
```

---

### Task 7 : Serveur Hono — auth Bearer, erreurs uniformes, /api/health, deps

**Files:**
- Create: `sidecar/api/app.ts`, `sidecar/api/deps.ts`
- Test: `sidecar/api/app.test.ts`

**Interfaces:**
- Consumes : `McpLifecycle`, `Throttle`, `CallOutcome`, `apiError`.
- Produces (Tasks 8–10, 14 consomment) :
  - `interface SidecarDeps { mcp: (tool: string, args: Record<string, unknown>, timeoutMs?: number) => Promise<CallOutcome<unknown>> ; state(): LifecycleState ; restart(): Promise<void> ; jobs: JobStore }` — `mcp` = throttle ∘ lifecycle.
  - `createApp(deps: SidecarDeps, opts: { localToken: string }): Hono` — middleware Bearer + vérification d'`Origin` (spec §3.7) sur `/api/*`, erreurs uniformes, `GET /api/health`.
  - Routes montées : `app.route("/api/raindrops", raindropsRoutes(deps))` etc. (Tasks 8–10, 14).

- [ ] **Step 1: Écrire le test d'abord**

`sidecar/api/app.test.ts` :

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { createApp, type SidecarDeps } from "./app.js";
import { connectFake } from "../testing/fakeServer.js";
import { McpConnection } from "../mcp/connection.js";

let conn: McpConnection;

beforeEach(async () => {
  const fake = await connectFake({ raindropCount: 25 });
  conn = McpConnection.fromClient(fake.client);
});
afterEach(async () => conn.close());

function makeDeps(overrides?: Partial<SidecarDeps>): SidecarDeps {
  return {
    mcp: (tool, args, timeoutMs) => conn.call(tool, args, timeoutMs),
    state: () => "connected",
    restart: async () => undefined,
    jobs: {
      get: () => undefined,
      list: () => [],
      // JobStore complet arrive en Task 10 — stub minimal pour compiler
    } as SidecarDeps["jobs"],
    ...overrides,
  };
}

const appFor = (deps?: Partial<SidecarDeps>) =>
  createApp(makeDeps(deps), { localToken: "test-token" });

const get = (app: Hono, path: string, token = "test-token") =>
  app.request(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

describe("app", () => {
  it("refuse sans Bearer (401)", async () => {
    const res = await get(appFor(), "/api/health", "");
    expect(res.status).toBe(401);
  });

  it("refuse un mauvais token (401)", async () => {
    const res = await get(appFor(), "/api/health", "wrong");
    expect(res.status).toBe(401);
  });

  it("refuse une origine non locale (403, spec §3.7)", async () => {
    const res = await appFor().request("/api/health", {
      headers: { Origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
  });

  it("GET /api/health reflète l'état MCP", async () => {
    const res = await get(appFor(), "/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; mcp: string };
    expect(body.mcp).toBe("connected");
  });

  it("les erreurs MCP sont converties en erreur uniforme (503 sur crash)", async () => {
    const app = appFor({
      mcp: async () => ({ ok: false, code: "MCP_CRASHED", message: "subprocess mort" }),
    });
    const res = await get(app, "/api/user");
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("MCP_CRASHED");
  });

  it("POST /api/mcp/restart appelle le restart", async () => {
    let called = false;
    const app = appFor({ restart: async () => { called = true; } });
    const res = await app.request("/api/mcp/restart", { method: "POST" });
    expect(res.status).toBe(200);
    expect(called).toBe(true);
  });
});
```

- [ ] **Step 2: Exécuter et constater l'échec**

Run: `npm test -- sidecar/api/app.test.ts`
Expected: FAIL — `createApp` absent.

- [ ] **Step 3: Implémenter deps.ts puis app.ts**

`sidecar/api/deps.ts` :

```ts
import type { McpLifecycle } from "../mcp/lifecycle.js";
import type { Throttle } from "../mcp/throttle.js";
import type { CallOutcome } from "../../shared/errors.js";
import type { JobStore } from "../jobs/store.js"; // Task 10

export interface SidecarDeps {
  /** Appel tool MCP throttled (espacement 550 ms en prod). */
  mcp: (
    tool: string,
    args: Record<string, unknown>,
    timeoutMs?: number,
  ) => Promise<CallOutcome<unknown>>;
  state: () => import("../mcp/lifecycle.js").LifecycleState;
  restart: () => Promise<void>;
  jobs: JobStore;
}

export function makeMcpCaller(lifecycle: McpLifecycle, throttle: Throttle): SidecarDeps["mcp"] {
  return (tool, args, timeoutMs) => throttle.run(() => lifecycle.call(tool, args, timeoutMs));
}
```

> La Task 10 créera `sidecar/jobs/store.ts` avec `JobStore` ; pour compiler dès maintenant, créer le fichier avec la classe minimale (`get`, `list`, `create` levant `not implemented`) et l'étoffer en Task 10 — ou, plus simple : **faire la Task 10 avant celle-ci si l'exécution préfère**. Ordre alternatif accepté : 10 → 7 → 8 → 9.

`sidecar/api/app.ts` :

```ts
import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import { apiError } from "../../shared/errors.js";
import type { SidecarDeps } from "./deps.js";
import { raindropsRoutes } from "./routes/raindrops.js";
import { collectionsRoutes } from "./routes/collections.js";
import { tagsRoutes } from "./routes/tags.js";
import { highlightsRoutes } from "./routes/highlights.js";
import { userRoutes } from "./routes/user.js";
import { maintenanceRoutes } from "./routes/maintenance.js";
import { analysisRoutes } from "./routes/analysis.js";
import { jobsRoutes } from "./routes/jobs.js";

function bearerOk(expected: string, got: string | undefined): boolean {
  if (!got?.startsWith("Bearer ")) return false;
  const a = Buffer.from(got.slice(7));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createApp(deps: SidecarDeps, opts: { localToken: string }): Hono {
  const app = new Hono();

  app.use("/api/*", async (c, next) => {
    if (!bearerOk(opts.localToken, c.req.header("Authorization"))) {
      return c.json({ error: { code: "INVALID_INPUT", message: "token local requis" } }, 401);
    }
    return next();
  });

  // Défense en profondeur (spec §3.7) : si un header Origin est présent, il
  // doit être celui du webview Tauri ou d'un serveur de dev local.
  const LOCAL_ORIGIN =
    /^(tauri:\/\/localhost|https:\/\/tauri\.localhost|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;
  app.use("/api/*", async (c, next) => {
    const origin = c.req.header("Origin");
    if (origin && !LOCAL_ORIGIN.test(origin)) {
      return c.json({ error: { code: "INVALID_INPUT", message: "origine non autorisée" } }, 403);
    }
    return next();
  });

  app.get("/api/health", (c) =>
    c.json({ status: "ok", mcp: deps.state(), pending: undefined }),
  );

  app.post("/api/mcp/restart", async (c) => {
    await deps.restart();
    return c.json({ status: "restarted", mcp: deps.state() });
  });

  app.route("/api/raindrops", raindropsRoutes(deps));
  app.route("/api/collections", collectionsRoutes(deps));
  app.route("/api/tags", tagsRoutes(deps));
  app.route("/api/highlights", highlightsRoutes(deps));
  app.route("/api/user", userRoutes(deps));
  app.route("/api/maintenance", maintenanceRoutes(deps));
  app.route("/api/analysis", analysisRoutes(deps));
  app.route("/api/jobs", jobsRoutes(deps));

  return app;
}
```

> Les fichiers `routes/*.ts` n'existent pas encore : créer chacun comme **stub vide** au fil des Tasks 8–10 — pour cette task, créer des stubs `import { Hono } from "hono"` + `export const xRoutes = (deps: SidecarDeps) => new Hono()` afin que `typecheck` passe, à remplacer par les vraies routes dans les tasks suivantes.

- [ ] **Step 4: Vérifier**

Run: `npm test -- sidecar/api/app.test.ts && npm run typecheck`
Expected: PASS, typecheck OK (avec stubs).

- [ ] **Step 5: Commit**

```bash
git add sidecar/api/app.ts sidecar/api/deps.ts sidecar/api/app.test.ts sidecar/api/routes
git commit -m "feat(sidecar): squelette Hono — Bearer, erreurs uniformes, /api/health, restart"
```

---

### Task 8 : Routes raindrops + mapper DTO + REST direct (correction d'URL)

**Files:**
- Create: `sidecar/api/mappers.ts`, `sidecar/api/routes/raindrops.ts` (remplace le stub), `sidecar/direct/raindropRest.ts`
- Modify: `sidecar/api/deps.ts` (ajout du champ `direct`)
- Test: `sidecar/api/routes/raindrops.test.ts`, `sidecar/direct/raindropRest.test.ts`

**Interfaces:**
- Consumes : `deps.mcp` (Task 7), fake MCP (Task 3).
- Produces :
  - `toRaindropItem(raw): RaindropItem` — conversion du format brut Raindrop (`link`, `collection: {$id}`, `last_update`, `cover: [{src}]`) vers le DTO partagé.
  - `deps.direct.updateRaindropUrl(id: number, url: string): Promise<CallOutcome<{ id: number }>>` — abstraction de secours §3.3 (car `update_raindrop` MCP n'expose pas `url`).
  - Endpoints : `GET /api/raindrops`, `GET /api/raindrops/:id`, `POST /api/raindrops` (201), `PATCH /api/raindrops/:id`, `DELETE /api/raindrops/:id`, `POST /api/raindrops/bulk`.
- **Interface cible finale de `SidecarDeps`** (complétée task par task) :

```ts
export interface SidecarDeps {
  mcp: (tool: string, args: Record<string, unknown>, timeoutMs?: number) => Promise<CallOutcome<unknown>>;
  state: () => import("../mcp/lifecycle.js").LifecycleState;
  restart: () => Promise<void>;
  jobs: JobStore;            // Task 10
  cache: AnalysisCache;      // Task 13
  scanner: { startScan(type: AnalysisType): string; isRunning(type: AnalysisType): boolean }; // Task 14
  direct: { updateRaindropUrl(id: number, url: string): Promise<CallOutcome<{ id: number }>> }; // Task 8
}
```

- [ ] **Step 1: Écrire mappers.ts**

`sidecar/api/mappers.ts` :

```ts
import type { RaindropItem } from "../../shared/types.js";
import type { Collection } from "../../shared/types.js";

export interface RawRaindrop {
  id: number;
  link: string;
  title?: string;
  excerpt?: string;
  note?: string;
  tags?: string[];
  created: string;
  last_update: string;
  important?: boolean;
  type?: string;
  domain?: string;
  cover?: { src: string }[];
  collection?: { $id: number };
}

export interface RawCollection {
  id: number;
  title: string;
  parent?: { $id: number };
  count: number;
  public?: boolean;
  view?: string;
}

export function toRaindropItem(raw: RawRaindrop): RaindropItem {
  return {
    id: raw.id,
    url: raw.link,
    title: raw.title ?? raw.link,
    excerpt: raw.excerpt ?? "",
    note: raw.note ?? "",
    domain: raw.domain ?? safeHost(raw.link),
    tags: raw.tags ?? [],
    created: raw.created,
    lastUpdate: raw.last_update,
    important: raw.important ?? false,
    type: raw.type ?? "link",
    cover: raw.cover?.[0]?.src ?? null,
    collectionId: raw.collection?.$id ?? -1,
  };
}

export function toCollection(raw: RawCollection): Collection {
  return {
    id: raw.id,
    title: raw.title,
    parentId: raw.parent?.$id ?? null,
    count: raw.count ?? 0,
    public: raw.public ?? false,
    view: raw.view ?? "list",
  };
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
```

- [ ] **Step 2: Écrire le REST direct d'abord (TDD)**

`sidecar/direct/raindropRest.test.ts` :

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { makeRestClient } from "./raindropRest.js";

afterEach(() => vi.unstubAllGlobals());

describe("raindropRest (abstraction de secours)", () => {
  it("PUT {url} sur /raindrop/:id avec Bearer", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ item: { id: 7, link: "https://nvelle.example" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = makeRestClient({ token: "rd-token" });
    const out = await client.updateRaindropUrl(7, "https://nvelle.example");
    expect(out).toEqual({ ok: true, data: { id: 7 } });
    const [calledUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toBe("https://api.raindrop.io/rest/v1/raindrop/7");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ url: "https://nvelle.example" });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer rd-token");
  });

  it("classe un 4xx/5xx en RAINDROP_API avec le code HTTP", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    const out = await makeRestClient({ token: "t" }).updateRaindropUrl(1, "https://x.example");
    expect(out).toMatchObject({ ok: false, code: "RAINDROP_API" });
    expect((out as { message: string }).message).toContain("429");
  });

  it("classe une erreur réseau en RAINDROP_API", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("boom"); }));
    const out = await makeRestClient({ token: "t" }).updateRaindropUrl(1, "https://x.example");
    expect(out).toMatchObject({ ok: false, code: "RAINDROP_API" });
  });
});
```

`sidecar/direct/raindropRest.ts` :

```ts
import type { CallOutcome } from "../../shared/errors.js";

const API_BASE = "https://api.raindrop.io/rest/v1";

export interface RaindropRestClient {
  updateRaindropUrl(id: number, url: string): Promise<CallOutcome<{ id: number }>>;
}

export function makeRestClient(
  opts: { token: string; baseUrl?: string; timeoutMs?: number; fetchImpl?: typeof fetch },
): RaindropRestClient {
  const base = opts.baseUrl ?? API_BASE;
  const f = opts.fetchImpl ?? fetch;
  return {
    async updateRaindropUrl(id, url) {
      try {
        const res = await f(`${base}/raindrop/${id}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${opts.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
        });
        if (!res.ok) {
          return { ok: false, code: "RAINDROP_API", message: `raindrop api http ${res.status}` };
        }
        return { ok: true, data: { id } };
      } catch (e) {
        return { ok: false, code: "RAINDROP_API", message: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
```

- [ ] **Step 3: Vérifier le REST direct**

Run: `npm test -- sidecar/direct/raindropRest.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 4: Écrire le test des routes**

`sidecar/api/routes/raindrops.test.ts` :

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Hono } from "hono";
import { createApp, type SidecarDeps } from "../app.js";
import { connectFake } from "../../testing/fakeServer.js";
import { McpConnection } from "../../mcp/connection.js";
import type { Paginated, RaindropItem } from "../../../../shared/types.js";

let conn: McpConnection;
let app: Hono;

beforeEach(async () => {
  const fake = await connectFake({ raindropCount: 30 });
  conn = McpConnection.fromClient(fake.client);
  const deps: SidecarDeps = {
    mcp: (tool, args, timeoutMs) => conn.call(tool, args, timeoutMs),
    state: () => "connected",
    restart: async () => undefined,
    jobs: { get: () => undefined, list: () => [] } as unknown as SidecarDeps["jobs"],
    cache: {} as SidecarDeps["cache"],
    scanner: { startScan: () => "", isRunning: () => false },
    direct: {
      updateRaindropUrl: vi.fn(async () => ({ ok: true, data: { id: 1 } })),
    },
  };
  app = createApp(deps, { localToken: "test-token" });
});
afterEach(async () => conn.close());

describe("routes raindrops", () => {
  it("GET / normalise les items vers le DTO partagé", async () => {
    const res = await app.request("/api/raindrops?per_page=10&collection_id=0");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Paginated<RaindropItem>;
    expect(body.count).toBe(30);
    expect(body.items).toHaveLength(10);
    expect(body.items[0]).toMatchObject({ url: expect.stringContaining("https://"), collectionId: expect.any(Number), tags: expect.any(Array) });
    expect(body.items[0]!.id).toBeDefined();
  });

  it("GET /:id renvoie un DTO", async () => {
    const list = (await (await app.request("/api/raindrops?per_page=1")).json()) as Paginated<RaindropItem>;
    const res = await app.request(`/api/raindrops/${list.items[0]!.id}`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as RaindropItem).url).toBeTruthy();
  });

  it("POST / crée (201) puis l'item apparaît dans la liste", async () => {
    const res = await app.request("/api/raindrops", {
      method: "POST",
      body: JSON.stringify({ link: "https://nouveau.example/page", collection_id: 101 }),
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as RaindropItem;
    expect(created.url).toBe("https://nouveau.example/page");
    expect(created.collectionId).toBe(101);
  });

  it("POST / rejette un lien invalide (400 INVALID_INPUT)", async () => {
    const res = await app.request("/api/raindrops", { method: "POST", body: JSON.stringify({ link: "pas-une-url" }) });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("INVALID_INPUT");
  });

  it("PATCH /:id sans url passe par update_raindrop", async () => {
    const list = (await (await app.request("/api/raindrops?per_page=1")).json()) as Paginated<RaindropItem>;
    const res = await app.request(`/api/raindrops/${list.items[0]!.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Nouveau titre" }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as RaindropItem).title).toBe("Nouveau titre");
  });

  it("PATCH /:id avec url bascule sur le REST direct", async () => {
    const list = (await (await app.request("/api/raindrops?per_page=1")).json()) as Paginated<RaindropItem>;
    const res = await app.request(`/api/raindrops/${list.items[0]!.id}`, {
      method: "PATCH",
      body: JSON.stringify({ url: "https://corrige.example/final" }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { urlUpdated: boolean }).urlUpdated).toBe(true);
  });

  it("PATCH /:id refuse url combiné à d'autres champs (400)", async () => {
    const res = await app.request("/api/raindrops/1000", {
      method: "PATCH",
      body: JSON.stringify({ url: "https://x.example", title: "Aussi" }),
    });
    expect(res.status).toBe(400);
  });

  it("DELETE /:id renvoie deleted:true (→ corbeille)", async () => {
    const list = (await (await app.request("/api/raindrops?per_page=1")).json()) as Paginated<RaindropItem>;
    const res = await app.request(`/api/raindrops/${list.items[0]!.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect((await res.json()) as { deleted: boolean }).toEqual({ deleted: true });
  });

  it("POST /bulk delete exige ids (400)", async () => {
    const res = await app.request("/api/raindrops/bulk", {
      method: "POST",
      body: JSON.stringify({ operation: "delete", collection_id: 0 }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /bulk move envoie les bons args au tool", async () => {
    const spy: unknown[] = [];
    const connSpy = {
      call: async (tool: string, args: Record<string, unknown>) => {
        spy.push([tool, args]);
        return conn.call(tool, args);
      },
    };
    const deps = {
      mcp: (tool: string, args: Record<string, unknown>) => connSpy.call(tool, args),
      state: () => "connected" as const,
      restart: async () => undefined,
      jobs: { get: () => undefined, list: () => [] } as unknown as SidecarDeps["jobs"],
      cache: {} as SidecarDeps["cache"],
      scanner: { startScan: () => "", isRunning: () => false },
      direct: { updateRaindropUrl: async () => ({ ok: true as const, data: { id: 1 } }) },
    };
    const app2 = createApp(deps as SidecarDeps, { localToken: "t" });
    const res = await app2.request("/api/raindrops/bulk", {
      method: "POST",
      body: JSON.stringify({ operation: "move", collection_id: 0, ids: [1000, 1001], to_collection_id: 101 }),
    });
    expect(res.status).toBe(200);
    expect(spy[0]).toEqual(["bulk_raindrops", { operation: "move", collection_id: 0, ids: [1000, 1001], to_collection_id: 101 }]);
  });
});
```

- [ ] **Step 5: Exécuter et constater l'échec**

Run: `npm test -- sidecar/api/routes/raindrops.test.ts`
Expected: FAIL — routes absentes (404).

- [ ] **Step 6: Implémenter routes/raindrops.ts**

`sidecar/api/routes/raindrops.ts` :

```ts
import { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../../shared/errors.js";
import type { SidecarDeps } from "../deps.js";
import { toRaindropItem } from "../mappers.js";
import type { RawRaindrop } from "../mappers.js";

const searchQuery = z.object({
  collection_id: z.coerce.number().int().default(0),
  search: z.string().optional(),
  sort: z.enum(["score", "-created", "created", "-title", "title", "-domain", "domain"]).optional(),
  page: z.coerce.number().int().min(0).default(0),
  per_page: z.coerce.number().int().min(1).max(50).default(50),
  important: z.coerce.boolean().optional(),
  notag: z.coerce.boolean().optional(),
  domain: z.string().optional(),
  media: z.enum(["link", "article", "image", "video", "document", "audio"]).optional(),
  created_start: z.string().optional(),
  created_end: z.string().optional(),
});

const createBody = z.object({
  link: z.string().url(),
  title: z.string().optional(),
  excerpt: z.string().optional(),
  note: z.string().optional(),
  tags: z.array(z.string()).optional(),
  important: z.boolean().optional(),
  collection_id: z.number().int().optional(),
});

const patchBody = z
  .object({
    url: z.string().url().optional(),
    title: z.string().optional(),
    excerpt: z.string().optional(),
    note: z.string().optional(),
    tags: z.array(z.string()).optional(),
    important: z.boolean().optional(),
    collection_id: z.number().int().optional(),
  })
  .refine((b) => !(b.url != null && Object.keys(b).length > 1), {
    message: "envoyez url seul ; les autres champs via une seconde requête",
  });

const bulkBody = z
  .object({
    operation: z.enum(["update", "move", "delete"]),
    collection_id: z.number().int(),
    ids: z.array(z.number().int()).min(1).optional(),
    to_collection_id: z.number().int().optional(),
    tags: z.array(z.string()).optional(),
    important: z.boolean().optional(),
  })
  .refine((b) => b.operation !== "move" || (b.to_collection_id != null && b.ids != null), {
    message: "move exige ids et to_collection_id",
  })
  .refine((b) => b.operation !== "delete" || b.ids != null, {
    message: "delete exige ids",
  })
  .refine((b) => b.operation !== "update" || (b.tags != null || b.important != null), {
    message: "update exige tags ou important",
  });

export function raindropsRoutes(deps: SidecarDeps): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    const q = searchQuery.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
    if (!q.success) return apiError(c, "INVALID_INPUT", z.prettifyError(q.error));
    const out = await deps.mcp("search_raindrops", q.data);
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    const raw = out.data as { count: number; items: RawRaindrop[] };
    return c.json({
      items: raw.items.map(toRaindropItem),
      count: raw.count,
      page: q.data.page,
      perPage: q.data.per_page,
    });
  });

  app.get("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return apiError(c, "INVALID_INPUT", "id invalide");
    const out = await deps.mcp("get_raindrop", { id });
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(toRaindropItem(out.data as RawRaindrop));
  });

  app.post("/", async (c) => {
    const body = createBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", z.prettifyError(body.error));
    const out = await deps.mcp("create_raindrop", body.data);
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(toRaindropItem(out.data as RawRaindrop), 201);
  });

  app.patch("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const body = patchBody.safeParse(await c.req.json().catch(() => null));
    if (!Number.isInteger(id)) return apiError(c, "INVALID_INPUT", "id invalide");
    if (!body.success) return apiError(c, "INVALID_INPUT", z.prettifyError(body.error));
    if (body.data.url != null) {
      // update_raindrop n'expose pas url (v1.3.1) → REST direct (contrainte plan)
      const out = await deps.direct.updateRaindropUrl(id, body.data.url);
      if (!out.ok) return apiError(c, out.code, out.message);
      return c.json({ urlUpdated: true, id });
    }
    const { url: _ignored, ...rest } = body.data;
    const out = await deps.mcp("update_raindrop", { id, ...rest });
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(toRaindropItem(out.data as RawRaindrop));
  });

  app.delete("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return apiError(c, "INVALID_INPUT", "id invalide");
    const out = await deps.mcp("delete_raindrop", { id });
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json({ deleted: true });
  });

  app.post("/bulk", async (c) => {
    const body = bulkBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", z.prettifyError(body.error));
    const out = await deps.mcp("bulk_raindrops", body.data);
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(out.data);
  });

  return app;
}
```

- [ ] **Step 7: Brancher deps.direct dans deps.ts (final) et vérifier**

Compléter `SidecarDeps` avec le champ `direct` (interface cible ci-dessus) ; les tests fournissent l'impl. Run: `npm test -- sidecar/api/routes/raindrops.test.ts && npm run typecheck`
Expected: PASS (10 tests), typecheck OK.

- [ ] **Step 8: Commit**

```bash
git add sidecar/api/mappers.ts sidecar/api/routes/raindrops.ts sidecar/api/routes/raindrops.test.ts sidecar/direct sidecar/api/deps.ts
git commit -m "feat(sidecar): routes raindrops + DTO normalisés + REST direct pour la correction d'URL"
```

---

### Task 9 : Routes collections, tags, highlights, user, maintenance

**Files:**
- Create: `sidecar/api/routes/collections.ts`, `sidecar/api/routes/tags.ts`, `sidecar/api/routes/highlights.ts`, `sidecar/api/routes/user.ts`, `sidecar/api/routes/maintenance.ts` (remplacent les stubs)
- Test: `sidecar/api/routes/collections.test.ts`, `sidecar/api/routes/misc.test.ts`

**Interfaces:**
- Consumes : `deps.mcp`, `toCollection`.
- Produces :
  - `GET /api/collections` → `{ items: Collection[] }` (root + children fusionnés, arbre reconstruisable via `parentId`) ; `GET /api/collections/:id` ; `POST /api/collections` (201) ; `PATCH /api/collections/:id` ; `DELETE /api/collections/:id` ; `POST /api/collections/cleanup {confirm}`.
  - `GET /api/tags?collection_id` → `{ items: Tag[] }` ; `POST /api/tags/manage {operation, tags, new_name?, collection_id?}`.
  - `GET /api/highlights/:raindropId` → `{ items: Highlight[] }` (Phase 1 : lecture seule côté front ; POST/PATCH/DELETE via `POST /api/highlights/manage` mappé sur `manage_highlight`).
  - `GET /api/user` ; `POST /api/parse-url {url}` ; `POST /api/check-urls {urls}`.
  - `POST /api/maintenance/empty-trash {confirm}` → `empty_trash` (niveau 2 UI).

- [ ] **Step 1: Écrire les tests d'abord**

`sidecar/api/routes/collections.test.ts` :

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Hono } from "hono";
import { createApp, type SidecarDeps } from "../app.js";
import { connectFake } from "../../testing/fakeServer.js";
import { McpConnection } from "../../mcp/connection.js";
import type { Collection } from "../../../../shared/types.js";

let conn: McpConnection;
let app: Hono;
const deps = (c: McpConnection): SidecarDeps => ({
  mcp: (tool, args, t) => c.call(tool, args, t),
  state: () => "connected",
  restart: async () => undefined,
  jobs: { get: () => undefined, list: () => [] } as unknown as SidecarDeps["jobs"],
  cache: {} as SidecarDeps["cache"],
  scanner: { startScan: () => "", isRunning: () => false },
  direct: { updateRaindropUrl: async () => ({ ok: true as const, data: { id: 1 } }) },
});

beforeEach(async () => {
  const fake = await connectFake({ raindropCount: 12 });
  conn = McpConnection.fromClient(fake.client);
  app = createApp(deps(conn), { localToken: "test-token" });
});
afterEach(async () => conn.close());

describe("routes collections", () => {
  it("GET / fusionne root et children", async () => {
    const res = await app.request("/api/collections");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Collection[] };
    const ids = body.items.map((c) => c.id);
    expect(ids).toContain(101);
    expect(ids).toContain(201);
    const child = body.items.find((c) => c.id === 201)!;
    expect(child.parentId).toBe(101);
  });

  it("POST / crée une collection imbriquée (201)", async () => {
    const res = await app.request("/api/collections", {
      method: "POST",
      body: JSON.stringify({ title: "Nouvelle", parent_id: 101 }),
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as Collection).parentId).toBe(101);
  });

  it("POST /cleanup passe le confirm au tool", async () => {
    const res = await app.request("/api/collections/cleanup", {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    });
    expect(res.status).toBe(200);
  });
});
```

`sidecar/api/routes/misc.test.ts` :

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Hono } from "hono";
import { createApp, type SidecarDeps } from "../app.js";
import { connectFake } from "../../testing/fakeServer.js";
import { McpConnection } from "../../mcp/connection.js";

let conn: McpConnection;
let app: Hono;
const deps = (c: McpConnection): SidecarDeps => ({
  mcp: (tool, args, t) => c.call(tool, args, t),
  state: () => "connected",
  restart: async () => undefined,
  jobs: { get: () => undefined, list: () => [] } as unknown as SidecarDeps["jobs"],
  cache: {} as SidecarDeps["cache"],
  scanner: { startScan: () => "", isRunning: () => false },
  direct: { updateRaindropUrl: async () => ({ ok: true as const, data: { id: 1 } }) },
});

beforeEach(async () => {
  const fake = await connectFake({ raindropCount: 9 });
  conn = McpConnection.fromClient(fake.client);
  app = createApp(deps(conn), { localToken: "test-token" });
});
afterEach(async () => conn.close());

describe("routes tags", () => {
  it("GET / renvoie les tags avec compteurs", async () => {
    const res = await app.request("/api/tags");
    const body = (await res.json()) as { items: { name: string; count: number }[] };
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0]).toMatchObject({ name: expect.any(String), count: expect.any(Number) });
  });

  it("POST /manage rename exige new_name (400 sinon)", async () => {
    const res = await app.request("/api/tags/manage", {
      method: "POST",
      body: JSON.stringify({ operation: "rename", tags: ["rust"] }),
    });
    expect(res.status).toBe(400);
  });
});

describe("routes user", () => {
  it("GET /api/user renvoie le compte", async () => {
    const res = await app.request("/api/user");
    expect(((await res.json()) as { email: string }).email).toBe("moi@example.com");
  });

  it("POST /api/parse-url préremplit un titre", async () => {
    const res = await app.request("/api/parse-url", {
      method: "POST",
      body: JSON.stringify({ url: "https://example.com/a" }),
    });
    expect(((await res.json()) as { title: string }).title).toContain("example.com");
  });

  it("POST /api/check-urls détecte les existants", async () => {
    const list = (await (await app.request("/api/raindrops?per_page=1")).json()) as { items: { url: string }[] };
    const res = await app.request("/api/check-urls", {
      method: "POST",
      body: JSON.stringify({ urls: [list.items[0]!.url, "https://absent.example"] }),
    });
    const body = (await res.json()) as { items: { url: string; exists: boolean }[] };
    expect(body.items[0]!.exists).toBe(true);
    expect(body.items[1]!.exists).toBe(false);
  });
});

describe("routes maintenance", () => {
  it("POST /api/maintenance/empty-trash exige confirm (400)", async () => {
    const res = await app.request("/api/maintenance/empty-trash", { method: "POST", body: "{}" });
    expect(res.status).toBe(400);
  });

  it("POST /api/maintenance/empty-trash avec confirm exécute", async () => {
    const res = await app.request("/api/maintenance/empty-trash", {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    });
    expect(res.status).toBe(200);
  });
});

describe("routes highlights", () => {
  it("GET /api/highlights/:id renvoie une liste (vide au fake)", async () => {
    const res = await app.request("/api/highlights/1000");
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Exécuter et constater l'échec**

Run: `npm test -- sidecar/api/routes/collections.test.ts sidecar/api/routes/misc.test.ts`
Expected: FAIL — 404 sur toutes les routes.

- [ ] **Step 3: Implémenter les cinq fichiers de routes**

`sidecar/api/routes/collections.ts` :

```ts
import { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../../shared/errors.js";
import type { SidecarDeps } from "../deps.js";
import { toCollection } from "../mappers.js";
import type { RawCollection } from "../mappers.js";

const createBody = z.object({
  title: z.string().min(1),
  public: z.boolean().optional(),
  parent_id: z.number().int().optional(),
  view: z.enum(["list", "simple", "grid", "masonry"]).optional(),
});
const updateBody = createBody.partial().extend({ id: z.number().int() }).partial().omit({ id: true });

export function collectionsRoutes(deps: SidecarDeps): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    const [root, children] = await Promise.all([
      deps.mcp("get_collections", {}),
      deps.mcp("get_child_collections", {}),
    ]);
    if (!root.ok) return apiError(c, root.code, root.message, root.tool);
    if (!children.ok) return apiError(c, children.code, children.message, children.tool);
    const items = [
      ...(root.data as { items: RawCollection[] }).items,
      ...(children.data as { items: RawCollection[] }).items,
    ].map(toCollection);
    return c.json({ items });
  });

  app.get("/:id", async (c) => {
    const out = await deps.mcp("get_collection", { id: Number(c.req.param("id")) });
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(toCollection(out.data as RawCollection));
  });

  app.post("/", async (c) => {
    const body = createBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", z.prettifyError(body.error));
    const out = await deps.mcp("create_collection", body.data);
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(toCollection(out.data as RawCollection), 201);
  });

  app.patch("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const body = updateBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", z.prettifyError(body.error));
    const out = await deps.mcp("update_collection", { id, ...body.data });
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(toCollection(out.data as RawCollection));
  });

  app.delete("/:id", async (c) => {
    const out = await deps.mcp("delete_collection", { id: Number(c.req.param("id")) });
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json({ deleted: true });
  });

  // cleanup_collections : mapping du confirm MCP sur la gravité niveau 2 (spec §4.2)
  app.post("/cleanup", async (c) => {
    const body = z.object({ confirm: z.boolean() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", "confirm: boolean requis");
    const out = await deps.mcp("cleanup_collections", { confirm: body.data.confirm });
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(out.data);
  });

  return app;
}
```

`sidecar/api/routes/tags.ts` :

```ts
import { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../../shared/errors.js";
import type { SidecarDeps } from "../deps.js";

const manageBody = z.object({
  operation: z.enum(["rename", "merge", "delete"]),
  tags: z.array(z.string()).min(1),
  new_name: z.string().min(1).optional(),
  collection_id: z.number().int().optional(),
}).refine((b) => b.operation === "delete" || b.new_name != null, {
  message: "new_name requis pour rename/merge",
});

export function tagsRoutes(deps: SidecarDeps): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    const collectionId = c.req.query("collection_id");
    const args = collectionId ? { collection_id: Number(collectionId) } : {};
    const out = await deps.mcp("get_tags", args);
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    // format brut Raindrop {_id, count} → DTO Tag {name, count}
    const raw = out.data as { items: { _id: string; count: number }[] };
    return c.json({ items: raw.items.map((t) => ({ name: t._id, count: t.count })) });
  });

  app.post("/manage", async (c) => {
    const body = manageBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", z.prettifyError(body.error));
    const out = await deps.mcp("manage_tags", body.data);
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(out.data);
  });

  return app;
}
```

`sidecar/api/routes/highlights.ts` :

```ts
import { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../../shared/errors.js";
import type { SidecarDeps } from "../deps.js";

export function highlightsRoutes(deps: SidecarDeps): Hono {
  const app = new Hono();

  // Lecture seule en Phase 1 côté front ; l'écriture reste exposée (tool présent)
  app.get("/:raindropId", async (c) => {
    const out = await deps.mcp("get_highlights", { raindrop_id: Number(c.req.param("raindropId")) });
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(out.data);
  });

  app.post("/manage", async (c) => {
    const body = z.object({
      operation: z.enum(["create", "update", "delete"]),
      raindrop_id: z.number().int().optional(),
      highlight_id: z.number().int().optional(),
      text: z.string().optional(),
      note: z.string().optional(),
      color: z.string().optional(),
    }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", z.prettifyError(body.error));
    const out = await deps.mcp("manage_highlight", body.data);
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(out.data);
  });

  return app;
}
```

`sidecar/api/routes/user.ts` (monté à la racine `/` dans `app.ts`) :

```ts
import { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../../shared/errors.js";
import type { SidecarDeps } from "../deps.js";

export function userRoutes(deps: SidecarDeps): Hono {
  const app = new Hono();

  app.get("/api/user", async (c) => {
    const out = await deps.mcp("get_user", {});
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    const u = out.data as { id: number; email: string; full_name?: string; fullName?: string; pro?: boolean; bookmarks_count?: number };
    return c.json({
      id: u.id,
      email: u.email,
      fullName: u.fullName ?? u.full_name ?? u.email,
      pro: u.pro ?? false,
      bookmarksCount: u.bookmarks_count ?? 0,
    });
  });

  app.post("/api/parse-url", async (c) => {
    const body = z.object({ url: z.string().url() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", "url valide requise");
    const out = await deps.mcp("parse_url", body.data);
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(out.data);
  });

  app.post("/api/check-urls", async (c) => {
    const body = z.object({ urls: z.array(z.string().url()).min(1) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", "urls[] requises");
    const out = await deps.mcp("check_urls_exist", body.data);
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(out.data);
  });

  return app;
}
```

`sidecar/api/routes/maintenance.ts` :

```ts
import { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../../shared/errors.js";
import type { SidecarDeps } from "../deps.js";

export function maintenanceRoutes(deps: SidecarDeps): Hono {
  const app = new Hono();

  app.post("/empty-trash", async (c) => {
    const body = z.object({ confirm: z.literal(true) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", "confirm:true requis");
    const out = await deps.mcp("empty_trash", { confirm: true });
    if (!out.ok) return apiError(c, out.code, out.message, out.tool);
    return c.json(out.data);
  });

  return app;
}
```

Ajuster `app.ts` : `app.route("/", userRoutes(deps))` (au lieu de `/api/user`).

- [ ] **Step 4: Vérifier**

Run: `npm test -- sidecar/api/routes/collections.test.ts sidecar/api/routes/misc.test.ts && npm run typecheck`
Expected: PASS, typecheck OK.

- [ ] **Step 5: Commit**

```bash
git add sidecar/api/routes sidecar/api/app.ts
git commit -m "feat(sidecar): routes collections/tags/highlights/user/maintenance"
```

---

### Task 10 : Job store + SSE (progression, annulation)

**Files:**
- Create: `sidecar/jobs/store.ts`, `sidecar/api/sse.ts`, `sidecar/api/routes/jobs.ts` (remplace le stub)
- Test: `sidecar/jobs/store.test.ts`, `sidecar/api/routes/jobs.test.ts`

**Interfaces:**
- Consumes : `SidecarDeps.jobs`.
- Produces :
  - `class JobStore { create(type: string, total: number): JobHandle ; get(id): JobSnapshot | undefined ; list(): JobSnapshot[] }` — garde les 50 derniers jobs.
  - `interface JobHandle { readonly id: string ; progress(done, total, label?): void ; isCancelled(): boolean ; cancel(): void ; finish(result?: unknown): void ; fail(message: string): void ; snapshot(): JobSnapshot ; subscribe(cb: (evt: JobEvent) => void): () => void }`.
  - `type JobEvent = { kind: "progress" | "done" | "error" | "cancelled"; ... }`.
  - `runJob(store, type, total, fn: (job: JobHandle) => Promise<unknown>): JobHandle` — lance le job async ; catch → `fail` ; succès → `finish`.
  - Routes : `GET /api/jobs/:id`, `GET /api/jobs/:id/events` (SSE : `progress`/`done`/`error`/`cancelled` + heartbeat 15 s), `POST /api/jobs/:id/cancel`.

- [ ] **Step 1: Écrire le test du store d'abord**

`sidecar/jobs/store.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { JobStore, runJob } from "./store.js";

describe("JobStore", () => {
  it("crée, met à jour la progression, termine", async () => {
    const store = new JobStore();
    const job = runJob(store, "scan-links", 10, async (j) => {
      j.progress(5, 10, "mi-chemin");
      return { checked: 10 };
    });
    const snap = await new Promise<ReturnType<typeof job.snapshot>>((resolve) => {
      const unsub = job.subscribe((evt) => {
        if (evt.kind === "done") resolve(job.snapshot());
      });
      void unsub;
    });
    expect(snap.status).toBe("done");
    expect(snap.progress).toMatchObject({ done: 5, total: 10, label: "mi-chemin" });
    expect(store.get(job.id)?.status).toBe("done");
  });

  it("un échec de la fonction passe le job en error avec le message", async () => {
    const store = new JobStore();
    const job = runJob(store, "x", 1, async () => { throw new Error("réseau coupé"); });
    await new Promise((r) => job.subscribe((evt) => evt.kind === "error" && r(null)));
    const snap = store.get(job.id)!;
    expect(snap.status).toBe("error");
    expect(snap.error).toContain("réseau coupé");
  });

  it("cancel() est visible depuis isCancelled() et passe le statut", async () => {
    const store = new JobStore();
    const job = store.create("x", 100);
    let sawCancel = false;
    const work = (async () => {
      while (!job.isCancelled()) await new Promise((r) => setTimeout(r, 5));
      sawCancel = true;
      job.finish();
    })();
    setTimeout(() => job.cancel(), 20);
    await work;
    expect(sawCancel).toBe(true);
    expect(store.get(job.id)!.status).toBe("cancelled");
  });

  it("liste limitée aux 50 derniers jobs", () => {
    const store = new JobStore();
    for (let i = 0; i < 60; i++) store.create("x", 1).finish();
    expect(store.list().length).toBe(50);
  });
});
```

- [ ] **Step 2: Exécuter et constater l'échec, puis implémenter**

Run: `npm test -- sidecar/jobs/store.test.ts` → FAIL (module absent).

`sidecar/jobs/store.ts` :

```ts
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { JobProgress, JobSnapshot, JobStatus } from "../../shared/types.js";

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
      snapshot: () => ({ ...state, progress: { ...state.progress } }),
      subscribe: (cb) => {
        emitter.on("event", cb);
        return () => emitter.off("event", cb);
      },
    };
    this.handles.set(id, handle);
    return handle;
  }

  get(id: string): JobSnapshot | undefined {
    return this.jobs.get(id)?.state ? { ...this.jobs.get(id)!.state, progress: { ...this.jobs.get(id)!.state.progress } } : undefined;
  }

  getHandle(id: string): JobHandle | undefined {
    return this.handles.get(id);
  }

  getResult(id: string): unknown {
    return this.jobs.get(id)?.result;
  }

  list(): JobSnapshot[] {
    return [...this.jobs.values()].map((j) => j.snapshot());
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
} & { snapshot(): JobSnapshot };

/** Lance fn en arrière-plan : succès → finish, exception → fail. */
export function runJob(
  store: JobStore,
  type: string,
  total: number,
  fn: (job: JobHandle) => Promise<unknown>,
): JobHandle {
  const job = store.create(type, total);
  void fn(job).then(
    (result) => job.finish(result),
    (e) => job.fail(e instanceof Error ? e.message : String(e)),
  );
  return job;
}
```

> Retirer du type `JobStatus` l'import inutilisé si le linter le signale ; `snapshot()` interne : stocker la fonction sur l'objet `job` (comme ci-dessus) ou factoriser `toSnapshot(state)` — choisir la factorisation si plus propre.

- [ ] **Step 3: Écrire le test SSE des routes**

`sidecar/api/routes/jobs.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { createApp, type SidecarDeps } from "../app.js";
import { JobStore } from "../../jobs/store.js";

const deps = (jobs: JobStore): SidecarDeps => ({
  mcp: async () => ({ ok: true as const, data: {} }),
  state: () => "connected",
  restart: async () => undefined,
  jobs,
  cache: {} as SidecarDeps["cache"],
  scanner: { startScan: () => "", isRunning: () => false },
  direct: { updateRaindropUrl: async () => ({ ok: true as const, data: { id: 1 } }) },
});

describe("routes jobs", () => {
  it("GET /api/jobs/:id renvoie le snapshot", async () => {
    const store = new JobStore();
    const job = store.create("scan-links", 10);
    const app = createApp(deps(store), { localToken: "t" });
    const res = await app.request(`/api/jobs/${job.id}`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe("running");
  });

  it("GET /:id/events stream progress puis done en SSE", async () => {
    const store = new JobStore();
    const job = store.create("scan-links", 2);
    const app = createApp(deps(store), { localToken: "t" });
    const res = await app.request(`/api/jobs/${job.id}/events`);
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    job.progress(1, 2, "a");
    job.finish({ total: 2 });
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain("event: progress");
    expect(text).toContain("\"done\":1");
    await reader.cancel();
  });

  it("POST /:id/cancel annule", async () => {
    const store = new JobStore();
    const job = store.create("x", 10);
    const app = createApp(deps(store), { localToken: "t" });
    const res = await app.request(`/api/jobs/${job.id}/cancel`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(store.get(job.id)!.status).toBe("cancelled");
  });
});
```

- [ ] **Step 4: Implémenter sse.ts et routes/jobs.ts**

`sidecar/api/sse.ts` :

```ts
import { streamSSE } from "hono/streaming";
import type { JobHandle } from "../jobs/store.js";

/** Abonne la réponse SSE aux événements du job, avec heartbeat. */
export function jobSse(job: JobHandle, c: { req: { raw: Request } }): Response {
  let unsub: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  return streamSSE(c, async (stream) => {
    unsub = job.subscribe((evt) => {
      void stream.writeSSE({ event: evt.kind, data: JSON.stringify("result" in evt ? evt.result : evt) });
    });
    heartbeat = setInterval(() => {
      void stream.writeSSE({ event: "ping", data: String(Date.now()) });
    }, 15_000);
    // libérer à la déconnexion du client
    c.req.raw.signal.addEventListener("abort", () => {
      unsub?.();
      if (heartbeat) clearInterval(heartbeat);
    });
    // maintenir la stream ouverte tant que le job vit
    while (true) {
      await stream.sleep(1000);
      if (job.snapshot().status !== "running") break;
    }
    unsub?.();
    if (heartbeat) clearInterval(heartbeat);
  });
}
```

`sidecar/api/routes/jobs.ts` :

```ts
import { Hono } from "hono";
import { apiError } from "../../../shared/errors.js";
import type { SidecarDeps } from "../deps.js";
import { jobSse } from "../sse.js";

export function jobsRoutes(deps: SidecarDeps): Hono {
  const app = new Hono();

  app.get("/:id", (c) => {
    const snap = deps.jobs.get(c.req.param("id"));
    if (!snap) return apiError(c, "INVALID_INPUT", "job inconnu");
    return c.json(snap);
  });

  app.get("/:id/events", (c) => {
    const snap = deps.jobs.get(c.req.param("id"));
    if (!snap) return apiError(c, "INVALID_INPUT", "job inconnu");
    const job = deps.jobs.getHandle(c.req.param("id"));
    if (!job) return apiError(c, "INVALID_INPUT", "job inconnu");
    return jobSse(job, c);
  });

  app.post("/:id/cancel", (c) => {
    const job = deps.jobs.getHandle(c.req.param("id"));
    if (!job) return apiError(c, "INVALID_INPUT", "job inconnu");
    job.cancel();
    return c.json({ cancelled: true });
  });

  return app;
}
```

- [ ] **Step 5: Vérifier**

Run: `npm test -- sidecar/jobs/store.test.ts sidecar/api/routes/jobs.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add sidecar/jobs sidecar/api/sse.ts sidecar/api/routes/jobs.ts sidecar/api/routes/jobs.test.ts
git commit -m "feat(sidecar): jobs SSE — progression, annulation, heartbeat"
```

---

### Task 11 : Normalisation d'URL + détection de doublons (pur)

**Files:**
- Create: `sidecar/analysis/normalize.ts`, `sidecar/analysis/duplicates.ts`
- Test: `sidecar/analysis/normalize.test.ts`, `sidecar/analysis/duplicates.test.ts`

**Interfaces:**
- Produces :
  - `normalizeUrl(raw: string): string` — https unifié (sauf localhost/127.x), sans fragment ni slash final (sauf racine), paramètres de tracking retirés, paramètres restants triés. Inchange l'entrée si URL imparsable.
  - `findDuplicates(items: RaindropItem[]): { exact: DuplicateGroup[]; normalized: DuplicateGroup[]; fuzzy: DuplicateGroup[] }` — un item ne figure que dans la première catégorie qui le capte (exact, sinon normalisé, sinon fuzzy).

- [ ] **Step 1: Écrire les tests d'abord**

`sidecar/analysis/normalize.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { normalizeUrl, fuzzyKey } from "./normalize.js";

describe("normalizeUrl", () => {
  it("unifie http→https, retire slash final et fragment", () => {
    expect(normalizeUrl("http://Example.com/a/#section")).toBe("https://example.com/a");
  });

  it("retire les paramètres de tracking et trie le reste", () => {
    expect(normalizeUrl("https://example.com/p?b=2&utm_source=x&a=1&utm_campaign=y")).toBe(
      "https://example.com/p?a=1&b=2",
    );
  });

  it("retire fbclid/gclid et garde la racine telle quelle", () => {
    expect(normalizeUrl("https://example.com/?fbclid=abc")).toBe("https://example.com");
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com");
  });

  it("ne touche pas localhost et gère les URLs imparsables", () => {
    expect(normalizeUrl("http://localhost:5173/a")).toBe("http://localhost:5173/a");
    expect(normalizeUrl("   pas une url ")).toBe("pas une url");
  });

  it("deux URLs de doublons connus convergent", () => {
    expect(normalizeUrl("http://example.com/page-0")).toBe(normalizeUrl("https://example.com/page-0/"));
  });
});

describe("fuzzyKey", () => {
  it("identique à casse/accents/ponctuation près", () => {
    expect(fuzzyKey("Example.com", "Le Guide de l'API !")).toBe(fuzzyKey("example.com", "le guide de lapi"));
  });
});
```

`sidecar/analysis/duplicates.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { findDuplicates } from "./duplicates.js";
import type { RaindropItem } from "../../shared/types.js";

function item(id: number, url: string, title: string): RaindropItem {
  return {
    id, url, title, excerpt: "", note: "", domain: new URL(url).hostname,
    tags: [], created: "2025-01-01T00:00:00Z", lastUpdate: "2025-01-01T00:00:00Z",
    important: false, type: "link", cover: null, collectionId: 0,
  };
}

describe("findDuplicates", () => {
  const items = [
    item(1, "https://example.com/a", "Article"),
    item(2, "https://example.com/a", "Article (copie)"), // doublon exact
    item(3, "http://example.com/b/", "Deux"), // doublon normalisé avec 4
    item(4, "https://example.com/b?utm_source=x", "Deux bis"),
    item(5, "https://autre.org/x1", "Guide Rust"),
    item(6, "https://autre.org/x2", "guide rust !"), // doublon fuzzy avec 5
    item(7, "https://unique.net/only", "Unique"),
  ];

  it("détecte les groupes exacts, normalisés et fuzzy", () => {
    const d = findDuplicates(items);
    expect(d.exact.map((g) => g.items.map((i) => i.id).sort())).toEqual([[1, 2]]);
    expect(d.normalized.map((g) => g.items.map((i) => i.id).sort())).toEqual([[3, 4]]);
    expect(d.fuzzy.map((g) => g.items.map((i) => i.id).sort())).toEqual([[5, 6]]);
  });

  it("un item isolé n'apparaît nulle part", () => {
    const d = findDuplicates(items);
    const all = [...d.exact, ...d.normalized, ...d.fuzzy].flatMap((g) => g.items.map((i) => i.id));
    expect(all).not.toContain(7);
  });

  it("classe kind correctement", () => {
    const d = findDuplicates(items);
    expect(d.exact[0]!.kind).toBe("exact");
    expect(d.normalized[0]!.kind).toBe("normalized");
    expect(d.fuzzy[0]!.kind).toBe("fuzzy");
  });
});
```

- [ ] **Step 2: Exécuter et constater l'échec**

Run: `npm test -- sidecar/analysis/normalize.test.ts sidecar/analysis/duplicates.test.ts`
Expected: FAIL — modules absents.

- [ ] **Step 3: Implémenter normalize.ts et duplicates.ts**

`sidecar/analysis/normalize.ts` :

```ts
const TRACKING_PREFIX = /^utm_/i;
const TRACKING_EXACT = new Set(["fbclid", "gclid", "msclkid", "ref", "ref_src"]);

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return trimmed;
  }
  u.hash = "";
  const isLocal = u.hostname === "localhost" || /^127\./.test(u.hostname);
  if (u.protocol === "http:" && !isLocal) u.protocol = "https:";
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
  const kept = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING_PREFIX.test(k) && !TRACKING_EXACT.has(k.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b));
  const search = new URLSearchParams(kept).toString();
  const out = `${u.origin}${u.pathname}${search ? `?${search}` : ""}`;
  return out;
}

export function fuzzyKey(domain: string, title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return `${domain.toLowerCase()}|${slug}`;
}
```

`sidecar/analysis/duplicates.ts` :

```ts
import type { DuplicateGroup, RaindropItem } from "../../shared/types.js";
import { normalizeUrl, fuzzyKey } from "./normalize.js";

type ItemLite = DuplicateGroup["items"][number];

function groupsBy(items: RaindropItem[], key: (i: RaindropItem) => string, kind: DuplicateGroup["kind"]): DuplicateGroup[] {
  const map = new Map<string, ItemLite[]>();
  for (const i of items) {
    const k = key(i);
    const arr = map.get(k) ?? [];
    arr.push({ id: i.id, url: i.url, title: i.title, collectionId: i.collectionId, created: i.created });
    map.set(k, arr);
  }
  return [...map.entries()]
    .filter(([, arr]) => arr.length >= 2)
    .map(([k, arr]) => ({ key: k, kind, items: arr }));
}

export function findDuplicates(items: RaindropItem[]): {
  exact: DuplicateGroup[];
  normalized: DuplicateGroup[];
  fuzzy: DuplicateGroup[];
} {
  const exact = groupsBy(items, (i) => i.url.trim(), "exact");
  const exactIds = new Set(exact.flatMap((g) => g.items.map((i) => i.id)));
  const rest = items.filter((i) => !exactIds.has(i.id));
  const normalized = groupsBy(rest, (i) => normalizeUrl(i.url), "normalized");
  const normIds = new Set(normalized.flatMap((g) => g.items.map((i) => i.id)));
  const rest2 = rest.filter((i) => !normIds.has(i.id));
  const fuzzy = groupsBy(rest2, (i) => fuzzyKey(i.domain, i.title), "fuzzy");
  return { exact, normalized, fuzzy };
}
```

- [ ] **Step 4: Vérifier**

Run: `npm test -- sidecar/analysis/normalize.test.ts sidecar/analysis/duplicates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sidecar/analysis/normalize.ts sidecar/analysis/normalize.test.ts sidecar/analysis/duplicates.ts sidecar/analysis/duplicates.test.ts
git commit -m "feat(analysis): normalisation d'URL et détection de doublons exacts/normalisés/fuzzy"
```

---

### Task 12 : Link checker (classification, concurrence 6, timeout, retry)

**Files:**
- Create: `sidecar/analysis/linkchecker.ts`, `sidecar/testing/targetServer.ts`
- Test: `sidecar/analysis/linkchecker.test.ts`

**Interfaces:**
- Consumes : `LinkCheckResult`, `LinkStatus` (Task 2).
- Produces :
  - `checkUrl(url, opts?): Promise<Omit<LinkCheckResult, "raindropId" | "checkedAt">>` — HEAD, bascule GET sur 405/501, suit les redirections (max 5, `redirect: "manual"`), timeout 10 s, 1 retry réseau ; classification : `ok` / `redirect` (`redirectKind` permanent 301/308 | temporaire 302/307, `redirectChain`, `finalUrl`) / `dead` (`reason`: `dns`, `timeout`, `conn_refused`, `http_4xx`, `http_5xx`, `redirect_loop`) / `indeterminate` (`http_401`, `http_403`, `http_429`).
  - `checkAll(targets: {raindropId: number; url: string}[], opts & {concurrency: number; onUpdate(r: LinkCheckResult): void; isCancelled(): boolean}): Promise<{stats: {checked: number; maxConcurrency: number}}>` — pool maison, progression incrémentale via `onUpdate`, arrêt propre sur annulation (résultats partiels).
  - `startTargetServer(): Promise<{ port: number; close(): Promise<void> }>` — serveur de simulation.

- [ ] **Step 1: Écrire le serveur de simulation**

`sidecar/testing/targetServer.ts` :

```ts
import { createServer, type Server } from "node:http";

// Routes : /ok /moved (301→/final) /temp (302→/final) /chain (301→/moved)
// /notfound 404 /gone 410 /forbidden 403 /unauth 401 /rate-limit 429
// /method 405-HEAD-mais-GET-ok /server-error 500 /slow (délai 500 ms)
// /loop (301 vers lui-même) /redirect-to-404 (301→/notfound)
export async function startTargetServer(): Promise<{ port: number; close(): Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    const finish = (code: number, body = "") => {
      res.writeHead(code, { "Content-Type": "text/plain" });
      res.end(body);
    };
    if (req.method === "HEAD" && path === "/method") {
      res.writeHead(405);
      res.end();
      return;
    }
    switch (path) {
      case "/ok": return finish(200, "ok");
      case "/final": return finish(200, "final");
      case "/moved": { res.writeHead(301, { Location: "/final" }); return res.end(); }
      case "/temp": { res.writeHead(302, { Location: "/final" }); return res.end(); }
      case "/chain": { res.writeHead(301, { Location: "/moved" }); return res.end(); }
      case "/notfound": return finish(404);
      case "/gone": return finish(410);
      case "/forbidden": return finish(403);
      case "/unauth": return finish(401);
      case "/rate-limit": return finish(429);
      case "/method": return finish(200, "get ok");
      case "/server-error": return finish(500);
      case "/slow": return setTimeout(() => finish(200), 500);
      case "/loop": { res.writeHead(301, { Location: "/loop" }); return res.end(); }
      case "/redirect-to-404": { res.writeHead(301, { Location: "/notfound" }); return res.end(); }
      default: return finish(404);
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("adresse serveur inattendue");
  return {
    port: addr.port,
    close: () => new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r()))),
  };
}
```

- [ ] **Step 2: Écrire les tests d'abord**

`sidecar/analysis/linkchecker.test.ts` :

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTargetServer } from "../testing/targetServer.js";
import { checkUrl, checkAll } from "./linkchecker.js";

let port: number;
let close: () => Promise<void>;
const u = (p: string) => `http://127.0.0.1:${port}${p}`;

beforeAll(async () => {
  const s = await startTargetServer();
  port = s.port;
  close = s.close;
});
afterAll(async () => close());

const fast = { timeoutMs: 200, concurrency: 6, retry: 1 };

describe("checkUrl", () => {
  it("200 → ok", async () => {
    const r = await checkUrl(u("/ok"), fast);
    expect(r.status).toBe("ok");
    expect(r.httpStatus).toBe(200);
  });

  it("301 → redirect permanent avec chaîne et URL finale", async () => {
    const r = await checkUrl(u("/moved"), fast);
    expect(r.status).toBe("redirect");
    expect(r.redirectKind).toBe("permanent");
    expect(r.finalUrl).toBe(u("/final"));
    expect(r.redirectChain).toEqual([u("/moved")]);
  });

  it("302 → redirect temporaire", async () => {
    const r = await checkUrl(u("/temp"), fast);
    expect(r.status).toBe("redirect");
    expect(r.redirectKind).toBe("temporary");
  });

  it("chaîne 301→301→200 → redirect permanent, chaîne complète", async () => {
    const r = await checkUrl(u("/chain"), fast);
    expect(r.status).toBe("redirect");
    expect(r.redirectChain).toEqual([u("/chain"), u("/moved")]);
    expect(r.finalUrl).toBe(u("/final"));
  });

  it("404 → dead (http_404)", async () => {
    expect((await checkUrl(u("/notfound"), fast)).status).toBe("dead");
  });

  it("403 → indeterminate", async () => {
    const r = await checkUrl(u("/forbidden"), fast);
    expect(r.status).toBe("indeterminate");
    expect(r.reason).toBe("http_403");
  });

  it("429 → indeterminate", async () => {
    expect((await checkUrl(u("/rate-limit"), fast)).status).toBe("indeterminate");
  });

  it("405 en HEAD → retente en GET → ok", async () => {
    const r = await checkUrl(u("/method"), fast);
    expect(r.status).toBe("ok");
  });

  it("redirection vers 404 → classification FINALE dead", async () => {
    const r = await checkUrl(u("/redirect-to-404"), fast);
    expect(r.status).toBe("dead");
    expect(r.httpStatus).toBe(404);
  });

  it("boucle de redirection → dead (redirect_loop)", async () => {
    const r = await checkUrl(u("/loop"), fast);
    expect(r.status).toBe("dead");
    expect(r.reason).toBe("redirect_loop");
  });

  it("timeout → dead (timeout)", async () => {
    const r = await checkUrl(u("/slow"), { ...fast, timeoutMs: 100 });
    expect(r.status).toBe("dead");
    expect(r.reason).toBe("timeout");
  });

  it("port fermé → dead (conn_refused)", async () => {
    const r = await checkUrl("http://127.0.0.1:1/x", fast);
    expect(r.status).toBe("dead");
    expect(r.reason).toBe("conn_refused");
  });

  it("DNS invalide → dead (dns)", async () => {
    const r = await checkUrl("http://domaine-qui-nexiste-pas-xyz.example/x", { ...fast, retry: 0 });
    expect(r.status).toBe("dead");
    expect(r.reason).toBe("dns");
  });
});

describe("checkAll", () => {
  it("traite tout, publie via onUpdate, respecte la concurrence", async () => {
    const targets = Array.from({ length: 8 }, (_, i) => ({
      raindropId: i,
      url: u(i % 2 === 0 ? "/ok" : "/notfound"),
    }));
    const results: { raindropId: number; status: string }[] = [];
    const out = await checkAll(targets, {
      ...fast,
      concurrency: 3,
      onUpdate: (r) => results.push({ raindropId: r.raindropId, status: r.status }),
      isCancelled: () => false,
    });
    expect(results).toHaveLength(8);
    expect(out.stats.checked).toBe(8);
    expect(out.stats.maxConcurrency).toBeLessThanOrEqual(3);
    expect(out.stats.maxConcurrency).toBe(3); // 8 tâches, 3 workers → atteint
  });

  it("annulation : s'arrête et laisse des résultats partiels", async () => {
    const targets = Array.from({ length: 20 }, (_, i) => ({ raindropId: i, url: u("/slow") }));
    let seen = 0;
    const out = await checkAll(targets, {
      ...fast,
      timeoutMs: 60,
      concurrency: 2,
      onUpdate: () => seen++,
      isCancelled: () => seen >= 2,
    });
    expect(out.stats.checked).toBeLessThan(20);
  });
});
```

- [ ] **Step 3: Exécuter et constater l'échec**

Run: `npm test -- sidecar/analysis/linkchecker.test.ts`
Expected: FAIL — modules absents.

- [ ] **Step 4: Implémenter linkchecker.ts**

`sidecar/analysis/linkchecker.ts` :

```ts
import type { LinkCheckResult, RedirectKind } from "../../shared/types.js";

export interface CheckerOptions {
  timeoutMs: number; // prod : 10_000
  concurrency: number; // prod : 6
  retry: number; // prod : 1 (erreurs réseau uniquement)
  maxRedirects?: number; // 5
}

export type CheckOutcome = Omit<LinkCheckResult, "raindropId" | "checkedAt">;

const MAX_REDIRECTS = 5;

async function request(
  url: string,
  method: "HEAD" | "GET",
  timeoutMs: number,
): Promise<{ kind: "response"; status: number; location: string | null } | { kind: "network"; reason: string }> {
  try {
    const res = await fetch(url, {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "RaindropGUI/0.1 (link check)" },
    });
    return { kind: "response", status: res.status, location: res.headers.get("location") };
  } catch (e) {
    return { kind: "network", reason: networkReason(e) };
  }
}

function networkReason(e: unknown): string {
  const err = e as { code?: string; name?: string; cause?: { code?: string } };
  const code = err.code ?? err.cause?.code ?? "";
  if (err.name === "TimeoutError" || err.name === "AbortError" || code === "ABORT_ERR") return "timeout";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "dns";
  if (code === "ECONNREFUSED") return "conn_refused";
  return `net_${code || "error"}`;
}

export async function checkUrl(url: string, opts: Partial<CheckerOptions> = {}): Promise<CheckOutcome> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
  const retry = opts.retry ?? 1;

  const attempt = async (): Promise<CheckOutcome> => {
    const chain: string[] = [url];
    const redirectStatuses: number[] = [];
    let current = url;
    let method: "HEAD" | "GET" = "HEAD";
    while (true) {
      const res = await request(current, method, timeoutMs);
      if (res.kind === "network") {
        return {
          url, status: "dead", httpStatus: null,
          redirectChain: chain.length > 1 ? chain.slice(0, -1) : null,
          finalUrl: null, redirectKind: null, reason: res.reason,
        };
      }
      if (res.status >= 300 && res.status < 400) {
        const loc = res.location;
        if (!loc) {
          return { url, status: "dead", httpStatus: res.status, redirectChain: chain, finalUrl: null, redirectKind: null, reason: `http_${res.status}` };
        }
        if (redirectStatuses.length >= maxRedirects) {
          return { url, status: "dead", httpStatus: res.status, redirectChain: chain, finalUrl: null, redirectKind: null, reason: "redirect_loop" };
        }
        redirectStatuses.push(res.status);
        const next = new URL(loc, current).toString();
        chain.push(next);
        current = next;
        continue;
      }
      if ((res.status === 405 || res.status === 501) && method === "HEAD") {
        method = "GET"; // beaucoup de sites refusent HEAD (spec §5.1)
        continue;
      }
      return classify(res.status, chain, current, redirectStatuses);
    }
  };

  let result = await attempt();
  // 1 retry réseau (contrainte spec §5.1) : DNS, connexion refusée, erreurs
  // transport — PAS les timeouts (coût 2× timeout) ni les statuts HTTP.
  const retriable =
    result.reason != null &&
    (result.reason === "dns" || result.reason === "conn_refused" || result.reason.startsWith("net_"));
  if (result.status === "dead" && retriable && retry > 0) {
    result = await attempt();
  }
  return result;
}

/**
 * Classification finale : `redirectChain` = URLs intermédiaires traversées
 * SANS l'URL finale ; 2xx au bout d'une chaîne → catégorie "redirect".
 */
function classify(
  status: number,
  chain: string[],
  finalUrl: string,
  redirectStatuses: number[],
): CheckOutcome {
  const redirected = chain.length > 1;
  const base = {
    url: chain[0]!,
    httpStatus: status,
    redirectChain: redirected ? chain.slice(0, -1) : null,
    finalUrl: redirected ? finalUrl : null,
    redirectKind: redirected ? redirectKindFor(redirectStatuses) : null,
    reason: null as string | null,
  };
  if (status >= 200 && status < 300) {
    return redirected
      ? { ...base, status: "redirect", reason: `http_${redirectStatuses[0]}` }
      : { ...base, status: "ok", reason: null };
  }
  if (status === 401 || status === 403 || status === 429) {
    return { ...base, status: "indeterminate", reason: `http_${status}` };
  }
  return { ...base, status: "dead", reason: `http_${status}` };
}

/** Type de redirect d'une chaîne : 301/308 = permanent, sinon temporaire. */
export function redirectKindFor(statuses: number[]): RedirectKind {
  return statuses.length > 0 && statuses.every((s) => s === 301 || s === 308)
    ? "permanent"
    : "temporary";
}
```

- [ ] **Step 5: Implémenter checkAll (pool maison)**

Ajouter à `linkchecker.ts` :

```ts
export async function checkAll(
  targets: { raindropId: number; url: string }[],
  opts: CheckerOptions & {
    onUpdate(r: LinkCheckResult): void;
    isCancelled(): boolean;
  },
): Promise<{ stats: { checked: number; maxConcurrency: number } }> {
  const results: LinkCheckResult[] = [];
  let index = 0;
  let inFlight = 0;
  let maxConcurrency = 0;

  const worker = async () => {
    while (true) {
      if (opts.isCancelled()) return;
      const i = index++;
      if (i >= targets.length) return;
      inFlight++;
      maxConcurrency = Math.max(maxConcurrency, inFlight);
      try {
        const t = targets[i]!;
        const outcome = await checkUrl(t.url, opts);
        const full: LinkCheckResult = { ...outcome, raindropId: t.raindropId, checkedAt: new Date().toISOString() };
        results.push(full);
        opts.onUpdate(full);
      } finally {
        inFlight--;
      }
    }
  };

  const workers = Array.from({ length: Math.min(opts.concurrency, targets.length) }, worker);
  await Promise.all(workers);
  return { stats: { checked: results.length, maxConcurrency } };
}
```

- [ ] **Step 6: Vérifier**

Run: `npm test -- sidecar/analysis/linkchecker.test.ts`
Expected: PASS (15 tests ; les tests réseau local utilisent 127.0.0.1 uniquement).

- [ ] **Step 7: Commit**

```bash
git add sidecar/analysis/linkchecker.ts sidecar/analysis/linkchecker.test.ts sidecar/testing/targetServer.ts
git commit -m "feat(analysis): link checker — redirects chaîne, concurrence 6, timeout, retry, annulation"
```

---

### Task 13 : Snapshot bibliothèque + cache analysis.json (TTL)

**Files:**
- Create: `sidecar/analysis/snapshot.ts`, `sidecar/analysis/cache.ts`
- Test: `sidecar/analysis/snapshot.test.ts`, `sidecar/analysis/cache.test.ts`

**Interfaces:**
- Consumes : `deps.mcp`, `toRaindropItem`, `LinkCheckResult`, `DuplicateGroup`.
- Produces :
  - `fetchLibrarySnapshot(mcp, {onProgress?, isCancelled?}): Promise<{items: RaindropItem[]; cancelled: boolean}>` — pages de 50 via `search_raindrops {collection_id: 0, per_page: 50, page}` jusqu'à `count` ; échec tool → throw `Error("<code>: <message>")` (le scanner en fera un job error).
  - `class AnalysisCache { static load(file): Promise<AnalysisCache> ; save(): Promise<void> ; getResult(url): LinkCheckResult | undefined ; setResult(r: LinkCheckResult): void ; getItemsIndex(): Record<number, {title: string; collectionId: number; url: string}> ; setItemsIndex(items: RaindropItem[]): void ; getGroups(kind): DuplicateGroup[] ; setGroups(g: {exact[]; normalized[]; fuzzy[]}): void ; lastScan(type): string | null ; markScanDone(type): void ; staleUrls(items, ttlDays): {id; url}[] }` — fichier JSON atomique (`.tmp` + rename).

- [ ] **Step 1: Écrire le test du cache d'abord**

`sidecar/analysis/cache.test.ts` :

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AnalysisCache } from "./cache.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "cache-")); });

const result = (url: string, status: "ok" | "dead") => ({
  raindropId: 1, url, status, httpStatus: status === "ok" ? 200 : 404,
  redirectChain: null, finalUrl: null, redirectKind: null,
  reason: status === "ok" ? null : "http_404", checkedAt: new Date().toISOString(),
});

describe("AnalysisCache", () => {
  it("roundtrip save/load", async () => {
    const file = join(dir, "analysis.json");
    let cache = await AnalysisCache.load(file);
    cache.setResult(result("https://a.example", "ok"));
    cache.markScanDone("links");
    await cache.save();

    cache = await AnalysisCache.load(file);
    expect(cache.getResult("https://a.example")?.status).toBe("ok");
    expect(cache.lastScan("links")).toBeTruthy();
  });

  it("fichier corrompu → cache vide, pas de throw", async () => {
    const file = join(dir, "analysis.json");
    writeFileSync(file, "{corrompu");
    const cache = await AnalysisCache.load(file);
    expect(cache.getResult("https://a.example")).toBeUndefined();
  });

  it("save atomique : pas de .tmp résiduel", async () => {
    const file = join(dir, "analysis.json");
    const cache = await AnalysisCache.load(file);
    await cache.save();
    expect(existsSync(file)).toBe(true);
    expect(existsSync(`${file}.tmp`)).toBe(false);
    JSON.parse(readFileSync(file, "utf8")); // JSON valide
  });

  it("staleUrls : nouvelles + expirées seulement", async () => {
    const cache = await AnalysisCache.load(join(dir, "analysis.json"));
    cache.setResult(result("https://vieux.example", "ok"));
    // on vieillit artificiellement ce résultat de 40 jours
    const r = cache.getResult("https://vieux.example")!;
    cache.setResult({ ...r, checkedAt: new Date(Date.now() - 40 * 864e5).toISOString() });
    const stale = cache.staleUrls(
      [
        { id: 1, url: "https://vieux.example", title: "v", collectionId: 0 },
        { id: 2, url: "https://nouveau.example", title: "n", collectionId: 0 },
      ].map((x) => ({ ...x, excerpt: "", note: "", domain: "", tags: [], created: "", lastUpdate: "", important: false, type: "link", cover: null })),
      30,
    );
    expect(stale.map((s) => s.url).sort()).toEqual(["https://nouveau.example", "https://vieux.example"]);
  });
});
```

- [ ] **Step 2: Implémenter cache.ts**

`sidecar/analysis/cache.ts` :

```ts
import { readFile, writeFile, rename } from "node:fs/promises";
import type { DuplicateGroup, LinkCheckResult, AnalysisType } from "../../shared/types.js";
import type { RaindropItem } from "../../shared/types.js";

interface CacheFile {
  version: 1;
  links: { lastScan: string | null; results: Record<string, LinkCheckResult> };
  duplicates: { lastScan: string | null; groups: { exact: DuplicateGroup[]; normalized: DuplicateGroup[]; fuzzy: DuplicateGroup[] } };
  itemsIndex: Record<number, { title: string; collectionId: number; url: string }>;
}

const empty = (): CacheFile => ({
  version: 1,
  links: { lastScan: null, results: {} },
  duplicates: { lastScan: null, groups: { exact: [], normalized: [], fuzzy: [] } },
  itemsIndex: {},
});

export class AnalysisCache {
  private data: CacheFile = empty();
  private constructor(private file: string) {}

  static async load(file: string): Promise<AnalysisCache> {
    const cache = new AnalysisCache(file);
    try {
      const raw = await readFile(file, "utf8");
      const parsed = JSON.parse(raw) as CacheFile;
      if (parsed.version === 1) cache.data = parsed;
    } catch {
      cache.data = empty(); // absent ou corrompu → vide (incident loggé par l'appelant)
    }
    return cache;
  }

  async save(): Promise<void> {
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(this.data), "utf8");
    await rename(tmp, this.file);
  }

  getResult(url: string): LinkCheckResult | undefined {
    return this.data.links.results[url];
  }
  setResult(r: LinkCheckResult): void {
    this.data.links.results[r.url] = r;
  }

  getItemsIndex(): Record<number, { title: string; collectionId: number; url: string }> {
    return this.data.itemsIndex;
  }
  setItemsIndex(items: RaindropItem[]): void {
    for (const i of items) {
      this.data.itemsIndex[i.id] = { title: i.title, collectionId: i.collectionId, url: i.url };
    }
  }

  getGroups(): { exact: DuplicateGroup[]; normalized: DuplicateGroup[]; fuzzy: DuplicateGroup[] } {
    return this.data.duplicates.groups;
  }
  setGroups(g: { exact: DuplicateGroup[]; normalized: DuplicateGroup[]; fuzzy: DuplicateGroup[] }): void {
    this.data.duplicates.groups = g;
  }

  lastScan(type: AnalysisType): string | null {
    return type === "links" ? this.data.links.lastScan : this.data.duplicates.lastScan;
  }
  markScanDone(type: AnalysisType): void {
    const now = new Date().toISOString();
    if (type === "links") this.data.links.lastScan = now;
    else this.data.duplicates.lastScan = now;
  }

  /** URLs à re-checker : absentes du cache ou plus vieilles que ttlDays. */
  staleUrls(items: RaindropItem[], ttlDays: number): { id: number; url: string }[] {
    const cutoff = Date.now() - ttlDays * 864e5;
    return items
      .filter((i) => {
        const r = this.data.links.results[i.url];
        return !r || new Date(r.checkedAt).getTime() < cutoff;
      })
      .map((i) => ({ id: i.id, url: i.url }));
  }
}
```

- [ ] **Step 3: Test du snapshot + implémentation**

`sidecar/analysis/snapshot.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { connectFake } from "../testing/fakeServer.js";
import { McpConnection } from "../mcp/connection.js";
import { fetchLibrarySnapshot } from "./snapshot.js";

describe("fetchLibrarySnapshot", () => {
  it("pagine jusqu'à count avec per_page 50", async () => {
    const { client } = await connectFake({ raindropCount: 120 }); // + 2 doublons fixture
    const conn = McpConnection.fromClient(client);
    const pages: number[] = [];
    const out = await fetchLibrarySnapshot(
      (tool, args) => {
        pages.push((args as { page: number }).page);
        return conn.call(tool, args);
      },
      {},
    );
    await conn.close();
    expect(out.items.length).toBe(122);
    expect(out.cancelled).toBe(false);
    expect(pages[0]).toBe(0);
    expect(pages.length).toBe(3); // 50 + 50 + 22
  });

  it("annulation : arrêt propre avec cancelled:true", async () => {
    const { client } = await connectFake({ raindropCount: 120 });
    const conn = McpConnection.fromClient(client);
    const out = await fetchLibrarySnapshot(
      (tool, args) => conn.call(tool, args),
      { isCancelled: () => true },
    );
    await conn.close();
    expect(out.cancelled).toBe(true);
    expect(out.items.length).toBe(0);
  });

  it("erreur tool → throw avec le code", async () => {
    const { client } = await connectFake({ failTools: ["search_raindrops"] });
    const conn = McpConnection.fromClient(client);
    await expect(
      fetchLibrarySnapshot((tool, args) => conn.call(tool, args), {}),
    ).rejects.toThrow(/RAINDROP_API/);
    await conn.close();
  });
});
```

`sidecar/analysis/snapshot.ts` :

```ts
import type { CallOutcome } from "../../shared/errors.js";
import type { RaindropItem } from "../../shared/types.js";
import { toRaindropItem } from "../api/mappers.js";
import type { RawRaindrop } from "../api/mappers.js";

export type McpCaller = (
  tool: string,
  args: Record<string, unknown>,
) => Promise<CallOutcome<unknown>>;

const PAGE = 50;

export async function fetchLibrarySnapshot(
  mcp: McpCaller,
  opts: { onProgress?: (done: number, total: number) => void; isCancelled?: () => boolean } = {},
): Promise<{ items: RaindropItem[]; cancelled: boolean }> {
  const items: RaindropItem[] = [];
  let page = 0;
  let count = Infinity;
  while (items.length < count) {
    if (opts.isCancelled?.()) return { items, cancelled: true };
    const out = await mcp("search_raindrops", {
      collection_id: 0, // bibliothèque active, hors corbeille
      per_page: PAGE,
      page,
    });
    if (!out.ok) throw new Error(`${out.code}: ${out.message}`);
    const raw = out.data as { count: number; items: RawRaindrop[] };
    count = raw.count;
    items.push(...raw.items.map(toRaindropItem));
    opts.onProgress?.(items.length, count);
    if (raw.items.length === 0) break; // garde-fou pagination
    page++;
  }
  return { items, cancelled: false };
}
```

- [ ] **Step 4: Vérifier**

Run: `npm test -- sidecar/analysis/cache.test.ts sidecar/analysis/snapshot.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sidecar/analysis/snapshot.ts sidecar/analysis/snapshot.test.ts sidecar/analysis/cache.ts sidecar/analysis/cache.test.ts
git commit -m "feat(analysis): snapshot paginé 50/page + cache analysis.json atomique avec TTL"
```

---

### Task 14 : Scanner (job SSE) + routes analyse

**Files:**
- Create: `sidecar/analysis/scanner.ts`, `sidecar/api/routes/analysis.ts` (remplace le stub)
- Modify: `sidecar/api/deps.ts` (champs `cache`, `scanner` réels)
- Test: `sidecar/analysis/scanner.test.ts`, `sidecar/api/routes/analysis.test.ts`

**Interfaces:**
- Consumes : `fetchLibrarySnapshot`, `checkAll`, `findDuplicates`, `AnalysisCache`, `JobStore`, `runJob`.
- Produces :
  - `class Scanner { constructor(deps: {mcp; jobs; cache; check?: typeof checkUrl; concurrency?; ttlDays?}) ; startScan(type: AnalysisType): string ; isRunning(type): boolean }` — `startScan` renvoie le jobId ; `check` injectable pour les tests (défaut : `checkUrl` prod).
  - Scan links : job → snapshot → `cache.setItemsIndex` → `cache.staleUrls` → `checkAll` (seulement le stale) → `onUpdate` = `cache.setResult` + `progress` + save toutes les 20 maj → save final + `markScanDone("links")`.
  - Scan duplicates : job → snapshot → `findDuplicates` → `cache.setGroups` + `markScanDone("duplicates")` + save.
  - Endpoints : `POST /api/analysis/scan {type}` → 202 `{jobId}` (409-ish `INVALID_INPUT` si déjà en cours) ; `GET /api/analysis/status` → `{links: {lastScan, running}, duplicates: {...}}` ; `GET /api/analysis/results/links?page&per_page&filter` → résultats enrichis du `itemsIndex` (title, collectionId), triés dead → indeterminate → redirect → ok ; `GET /api/analysis/results/duplicates` → les 3 groupes.

- [ ] **Step 1: Écrire le test du scanner d'abord**

`sidecar/analysis/scanner.test.ts` :

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectFake } from "../testing/fakeServer.js";
import { McpConnection } from "../mcp/connection.js";
import { JobStore } from "../jobs/store.js";
import { AnalysisCache } from "./cache.js";
import { Scanner } from "./scanner.js";
import type { CheckOutcome } from "./linkchecker.js";

function makeCheck(fakeStatuses: Map<string, CheckOutcome["status"]>) {
  return async (url: string): Promise<CheckOutcome> => ({
    url,
    status: fakeStatuses.get(url) ?? "ok",
    httpStatus: fakeStatuses.get(url) === "dead" ? 404 : 200,
    redirectChain: null,
    finalUrl: null,
    redirectKind: null,
    reason: fakeStatuses.get(url) === "dead" ? "http_404" : null,
  });
}

describe("Scanner", () => {
  let conn: McpConnection;
  let store: JobStore;
  let cache: AnalysisCache;
  let file: string;

  beforeEach(async () => {
    const fake = await connectFake({ raindropCount: 25 });
    conn = McpConnection.fromClient(fake.client);
    store = new JobStore();
    file = join(mkdtempSync(join(tmpdir(), "scan-")), "analysis.json");
    cache = await AnalysisCache.load(file);
  });

  const mcpCaller = (tool: string, args: Record<string, unknown>) => conn.call(tool, args);

  it("scan-links complet : progression, cache, dernière URL du job", async () => {
    const scanner = new Scanner({
      mcp: mcpCaller,
      jobs: store,
      cache,
      check: makeCheck(new Map()),
      concurrency: 5,
      ttlDays: 30,
    });
    const jobId = scanner.startScan("links");
    const snap = await waitForStatus(store, jobId, ["done"]);
    expect(snap.status).toBe("done");
    expect(snap.progress.done).toBe(27); // 25 + 2 doublons fixture
    // cache peuplé : 27 résultats uniques par URL
    const results = cache.allResults();
    expect(results.length).toBeGreaterThanOrEqual(25);
    expect(cache.lastScan("links")).toBeTruthy();
  });

  it("scan incrémental : ne re-checke que le stale", async () => {
    let checked = 0;
    const countingCheck = async (url: string) => {
      checked++;
      return makeCheck(new Map())(url);
    };
    const scanner = new Scanner({ mcp: mcpCaller, jobs: store, cache, check: countingCheck, concurrency: 5, ttlDays: 30 });
    scanner.startScan("links");
    await waitForStatus(store, store.list()[0]!.id, ["done"]);
    const first = checked;
    expect(first).toBeGreaterThan(0);

    // 2e scan immédiat : tout est frais → aucun re-check
    const jobId2 = scanner.startScan("links");
    await waitForStatus(store, jobId2, ["done"]);
    expect(checked).toBe(first);
  });

  it("scan-duplicates trouve les doublons fixture", async () => {
    const scanner = new Scanner({ mcp: mcpCaller, jobs: store, cache, check: makeCheck(new Map()), concurrency: 5, ttlDays: 30 });
    const jobId = scanner.startScan("duplicates");
    await waitForStatus(store, jobId, ["done"]);
    const groups = cache.getGroups();
    // fixtures : 1 doublon exact (copie) + 1 copie normalisée
    expect(groups.exact.length + groups.normalized.length).toBeGreaterThanOrEqual(1);
    expect(cache.lastScan("duplicates")).toBeTruthy();
  });

  it("annulation : statut cancelled, cache partiel sauvé", async () => {
    let seen = 0;
    const slowCheck = async (url: string) => {
      seen++;
      await new Promise((r) => setTimeout(r, 30));
      return makeCheck(new Map())(url);
    };
    const scanner = new Scanner({ mcp: mcpCaller, jobs: store, cache, check: slowCheck, concurrency: 1, ttlDays: 30 });
    const jobId = scanner.startScan("links");
    // annule dès les premiers résultats
    const snap = await new Promise<ReturnType<typeof store.get>>((resolve) => {
      const id = setInterval(() => {
        const s = store.get(jobId)!;
        if (s.progress.done >= 2) {
          clearInterval(id);
          store.getHandle(jobId)!.cancel();
          const check = () => {
            const s2 = store.get(jobId)!;
            if (s2.status !== "running") resolve(s2);
            else setTimeout(check, 10);
          };
          check();
        }
      }, 10);
    });
    expect(snap!.status).toBe("cancelled");
    expect(seen).toBeLessThan(27);
    expect(cache.allResults().length).toBeGreaterThan(0); // partiel mais persisté
  });

  it("isRunning empêche un double scan du même type", async () => {
    const scanner = new Scanner({
      mcp: mcpCaller, jobs: store, cache,
      check: async (url) => { await new Promise((r) => setTimeout(r, 50)); return makeCheck(new Map())(url); },
      concurrency: 1, ttlDays: 30,
    });
    scanner.startScan("links");
    expect(() => scanner.startScan("links")).toThrow(/déjà en cours/);
    await waitForStatus(store, store.list()[0]!.id, ["done"]);
  });
});

async function waitForStatus(store: JobStore, id: string, statuses: string[]) {
  return new Promise<NonNullable<ReturnType<typeof store.get>>>((resolve, reject) => {
    const check = () => {
      const s = store.get(id);
      if (!s) return reject(new Error("job absent"));
      if (statuses.includes(s.status)) return resolve(s);
      if (s.status === "error") return reject(new Error(s.error ?? "job error"));
      setTimeout(check, 10);
    };
    check();
  });
}
```

- [ ] **Step 2: Exécuter et constater l'échec, puis implémenter scanner.ts**

Run: `npm test -- sidecar/analysis/scanner.test.ts` → FAIL (module absent).

`sidecar/analysis/scanner.ts` :

```ts
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

export interface ScannerDeps {
  mcp: (tool: string, args: Record<string, unknown>) => Promise<CallOutcome<unknown>>;
  jobs: JobStore;
  cache: AnalysisCache;
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
    const check = this.deps.check ?? ((url: string) => checkUrl(url));

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

      const targets = this.deps.cache.staleUrls(snap.items, ttlDays);
      j.progress(0, targets.length, "vérification des liens");
      let done = 0;
      let sinceSave = 0;
      const out = await checkAll(targets, {
        timeoutMs: 10_000,
        concurrency,
        retry: 1,
        onUpdate: (r) => {
          this.deps.cache.setResult(r);
          done++;
          sinceSave++;
          j.progress(done, targets.length, r.url);
          if (sinceSave >= SAVE_EVERY) {
            sinceSave = 0;
            void this.deps.cache.save(); // persistance périodique (résultats partiels)
          }
        },
        isCancelled: () => j.isCancelled(),
      });
      this.deps.cache.markScanDone("links");
      await this.deps.cache.save();
      return out.stats;
    });

    void job; // statut final géré par runJob
    const handle = job;
    handle.subscribe(() => {
      const s = handle.snapshot();
      if (s.status !== "running") this.running.delete(type);
    });
    return job.id;
  }
}
```

> Ajouter à `AnalysisCache` (Task 13) : `allResults(): LinkCheckResult[]` → `Object.values(this.data.links.results)`. Le test du double-scan incrémental repose sur `staleUrls` : le 2e scan ne re-check rien car tous les `checkedAt` sont frais.

- [ ] **Step 3: Écrire le test des routes analyse + implémenter**

`sidecar/api/routes/analysis.test.ts` :

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Hono } from "hono";
import { createApp, type SidecarDeps } from "../app.js";
import { connectFake } from "../../testing/fakeServer.js";
import { McpConnection } from "../../mcp/connection.js";
import { JobStore } from "../../jobs/store.js";
import { AnalysisCache } from "../../analysis/cache.js";
import { Scanner } from "../../analysis/scanner.js";
import type { RaindropItem } from "../../../../shared/types.js";

let conn: McpConnection;
let app: Hono;
let jobs: JobStore;
let cache: AnalysisCache;

beforeEach(async () => {
  const fake = await connectFake({ raindropCount: 20 });
  conn = McpConnection.fromClient(fake.client);
  jobs = new JobStore();
  cache = await AnalysisCache.load(join(mkdtempSync(join(tmpdir(), "ra-")), "analysis.json"));
  const scanner = new Scanner({
    mcp: (t, a) => conn.call(t, a),
    jobs,
    cache,
    check: async (url) => ({ url, status: "ok", httpStatus: 200, redirectChain: null, finalUrl: null, redirectKind: null, reason: null }),
    concurrency: 5,
    ttlDays: 30,
  });
  const deps: SidecarDeps = {
    mcp: (t, a, tms) => conn.call(t, a, tms),
    state: () => "connected",
    restart: async () => undefined,
    jobs,
    cache,
    scanner,
    direct: { updateRaindropUrl: async () => ({ ok: true as const, data: { id: 1 } }) },
  };
  app = createApp(deps, { localToken: "t" });
});

describe("routes analyse", () => {
  it("POST /scan lançe un job, GET /status le reflète une fois terminé", async () => {
    const res = await app.request("/api/analysis/scan", {
      method: "POST",
      body: JSON.stringify({ type: "duplicates" }),
    });
    expect(res.status).toBe(202);
    const { jobId } = (await res.json()) as { jobId: string };

    let done = false;
    for (let i = 0; i < 200 && !done; i++) {
      const s = (await (await app.request(`/api/jobs/${jobId}`)).json()) as { status: string };
      done = s.status === "done";
      if (!done) await new Promise((r) => setTimeout(r, 25));
    }
    expect(done).toBe(true);

    const status = (await (await app.request("/api/analysis/status")).json()) as {
      duplicates: { lastScan: string | null; running: boolean };
    };
    expect(status.duplicates.lastScan).toBeTruthy();
    expect(status.duplicates.running).toBe(false);
  });

  it("POST /scan refuse un type inconnu (400)", async () => {
    const res = await app.request("/api/analysis/scan", { method: "POST", body: JSON.stringify({ type: "magie" }) });
    expect(res.status).toBe(400);
  });

  it("GET /results/duplicates renvoie les groupes", async () => {
    await app.request("/api/analysis/scan", { method: "POST", body: JSON.stringify({ type: "duplicates" }) });
    await new Promise((r) => setTimeout(r, 400));
    const res = await app.request("/api/analysis/results/duplicates");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { exact: unknown[]; normalized: unknown[]; fuzzy: unknown[] };
    expect(body).toHaveProperty("exact");
  });

  it("GET /results/links pagine et enrichit du titre", async () => {
    await app.request("/api/analysis/scan", { method: "POST", body: JSON.stringify({ type: "links" }) });
    await new Promise((r) => setTimeout(r, 600));
    const res = await app.request("/api/analysis/results/links?page=0&per_page=10");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { title: string; url: string; status: string }[]; total: number };
    expect(body.items.length).toBe(10);
    expect(body.items[0]!.title).toBeTruthy();
  });
});
```

`sidecar/api/routes/analysis.ts` :

```ts
import { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../../shared/errors.js";
import type { SidecarDeps } from "../deps.js";
import type { LinkCheckResult } from "../../../shared/types.js";

const FILTER_ORDER: Record<string, number> = { dead: 0, indeterminate: 1, redirect: 2, ok: 3 };

export function analysisRoutes(deps: SidecarDeps): Hono {
  const app = new Hono();

  app.post("/scan", async (c) => {
    const body = z.object({ type: z.enum(["links", "duplicates"]) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "INVALID_INPUT", "type ∈ {links, duplicates}");
    try {
      const jobId = deps.scanner.startScan(body.data.type);
      return c.json({ jobId }, 202);
    } catch (e) {
      return apiError(c, "INVALID_INPUT", e instanceof Error ? e.message : String(e));
    }
  });

  app.get("/status", (c) =>
    c.json({
      links: { lastScan: deps.cache.lastScan("links"), running: deps.scanner.isRunning("links") },
      duplicates: { lastScan: deps.cache.lastScan("duplicates"), running: deps.scanner.isRunning("duplicates") },
    }),
  );

  app.get("/results/links", async (c) => {
    const q = z.object({
      page: z.coerce.number().int().min(0).default(0),
      per_page: z.coerce.number().int().min(1).max(200).default(50),
      filter: z.enum(["all", "dead", "indeterminate", "redirect", "ok"]).default("all"),
    }).safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
    if (!q.success) return apiError(c, "INVALID_INPUT", z.prettifyError(q.error));

    const index = deps.cache.getItemsIndex();
    const all = deps.cache.allResults();
    const filtered = q.data.filter === "all" ? all : all.filter((r) => r.status === q.data.filter);
    filtered.sort((a, b) => (FILTER_ORDER[a.status] ?? 9) - (FILTER_ORDER[b.status] ?? 9));
    const start = q.data.page * q.data.per_page;
    const items = filtered.slice(start, start + q.data.per_page).map((r) => enrich(r, index));
    return c.json({ items, total: filtered.length, page: q.data.page, perPage: q.data.per_page });
  });

  app.get("/results/duplicates", (c) => c.json(deps.cache.getGroups()));

  return app;
}

type EnrichedLink = LinkCheckResult & { title: string; collectionId: number };

function enrich(r: LinkCheckResult, index: Record<number, { title: string; collectionId: number }>): EnrichedLink {
  const meta = index[r.raindropId];
  return { ...r, title: meta?.title ?? r.url, collectionId: meta?.collectionId ?? -1 };
}
```

- [ ] **Step 4: Vérifier**

Run: `npm test -- sidecar/analysis/scanner.test.ts sidecar/api/routes/analysis.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sidecar/analysis/scanner.ts sidecar/analysis/scanner.test.ts sidecar/api/routes/analysis.ts sidecar/api/routes/analysis.test.ts sidecar/api/deps.ts sidecar/analysis/cache.ts
git commit -m "feat(analysis): scanner job SSE incrémental + routes /api/analysis/*"
```

---

### Task 15 : Config, logger, lockfile, bootstrap `index.ts`

**Files:**
- Create: `sidecar/config.ts`, `sidecar/logger.ts`, `sidecar/lockfile.ts`, `sidecar/index.ts`
- (dépendance `@hono/node-server` déjà posée en Task 1 — serveur HTTP node pour Hono)
- Test: `sidecar/logger.test.ts`, `sidecar/lockfile.test.ts`

**Interfaces:**
- Produces :
  - `loadConfig(env = process.env): Config` — zod, token Raindrop requis (`MCP_RAINDROPIO_TOKEN`), défauts : `LOCAL_API_TOKEN="dev-local-token"`, `MCP_TIMEOUT_MS=30000`, `MIN_CALL_INTERVAL_MS=550`, `LINK_CONCURRENCY=6`, `LINK_TIMEOUT_MS=10000`, `ANALYSIS_TTL_DAYS=30`, `LOG_LEVEL="info"`, `RAINDROP_MCP_ENTRY=<node_modules/@kud/mcp-raindrop-io/dist/index.js>`.
  - `appDataDir(cfg): string` — `cfg.APPDATA_DIR ?? ~/Library/Application Support/Raindrop-GUI`.
  - `createLogger(dir, {level, retentionDays=7}): Logger` — JSONL `sidecar-YYYY-MM-DD.jsonl`, purge > 7 j au boot, méthodes `info/warn/error(msg, fields?)`, `close()`.
  - `acquireLock(dir, data: {port; token}): Promise<"created" | "reused">` — lockfile existant + pid vivant → `reused` (le caller exit 0 : Tauri réutilisera le sidecar vivant) ; pid mort ou lockfile corrompu → écrasement (spec §7). `writeLockfile(dir, data)` réécrit le lockfile (utilisé après bind pour inscrire le port réel).
  - `sidecar/index.ts` : vérif Node ≥ 20 → loadConfig → logger → acquireLock → lifecycle (stdioFactory + events state → log) → throttle(550) → JobStore → AnalysisCache(app-data) → createApp → `serve({hostname: "127.0.0.1", port: 0})` → lockfile avec le port réel → log ready → SIGTERM/SIGINT : serve close, lifecycle.stop, clearLockfile, logger.close.

- [ ] **Step 1: Vérifier la dépendance serveur (posée en Task 1)**

Run: `node -e "console.log(require('./package.json').dependencies['@hono/node-server'])"`
Expected: `^1.14.0` (sinon : `npm install @hono/node-server@^1.14.0`).

- [ ] **Step 2: Écrire le test lockfile d'abord**

`sidecar/lockfile.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLock, readLockfile, clearLockfile } from "./lockfile.js";

const dir = () => mkdtempSync(join(tmpdir(), "lock-"));

describe("acquireLock", () => {
  it("crée le lockfile avec port/token/pid", async () => {
    const d = dir();
    const r = await acquireLock(d, { port: 5000, token: "abc" });
    expect(r).toBe("created");
    const data = await readLockfile(d);
    expect(data).toMatchObject({ port: 5000, token: "abc", pid: process.pid });
  });

  it("pid vivant existant → reused (réutilisation par Tauri)", async () => {
    const d = dir();
    await acquireLock(d, { port: 5000, token: "abc" });
    const r = await acquireLock(d, { port: 6000, token: "x" });
    expect(r).toBe("reused");
  });

  it("pid mort → écrasement (lockfile corrompu/crash)", async () => {
    const d = dir();
    await acquireLock(d, { port: 5000, token: "abc", pid: 999999999 });
    const r = await acquireLock(d, { port: 7000, token: "y" });
    expect(r).toBe("created");
    expect((await readLockfile(d))!.port).toBe(7000);
  });

  it("contenu corrompu → écrasement propre", async () => {
    const d = dir();
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(d, "sidecar.json"), "pas du json");
    const r = await acquireLock(d, { port: 8000, token: "z" });
    expect(r).toBe("created");
  });

  it("clearLockfile supprime", async () => {
    const d = dir();
    await acquireLock(d, { port: 1, token: "t" });
    await clearLockfile(d);
    expect(await readLockfile(d)).toBeNull();
  });
});
```

- [ ] **Step 3: Implémenter lockfile.ts et logger.ts**

`sidecar/lockfile.ts` :

```ts
import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface LockfileData {
  port: number;
  token: string;
  pid: number;
  startedAt: string;
}

const fileName = "sidecar.json";

export function lockfilePath(dataDir: string): string {
  return join(dataDir, fileName);
}

export async function readLockfile(dataDir: string): Promise<LockfileData | null> {
  try {
    const raw = await readFile(lockfilePath(dataDir), "utf8");
    const d = JSON.parse(raw) as LockfileData;
    if (typeof d.port === "number" && typeof d.pid === "number") return d;
    return null;
  } catch {
    return null;
  }
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function writeLockfile(
  dataDir: string,
  data: { port: number; token: string },
): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const payload: LockfileData = { ...data, pid: process.pid, startedAt: new Date().toISOString() };
  await writeFile(lockfilePath(dataDir), JSON.stringify(payload, null, 2), "utf8");
}

/**
 * "reused" = un sidecar vivant existe déjà (le caller sort proprement :
 * Tauri réutilisera l'instance active via le lockfile). Sinon écrit/écrase.
 */
export async function acquireLock(
  dataDir: string,
  data: { port: number; token: string },
): Promise<"created" | "reused"> {
  const existing = await readLockfile(dataDir);
  if (existing && isPidAlive(existing.pid)) return "reused";
  await writeLockfile(dataDir, data);
  return "created";
}

export async function clearLockfile(dataDir: string): Promise<void> {
  await unlink(lockfilePath(dataDir)).catch(() => undefined);
}
```

`sidecar/logger.ts` :

```ts
import { appendFile, mkdir, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";

export interface Logger {
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  close(): Promise<void>;
}

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof LEVELS;

export function createLogger(
  logsDir: string,
  opts: { level?: Level; retentionDays?: number; now?: () => Date } = {},
): Logger {
  const level = LEVELS[opts.level ?? "info"];
  const now = opts.now ?? (() => new Date());
  const pending: Promise<unknown>[] = [];

  const fileFor = (d: Date) => {
    const ymd = d.toISOString().slice(0, 10);
    return join(logsDir, `sidecar-${ymd}.jsonl`);
  };

  const write = (lvl: Level, msg: string, fields?: Record<string, unknown>) => {
    if (LEVELS[lvl] < level) return;
    const entry = JSON.stringify({ ts: now().toISOString(), level: lvl, msg, ...fields });
    pending.push(appendFile(fileFor(now()), `${entry}\n`, "utf8").catch(() => undefined));
  };

  // rotation : purge des logs > 7 jours (async, sans bloquer)
  const retentionDays = opts.retentionDays ?? 7;
  void (async () => {
    try {
      await mkdir(logsDir, { recursive: true });
      const cutoff = Date.now() - retentionDays * 864e5;
      for (const f of await readdir(logsDir)) {
        const m = /^sidecar-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(f);
        if (m && new Date(`${m[1]}T00:00:00Z`).getTime() < cutoff) {
          await unlink(join(logsDir, f)).catch(() => undefined);
        }
      }
    } catch {
      // logs non critiques
    }
  })();

  return {
    info: (m, f) => write("info", m, f),
    warn: (m, f) => write("warn", m, f),
    error: (m, f) => write("error", m, f),
    close: async () => {
      await Promise.allSettled(pending);
    },
  };
}
```

(`sidecar/logger.test.ts` : tmpdir → `info()` → fichier `sidecar-<today>.jsonl` contient un JSON avec `msg` ; un vieux fichier `sidecar-2020-01-01.jsonl` pré-créé est supprimé après `createLogger`. 2 tests.)

- [ ] **Step 4: Implémenter config.ts**

`sidecar/config.ts` :

```ts
import { z } from "zod";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const envSchema = z.object({
  MCP_RAINDROPIO_TOKEN: z.string().min(1, "token Raindrop requis"),
  LOCAL_API_TOKEN: z.string().min(1).default("dev-local-token"),
  APPDATA_DIR: z.string().optional(),
  RAINDROP_MCP_ENTRY: z
    .string()
    .default(
      fileURLToPath(new URL("../node_modules/@kud/mcp-raindrop-io/dist/index.js", import.meta.url)),
    ),
  MCP_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  MIN_CALL_INTERVAL_MS: z.coerce.number().int().positive().default(550),
  LINK_CONCURRENCY: z.coerce.number().int().positive().default(6),
  LINK_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  ANALYSIS_TTL_DAYS: z.coerce.number().int().positive().default(30),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const msg = z.prettifyError(parsed.error);
    throw new Error(`configuration invalide — ${msg}`);
  }
  return parsed.data;
}

export function appDataDir(cfg: Config): string {
  return (
    cfg.APPDATA_DIR ?? join(homedir(), "Library", "Application Support", "Raindrop-GUI")
  );
}
```

- [ ] **Step 5: Implémenter sidecar/index.ts (bootstrap)**

```ts
#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { loadConfig, appDataDir } from "./config.js";
import { createLogger } from "./logger.js";
import { acquireLock, clearLockfile, writeLockfile } from "./lockfile.js";
import { McpLifecycle } from "./mcp/lifecycle.js";
import { stdioFactory } from "./mcp/connection.js";
import { Throttle } from "./mcp/throttle.js";
import { makeMcpCaller, type SidecarDeps } from "./api/deps.js";
import { createApp } from "./api/app.js";
import { JobStore } from "./jobs/store.js";
import { AnalysisCache } from "./analysis/cache.js";
import { Scanner } from "./analysis/scanner.js";
import { makeRestClient } from "./direct/raindropRest.js";
import { join } from "node:path";

function fail(msg: string): never {
  console.error(JSON.stringify({ level: "error", msg }));
  process.exit(1);
}

// Prérequis Node ≥ 20 (spec §3.2)
const major = Number(process.versions.node.split(".")[0]);
if (major < 20) fail(`Node >= 20 requis (trouvé: ${process.versions.node})`);

const cfg = loadConfig();
const dataDir = appDataDir(cfg);
const logger = createLogger(join(dataDir, "logs"), { level: cfg.LOG_LEVEL });
logger.info("démarrage sidecar", { node: process.versions.node, pid: process.pid });

// Lockfile : réutilisation si un sidecar vivant existe déjà (reload webview/HMR)
const preLock = await acquireLock(dataDir, { port: 0, token: cfg.LOCAL_API_TOKEN });
if (preLock === "reused") {
  logger.warn("sidecar déjà actif (lockfile + pid vivant) — sortie");
  await logger.close();
  process.exit(0);
}

const lifecycle = new McpLifecycle({
  factory: stdioFactory(cfg.RAINDROP_MCP_ENTRY, cfg.MCP_RAINDROPIO_TOKEN),
  maxRestarts: 3,
});
lifecycle.on("state", (s) => logger.info("état MCP", { state: s }));

const throttle = new Throttle(cfg.MIN_CALL_INTERVAL_MS);
const jobs = new JobStore();
const cache = await AnalysisCache.load(join(dataDir, "analysis.json"));
const rest = makeRestClient({ token: cfg.MCP_RAINDROPIO_TOKEN });
const scanner = new Scanner({
  mcp: (tool, args) => throttle.run(() => lifecycle.call(tool, args)),
  jobs,
  cache,
  concurrency: cfg.LINK_CONCURRENCY,
  ttlDays: cfg.ANALYSIS_TTL_DAYS,
});

const deps: SidecarDeps = {
  mcp: makeMcpCaller(lifecycle, throttle),
  state: () => lifecycle.state,
  restart: () => lifecycle.restart(),
  jobs,
  cache,
  scanner,
  direct: rest,
};

const app = createApp(deps, { localToken: cfg.LOCAL_API_TOKEN });

const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 });
const addr = server.address();
if (!addr || typeof addr === "string") fail("bind impossible");
logger.info("api prête", { port: addr.port });

// réécrit le lockfile avec le port réel — acquireLock lirait son propre pid
// vivant et renverrait "reused" sans rien écrire
await writeLockfile(dataDir, { port: addr.port, token: cfg.LOCAL_API_TOKEN });
logger.info("sidecar prêt", { port: addr.port, mcp: lifecycle.state });

let stopping = false;
const shutdown = async (signal: string) => {
  if (stopping) return;
  stopping = true;
  logger.info("arrêt", { signal });
  server.close();
  await lifecycle.stop();
  await clearLockfile(dataDir);
  await logger.close();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
```

- [ ] **Step 6: Vérifier unitairement puis en fumée réelle**

Run: `npm test && npm run typecheck`
Expected: PASS intégral.

Fumée (sans vrai token — le subprocess MCP quittera, le lifecycle passera en crashed/restarting mais l'API locale répond ; c'est le comportement dégradé attendu) :

```bash
mkdir -p /tmp/rg-smoke && APPDATA_DIR=/tmp/rg-smoke LOCAL_API_TOKEN=fumee MCP_RAINDROPIO_TOKEN=dummy npx tsx sidecar/index.ts &
sleep 4
PORT=$(python3 -c "import json;print(json.load(open('/tmp/rg-smoke/sidecar.json'))['port'])")
curl -s -H "Authorization: Bearer fumee" "http://127.0.0.1:$PORT/api/health"
curl -s -H "Authorization: Bearer fumee" "http://127.0.0.1:$PORT/api/analysis/status"
kill %1 && rm -rf /tmp/rg-smoke
```

Expected: `{"status":"ok","mcp":"crashed"...}` (ou `restarting`), `{"links":{"lastScan":null,...}}`, exit propre au kill (lockfile supprimée).

- [ ] **Step 7: Commit**

```bash
git add sidecar/config.ts sidecar/logger.ts sidecar/logger.test.ts sidecar/lockfile.ts sidecar/lockfile.test.ts sidecar/index.ts package.json package-lock.json
git commit -m "feat(sidecar): bootstrap — config env, logs JSONL 7j, lockfile pid, bind 127.0.0.1:0"
```

---

### Task 16 : Intégration réelle (guarded) + README dev + récap

**Files:**
- Create: `sidecar/integration.test.ts`, `README.md` (section Développement)

**Interfaces:**
- Produces : preuve de bout-en-bout optionnelle (token réel) + doc de lancement pour les plans 2 (front) et 3 (Tauri).

- [ ] **Step 1: Test d'intégration réel, skippé sans token**

`sidecar/integration.test.ts` :

```ts
import { describe, it, expect, afterAll } from "vitest";
import { McpConnection, stdioFactory } from "./mcp/connection.js";
import { loadConfig } from "./config.js";

// Activé uniquement si RAINDROP_TEST_TOKEN est défini (spec §8)
const TOKEN = process.env.RAINDROP_TEST_TOKEN;
const d = describe.skipIf(!TOKEN);

const conn = TOKEN
  ? await McpConnection.connect(
      stdioFactory(
        loadConfig({ MCP_RAINDROPIO_TOKEN: TOKEN }).RAINDROP_MCP_ENTRY,
        TOKEN,
      ),
    )
  : null;
afterAll(async () => void (await conn?.close()));

d("intégration réelle (MCP + API Raindrop)", () => {
  it("get_user renvoie le compte", async () => {
    const out = await conn!.call<{ email: string }>("get_user", {}, 30_000);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.data.email).toContain("@");
  });

  it("search_raindrops page 0 (50 items) répond", async () => {
    const out = await conn!.call<{ count: number; items: unknown[] }>(
      "search_raindrops",
      { collection_id: 0, per_page: 50, page: 0 },
      30_000,
    );
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.data.count).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Vérifier**

Run: `npm test`
Expected: PASS — les 2 tests d'intégration sont `skipped` (pas de `RAINDROP_TEST_TOKEN`), tout le reste vert.

Vérification réelle optionnelle : `RAINDROP_TEST_TOKEN=<token> npm test -- sidecar/integration.test.ts` (le token de l'utilisateur, s'il veut la preuve bout-en-bout).

- [ ] **Step 3: README.md — section Développement**

Créer (ou compléter) `README.md` :

```markdown
# Raindrop-GUI

GUI desktop (Phase 1 : sidecar complet ; front React et shell Tauri : plans suivants).

## Développement — sidecar seul

```bash
npm install
npm run dev:sidecar   # tsx watch
```

Variables d'environnement (voir `sidecar/config.ts`) :

| Variable | Défaut | Rôle |
|---|---|---|
| `MCP_RAINDROPIO_TOKEN` | — (requis) | token API Raindrop, transmis au subprocess MCP |
| `LOCAL_API_TOKEN` | `dev-local-token` | Bearer attendu par l'API locale |
| `APPDATA_DIR` | `~/Library/Application Support/Raindrop-GUI` | lockfile, cache analyse, logs |
| `MIN_CALL_INTERVAL_MS` | `550` | espacement des appels MCP (limite 120 req/min) |

Smoke test :

```bash
APPDATA_DIR=/tmp/rg LOCAL_API_TOKEN=dev-local-token MCP_RAINDROPIO_TOKEN=<vrai-token> npx tsx sidecar/index.ts &
PORT=$(python3 -c "import json;print(json.load(open('/tmp/rg/sidecar.json'))['port'])")
curl -s -H "Authorization: Bearer dev-local-token" "http://127.0.0.1:$PORT/api/health"
```

## Tests

```bash
npm test                                   # tout (fakes in-process, réseau local only)
RAINDROP_TEST_TOKEN=<token> npm test       # + intégration réelle
```
```

- [ ] **Step 4: Étape finale de correction spec (petites divergences détectées)**

Mettre à jour la spec (`docs/superpowers/specs/2026-09-15-raindrop-gui-design.md`) :
- §1 : « 22 tools » → « 23 tools » (liste vérifiée sur v1.3.1).
- §5 : retirer `POST /api/library-audit` du tableau REST (le tool `library_audit` n'est pas exposé, l'analyse est locale) ; noter `PATCH /api/raindrops/:id {url}` → REST direct.
- Commit séparé :

```bash
git add docs/superpowers/specs/2026-09-15-raindrop-gui-design.md README.md sidecar/integration.test.ts
git commit -m "docs: spec corrigée (23 tools, library_audit non exposé) + README dev sidecar"
```

- [ ] **Step 5: Vérification finale du plan entier**

Run: `npm test && npm run typecheck && git log --oneline | head -20`
Expected: suite verte complète, historique propre, un commit par task.

---

## Handoff vers les plans suivants

- **Plan 2 (front React)** : consomme exclusivement les endpoints REST de ce sidecar + `shared/types.ts` (DTO stables). Points d'attention : auth Bearer `LOCAL_API_TOKEN` transmis par Tauri (plan 3) ; SSE `/api/jobs/:id/events` pour les jobs d'analyse ; le compteur « non-taggés » du dashboard vient de `GET /api/raindrops?notag=true&per_page=1` (`count`) ; collections vides calculées côté front depuis `GET /api/collections` (`count === 0`).
- **Plan 3 (shell Tauri)** : spawn `node dist-sidecar/sidecar/index.js` (build `tsc` — imports `.js` déjà nodenext-compatibles) avec `MCP_RAINDROPIO_TOKEN` (Keychain) et `LOCAL_API_TOKEN` (généré éphémère) ; lit le lockfile `sidecar.json` `{port, token, pid}` pour l'état « réutilisé » ; écran premier lancement avant tout spawn.
- Ce qui reste volontairement côté front : connexion/dégradation offline (bannière), palette ⌘K, page Revue de l'action, mode sombre, textes français externalisés.
