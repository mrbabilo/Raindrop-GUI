# Smart lists (vues sauvegardées) — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** une vue filtrée de la bibliothèque peut être nommée dans la barre latérale et rejouée à chaque ouverture — le stockage est un JSON local, la logique reste `listQueryArgs` (aucune logique propre à la smart list).

**Architecture:** dépôt JSON au patron `trash-origins.ts` dans `sidecar/smartlists/`, quatre routes Hono sous `/api/smartlists` (GET/POST/PATCH/DELETE, zod). Côté front : le `View` « list » gagne `smartlistId` (effacé par tout patch de filtre), un module `src/lib/smartlists.ts` sérialise/désérialise la vue, un hook lit et écrit la collection, une section de barre latérale (`SectionSmartLists`) et un bouton de TopBar avec formulaire inline.

**Tech Stack:** Hono + zod (sidecar), React + TanStack Query (front), Vitest partout, `repertoireTemporaire` pour les fichiers de test.

**Spec:** `docs/superpowers/specs/2026-09-22-smart-lists-design.md` — le plan argue de ses sections (§2 décisions, §3 données, §4 création, §5 barre latérale, §6 cas aux bords, §7 tests et sabotages).

## Global Constraints

- Imports relatifs **avec extension `.js`** côté sidecar (`moduleResolution: nodenext`) — sinon le build `tsc` est cassé au runtime.
- Taille des fichiers : cible ≤ 300 lignes, plafond dur 400. Tests cohabitants : `*.test.ts(x)` voisin du code couvert, un fichier de test par unité.
- Interface **en français** : toute chaîne neuve dans `src/i18n/fr.ts`, jamais en dur dans un composant. Pas de `|` double dans une valeur (test du dictionnaire).
- Le front ne connaît que l'API REST locale — aucun code MCP côté front.
- `smartlists.json` vit en app-data, **hors du dépôt git** (comme `analysis.json`, `trash-origins.json`) — rien à ajouter au `.gitignore` (le chemin n'existe pas dans le dépôt).
- Les tests front posent les MÊMES providers que `main.tsx` (`AppStateProvider` ET `QueryClientProvider` ; `DragProvider` seulement si le drag est en jeu). Un hook `useMutation`/`useQuery` sans provider jette au rendu.
- Piège des mocks front : une route absente d'un mock `api.get` rend la branche de repli (health) — toute route nouvelle consommée par un composant rendu dans `App.test.tsx` y ajoute SA branche.
- `vi.fn(async () => ({}))` type chaque appel en tuple vide : **nommer les arguments** des mocks (`async (_chemin: string) => …`).
- Toute requête `api.get("/api/smartlists")` rend `{ items: SmartList[] }` — le patron des autres collections (`/api/tags`, `/api/collections`).
- Sabordage : la spec §7 exige DEUX sabotages (bouton de TopBar, navigation de la barre latérale) — réintroduire le défaut, voir le test échouer, revenir en arrière. Un test non sabordé n'est pas une couverture.
- Travailler sur `main`, committer par tâche, **ne pas pousser**. Terminer chaque message de commit par le trailer du modèle réellement actif (voir CLAUDE.md §Git).
- Vérification avant de dire « passant » : `npm test > /tmp/test.log 2>&1; rc=$?` puis lire `rc` — jamais `npm test | tail` (le code de sortie serait celui de `tail`).

---

### Task 1: Contrat partagé — types et codes d'erreur

**Files:**
- Modify: `shared/types.ts` (en fin de fichier, nouvelle section)
- Modify: `shared/errors.ts` (type `ErrorCode` + `STATUS_BY_CODE`)
- Test: `shared/errors.test.ts` (une assertion par nouveau code)

**Interfaces:**
- Produces: `SmartListView`, `SmartList` (consommés par TOUTES les tasks suivantes, sidecar et front) ; codes d'erreur `NOT_FOUND` (404) et `STOCKAGE` (500) — `errorStatus` les mappe comme les autres.

- [ ] **Step 1: Écrire le test qui échoue**

Dans `shared/errors.test.ts`, ajouter dans le `describe` existant :

```ts
    expect(errorStatus("NOT_FOUND")).toBe(404);
    expect(errorStatus("STOCKAGE")).toBe(500);
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run shared/errors.test.ts`
Expected: FAIL — la compilation signale les deux codes absents de `ErrorCode` (TS2345).

- [ ] **Step 3: Implémenter**

Dans `shared/errors.ts` — à l'union `ErrorCode`, ajouter deux membres avec leur commentaire :

```ts
  | "NOT_FOUND" // ressource locale inconnue (ex. id de smart list) — v1 : seules les smart lists l'émettent
  | "STOCKAGE"; // le dépôt local (app-data) n'a pas pu être écrit — la mémoire de l'utilisateur se signale, jamais un succès inventé
```

Dans `STATUS_BY_CODE`, ajouter :

```ts
  NOT_FOUND: 404,
  STOCKAGE: 500,
```

Dans `shared/types.ts`, en fin de fichier :

```ts
// ─── Smart lists (vues sauvegardées, spec 2026-09-22) ────────────────────────

/** La forme sérialisable d'une vue « list ». SEULS les champs définis sont
 *  stockés (JSON n'a pas de `undefined`) : une vue minimale « Tous » filtré
 *  est légale (collectionId seul). `viewMode` n'y figure PAS — un affichage
 *  n'est pas un filtre. */
export interface SmartListView {
  collectionId: number;
  notag?: boolean;
  search?: string;
  tags?: string[];
  sort?: string;
  domain?: string;
  media?: string;
  createdStart?: string;
  createdEnd?: string;
}

export interface SmartList {
  id: string; // `sl-…`, généré par le sidecar — stable à vie
  label: string; // 1-80 signes (zod des routes)
  vue: SmartListView;
  cree: string; // ISO 8601, posée par le sidecar
}
```

- [ ] **Step 4: Vérifier le passage**

Run: `npx vitest run shared/errors.test.ts && npm run typecheck`
Expected: PASS, typecheck vert (le typecheck couvre désormais tests compris — `tsconfig.check.json`).

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts shared/errors.ts shared/errors.test.ts
git commit -m "feat(shared): contrat smart lists — types de vue sérialisée et codes NOT_FOUND/STOCKAGE"
```

---

### Task 2: Le dépôt sidecar (`sidecar/smartlists/store.ts`)

**Files:**
- Create: `sidecar/smartlists/store.ts`
- Test: `sidecar/smartlists/store.test.ts`

**Interfaces:**
- Consumes: `SmartList`, `SmartListView` (Task 1) ; `repertoireTemporaire` (`sidecar/testing/tmp.js`, rend une `string`, un répertoire neuf par appel).
- Produces: `SmartListStore` — `list(): Promise<SmartList[]>`, `add({label, vue}): Promise<SmartList>`, `rename(id, label): Promise<SmartList | null>`, `remove(id): Promise<boolean>`. `makeSmartListStore({file})`. La Task 3 le déclare dans `SidecarDeps`.

- [ ] **Step 1: Écrire le test qui échoue**

`sidecar/smartlists/store.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { makeSmartListStore } from "./store.js";
import { repertoireTemporaire } from "../testing/tmp.js";

// repertoireTemporaire rend une STRING (pas une fabrique) : un répertoire
// neuf par appel, chaque test isole son fichier.
const depot = () => join(repertoireTemporaire("smartlists-"), "smartlists.json");
const vue = { collectionId: 0, tags: ["rust"] };

describe("SmartListStore", () => {
  it("crée : id généré par le store (préfixe sl-), date posée, list() le rend", async () => {
    const store = makeSmartListStore({ file: depot() });
    const sl = await store.add({ label: "Rust", vue });
    expect(sl.id).toMatch(/^sl-/);
    expect(sl.cree).not.toBe("");
    expect(sl.label).toBe("Rust");
    const items = await store.list();
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe(sl.id);
  });

  it("deux créations donnent deux identifiants distincts, l'ordre est celui de la création", async () => {
    const store = makeSmartListStore({ file: depot() });
    const a = await store.add({ label: "A", vue });
    const b = await store.add({ label: "B", vue });
    expect(a.id).not.toBe(b.id);
    const items = await store.list();
    expect(items.map((s) => s.label)).toEqual(["A", "B"]);
  });

  it("renomme (les autres champs intacts) ; id inconnu → null", async () => {
    const store = makeSmartListStore({ file: depot() });
    const sl = await store.add({ label: "Rust", vue });
    const maj = await store.rename(sl.id, "Rust web");
    expect(maj).toMatchObject({ id: sl.id, label: "Rust web" });
    expect((await store.list())[0]!.vue).toEqual(vue);
    expect(await store.rename("sl-inconnu", "x")).toBeNull();
  });

  it("supprime ; id inconnu → false", async () => {
    const store = makeSmartListStore({ file: depot() });
    const sl = await store.add({ label: "Rust", vue });
    expect(await store.remove(sl.id)).toBe(true);
    expect(await store.list()).toEqual([]);
    expect(await store.remove(sl.id)).toBe(false);
  });

  // Le patron du dépôt (spec §3, §5 d'origins.ts) : absent ou corrompu =
  // liste vide — l'app ne casse pas, la section barre latérale dit son état.
  it("fichier illisible → liste vide", async () => {
    const file = depot();
    await writeFile(file, "{ pas du json", "utf8");
    const store = makeSmartListStore({ file });
    expect(await store.list()).toEqual([]);
  });

  it("persiste réellement : un second store sur le même fichier lit les vues du premier", async () => {
    const file = depot();
    const premier = makeSmartListStore({ file });
    const sl = await premier.add({ label: "Rust", vue });
    const second = makeSmartListStore({ file });
    const items = await second.list();
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe(sl.id);
    // Et une écriture du second ne rejoue pas l'état du premier.
    await second.rename(sl.id, "Autre");
    expect((await premier.list())[0]!.label).toBe("Rust"); // instance mémoire inchangée
    expect((await makeSmartListStore({ file }).list())[0]!.label).toBe("Autre");
  });

  // Contrairement aux origines de corbeille (perte dégradée assumée), un
  // échec d'écriture ICI rejette : une création « réussie » mais non écrite
  // serait le succès inventé que le projet traque (défaut bulk -99).
  it("échec d'écriture → add rejette (jamais un succès inventé)", async () => {
    // Le répertoire parent n'existe pas : le writeFile du tmp échoue.
    const store = makeSmartListStore({ file: "/dev/null/impossible/smartlists.json" });
    await expect(store.add({ label: "X", vue })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run sidecar/smartlists/store.test.ts`
Expected: FAIL — le module `./store.js` n'existe pas.

- [ ] **Step 3: Implémenter**

`sidecar/smartlists/store.ts` :

```ts
import { readFile, writeFile, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { SmartList, SmartListView } from "../../shared/types.js";

/**
 * Dépôt des vues sauvegardées (spec 2026-09-22) : un JSON en app-data, au
 * patron de trash-origins.json — fichier absent ou illisible = liste vide,
 * jamais une erreur remontée au front (la section barre latérale dit son
 * état). Écritures sérialisées (deux tmp+rename entrelacés peuvent publier
 * un contenu plus ancien — flake du plan 1, patron logger.ts).
 *
 * UN écart assumé avec origins.ts : un échec disque ICI rejette. Les
 * origines de corbeille sont un cache d'accompagnement (§11 : perte
 * dégradée) ; les vues sauvegardées sont la mémoire de l'utilisateur — une
 * création répondue 200 mais non écrite serait un succès inventé.
 */

interface FichierSmartLists {
  version: 1;
  smartlists: SmartList[];
}

export interface SmartListStore {
  list(): Promise<SmartList[]>;
  /** Crée : le store pose l'id (stable, généré ici) et la date — le front
   *  n'a pas voix dessus (spec §3). */
  add(v: { label: string; vue: SmartListView }): Promise<SmartList>;
  rename(id: string, label: string): Promise<SmartList | null>;
  remove(id: string): Promise<boolean>;
}

export function makeSmartListStore(opts: { file: string }): SmartListStore {
  let data: SmartList[] = [];
  let loaded: Promise<void> | null = null;

  const load = async (): Promise<void> => {
    try {
      const parsed = JSON.parse(await readFile(opts.file, "utf8")) as FichierSmartLists;
      if (parsed.version === 1 && Array.isArray(parsed.smartlists)) data = [...parsed.smartlists];
    } catch {
      data = []; // absent ou corrompu → liste vide (patron du dépôt)
    }
  };
  const ensureLoaded = (): Promise<void> => (loaded ??= load());

  let chain: Promise<unknown> = Promise.resolve();
  const persist = (): Promise<void> => {
    const task = chain.then(() => {
      const tmp = `${opts.file}.tmp`;
      return writeFile(tmp, JSON.stringify({ version: 1, smartlists: data } satisfies FichierSmartLists), "utf8").then(
        () => rename(tmp, opts.file),
      );
    });
    chain = task.catch(() => undefined); // la file survit à un échec ; l'appelant VOIT le rejet
    return task;
  };

  return {
    async list() {
      await ensureLoaded();
      return [...data];
    },
    async add(v) {
      await ensureLoaded();
      const sl: SmartList = {
        id: `sl-${randomUUID()}`,
        label: v.label,
        vue: { ...v.vue },
        cree: new Date().toISOString(),
      };
      data = [...data, sl];
      await persist();
      return sl;
    },
    async rename(id, label) {
      await ensureLoaded();
      const sl = data.find((s) => s.id === id);
      if (!sl) return null;
      data = data.map((s) => (s.id === id ? { ...s, label } : s));
      await persist();
      return { ...sl, label };
    },
    async remove(id) {
      await ensureLoaded();
      if (!data.some((s) => s.id === id)) return false;
      data = data.filter((s) => s.id !== id);
      await persist();
      return true;
    },
  };
}
```

- [ ] **Step 4: Vérifier le passage**

Run: `npx vitest run sidecar/smartlists/store.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sidecar/smartlists/store.ts sidecar/smartlists/store.test.ts
git commit -m "feat(sidecar): dépôt des vues sauvegardées — JSON app-data, liste vide si illisible, échec disque honnête"
```

---

### Task 3: Les routes `/api/smartlists` et le câblage du sidecar

**Files:**
- Create: `sidecar/api/routes/smartlists.ts`
- Test: `sidecar/api/routes/smartlists.test.ts`
- Modify: `sidecar/api/deps.ts` (champ `smartlists` obligatoire)
- Modify: `sidecar/api/app.ts` (monter `/api/smartlists`)
- Modify: `sidecar/index.ts` (instancier le store, ~ligne 77 après `origins`)
- Modify: 11 fichiers de test qui construisent des deps littéraux (liste au Step 6)

**Interfaces:**
- Consumes: `SmartListStore` (Task 2), `apiError` + code `STOCKAGE`/`NOT_FOUND` (Task 1).
- Produces: routes `GET /api/smartlists` → `{items}`, `POST` `{label, vue}` → `SmartList` (id et `cree` posés par le sidecar), `PATCH /:id` `{label}` → `SmartList`, `DELETE /:id` → `{result: true}`. Validation zod : nom non vide ≤ 80 ; `vue.collectionId` nombre requis, autres champs optionnels.

- [ ] **Step 1: Écrire le test qui échoue**

`sidecar/api/routes/smartlists.test.ts` — patron de `journal.test.ts` (createApp + deps littéraux + `req`) :

```ts
import { describe, it, expect } from "vitest";
import { createApp } from "../app.js";
import type { SidecarDeps } from "../deps.js";
import { makeSmartListStore } from "../../smartlists/store.js";
import { JobStore } from "../../jobs/store.js";
import { repertoireTemporaire } from "../../testing/tmp.js";

const TOKEN = "t";

const deps = (): SidecarDeps => ({
  mcp: async () => ({ ok: true as const, data: {} }),
  state: () => "connected",
  restart: async () => undefined,
  jobs: new JobStore(),
  cache: {} as SidecarDeps["cache"],
  scanner: {} as SidecarDeps["scanner"],
  origins: {} as SidecarDeps["origins"],
  smartlists: makeSmartListStore({ file: `${repertoireTemporaire("sl-route-")}/smartlists.json` }),
  direct: {} as SidecarDeps["direct"],
  journal: { info: () => undefined, warn: () => undefined, error: () => undefined },
  logsDir: repertoireTemporaire("sl-logs-"),
});

// Chaque test a SON app (donc SON dépôt neuf) : les requêtes ne se
// contaminent pas.
const req = async (
  method: string,
  path: string,
  corps?: unknown,
): Promise<Response> => {
  const app = createApp(deps(), { localToken: TOKEN });
  return app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(corps !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: corps !== undefined ? JSON.stringify(corps) : undefined,
  });
};

describe("/api/smartlists", () => {
  it("POST crée : id préfixé sl-, cree posée, le front n'a pas voix dessus", async () => {
    const res = await req("POST", "/api/smartlists", { label: "Rust", vue: { collectionId: 0, tags: ["rust"] } });
    expect(res.status).toBe(200);
    const sl = (await res.json()) as { id: string; label: string; cree: string; vue: { collectionId: number } };
    expect(sl.id).toMatch(/^sl-/);
    expect(sl.cree).not.toBe("");
    expect(sl.vue).toEqual({ collectionId: 0, tags: ["rust"] });
  });

  it("GET rend la collection au format {items}", async () => {
    await req("POST", "/api/smartlists", { label: "Rust", vue: { collectionId: 0 } });
    await req("POST", "/api/smartlists", { label: "Design", vue: { collectionId: 101, search: "affiche" } });
    const res = await req("GET", "/api/smartlists");
    expect(res.status).toBe(200);
    const corps = (await res.json()) as { items: { label: string }[] };
    expect(corps.items.map((s) => s.label)).toEqual(["Rust", "Design"]);
  });

  it("PATCH renomme ; id inconnu → 404 NOT_FOUND", async () => {
    const cree = (await (await req("POST", "/api/smartlists", { label: "Rust", vue: { collectionId: 0 } })).json()) as { id: string };
    const maj = await req("PATCH", `/api/smartlists/${cree.id}`, { label: "Rust web" });
    expect(maj.status).toBe(200);
    expect(((await maj.json()) as { label: string }).label).toBe("Rust web");
    // La modification persiste : un GET neuf la lit.
    const liste = (await (await req("GET", "/api/smartlists")).json()) as { items: { label: string }[] };
    expect(liste.items[0]!.label).toBe("Rust web");

    const inconnu = await req("PATCH", "/api/smartlists/sl-inconnu", { label: "x" });
    expect(inconnu.status).toBe(404);
    expect(((await inconnu.json()) as { error: { code: string } }).error.code).toBe("NOT_FOUND");
  });

  it("DELETE supprime ; id inconnu → 404", async () => {
    const cree = (await (await req("POST", "/api/smartlists", { label: "Rust", vue: { collectionId: 0 } })).json()) as { id: string };
    expect((await req("DELETE", `/api/smartlists/${cree.id}`)).status).toBe(200);
    const liste = (await (await req("GET", "/api/smartlists")).json()) as { items: unknown[] };
    expect(liste.items).toEqual([]);
    expect((await req("DELETE", `/api/smartlists/${cree.id}`)).status).toBe(404);
  });

  it("zod refuse : nom vide, nom de 81 signes, vue sans collectionId", async () => {
    const vide = await req("POST", "/api/smartlists", { label: "   ", vue: { collectionId: 0 } });
    expect(vide.status).toBe(400);
    const long = await req("POST", "/api/smartlists", { label: "a".repeat(81), vue: { collectionId: 0 } });
    expect(long.status).toBe(400);
    const sansVue = await req("POST", "/api/smartlists", { label: "Rust", vue: { tags: ["rust"] } });
    expect(sansVue.status).toBe(400);
    const corpsSansCollectionId = (await (await req("GET", "/api/smartlists")).json()) as { items: unknown[] };
    expect(corpsSansCollectionId.items).toEqual([]);
  });

  it("une vue minimale « Tous » filtré est légale (collectionId seul)", async () => {
    const res = await req("POST", "/api/smartlists", { label: "Tous", vue: { collectionId: 0 } });
    expect(res.status).toBe(200);
    const sl = (await res.json()) as { vue: Record<string, unknown> };
    expect(Object.keys(sl.vue)).toEqual(["collectionId"]);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run sidecar/api/routes/smartlists.test.ts`
Expected: FAIL — `./smartlists/store.js` existe (Task 2) mais `SidecarDeps` n'a pas `smartlists` (TS2353 sur le deps littéral).

- [ ] **Step 3: Implémenter les routes**

`sidecar/api/routes/smartlists.ts` :

```ts
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { apiError } from "../../../shared/errors.js";
import type { SidecarDeps } from "../deps.js";

// La vue reçue exige collectionId (nombre), le reste est optionnel — la
// forme sérialisable d'une vue "list" (spec §3). Le front n'envoie jamais
// les champs vides : le zod les tolérerait, le contrat ne les produit pas.
const vueSchema = z.object({
  collectionId: z.number(),
  notag: z.boolean().optional(),
  search: z.string().optional(),
  tags: z.array(z.string()).optional(),
  sort: z.string().optional(),
  domain: z.string().optional(),
  media: z.string().optional(),
  createdStart: z.string().optional(),
  createdEnd: z.string().optional(),
});

// Une smart list n'est pas un dépotoir : nom non vide, 80 signes (spec §3).
const nomSchema = z.string().trim().min(1).max(80);

/** L'échec du dépôt local se NOMME (STOCKAGE), jamais une 500 nue — et
 *  jamais un 200 alors que rien n'a été écrit (succès inventé). */
const sousStockage = async (c: Context, fn: () => Promise<Response>): Promise<Response> => {
  try {
    return await fn();
  } catch (e) {
    return apiError(c, "STOCKAGE", e instanceof Error ? e.message : String(e));
  }
};

export function smartlistsRoutes(deps: SidecarDeps): Hono {
  const app = new Hono();

  app.get("/", (c) => sousStockage(c, async () => c.json({ items: await deps.smartlists.list() })));

  app.post("/", (c) =>
    sousStockage(c, async () => {
      const body = z
        .object({ label: nomSchema, vue: vueSchema })
        .safeParse(await c.req.json().catch(() => null));
      if (!body.success) return apiError(c, "INVALID_INPUT", "label (1-80 signes) et vue (collectionId requis) attendus");
      return c.json(await deps.smartlists.add(body.data));
    }),
  );

  app.patch("/:id", (c) =>
    sousStockage(c, async () => {
      const body = z.object({ label: nomSchema }).safeParse(await c.req.json().catch(() => null));
      if (!body.success) return apiError(c, "INVALID_INPUT", "label (1-80 signes) attendu");
      const maj = await deps.smartlists.rename(c.req.param("id"), body.data.label);
      if (!maj) return apiError(c, "NOT_FOUND", "vue sauvegardée inconnue");
      return c.json(maj);
    }),
  );

  app.delete("/:id", (c) =>
    sousStockage(c, async () => {
      const fait = await deps.smartlists.remove(c.req.param("id"));
      if (!fait) return apiError(c, "NOT_FOUND", "vue sauvegardée inconnue");
      return c.json({ result: true });
    }),
  );

  return app;
}
```

- [ ] **Step 4: Câbler le sidecar**

`sidecar/api/deps.ts` — dans `SidecarDeps`, après `origins` :

```ts
  /** Dépôt des vues sauvegardées (spec 2026-09-22) — toujours présent :
   *  le JSON en app-data n'a pas de condition d'activation. */
  smartlists: SmartListStore;
```

et l'import en tête : `import type { SmartListStore } from "../smartlists/store.js"; // spec 2026-09-22`

`sidecar/api/app.ts` — import puis montage (après `/api/journal`) :

```ts
import { smartlistsRoutes } from "./routes/smartlists.js";
```
```ts
  // Vues sauvegardées (smart lists, 2026-09-22) : CRUD local, aucun appel
  // Raindrop — le fichier vit en app-data.
  app.route("/api/smartlists", smartlistsRoutes(deps));
```

`sidecar/index.ts` — après la création d'`origins` (~ligne 77) :

```ts
// Vues sauvegardées (spec 2026-09-22) : même patron de dépôt local que les
// origines de corbeille — fichier en app-data, hors du dépôt git.
const smartlists = makeSmartListStore({ file: join(dataDir, "smartlists.json") });
```
l'import en tête : `import { makeSmartListStore } from "./smartlists/store.js";`
et dans l'objet `deps`, à côté de `origins` : `smartlists,`

- [ ] **Step 5: Vérifier le passage des tests de route et du typecheck**

Run: `npx vitest run sidecar/api/routes/smartlists.test.ts && npm run typecheck`
Expected: les tests PASS ; le typecheck signale `smartlists` manquant dans les deps littéraux des tests existants (TS2353) — c'est le Step 6.

- [ ] **Step 6: Compléter les deps littéraux des tests existants**

Ajouter `smartlists: {} as SidecarDeps["smartlists"],` (à côté de la ligne `origins:`) dans les onze fichiers de test qui construisent un `SidecarDeps` littéral — aucun n'appelle `/api/smartlists`, le cast suffit (patron établi) :

`sidecar/api/routes/collections.test.ts`, `sidecar/api/routes/misc.test.ts`, `sidecar/api/routes/sauvegarde.test.ts`, `sidecar/api/routes/journal.test.ts`, `sidecar/api/routes/raindrops.unrestore.test.ts`, `sidecar/api/routes/analysis.test.ts`, `sidecar/api/app.test.ts`, `sidecar/api/routes/sauvegarde.lecture.test.ts`, `sidecar/api/routes/raindrops.test.ts`, `sidecar/api/routes/jobs.test.ts`, `sidecar/api/routes/raindrops.lecture.test.ts`.

- [ ] **Step 7: Vérifier le passage complet**

Run: `npm test > /tmp/test-smartlists-t3.log 2>&1; echo "rc=$?"; tail -5 /tmp/test-smartlists-t3.log`
Expected: `rc=0` — la suite complète est verte (typecheck compris dans `npm test` ? non : typecheck séparé) — puis `npm run typecheck` : vert.

- [ ] **Step 8: Commit**

```bash
git add sidecar/api/routes/smartlists.ts sidecar/api/routes/smartlists.test.ts sidecar/api/deps.ts sidecar/api/app.ts sidecar/index.ts
git add sidecar/api/routes/*.test.ts sidecar/api/app.test.ts
git commit -m "feat(sidecar): routes /api/smartlists — CRUD zod, NOT_FOUND sur id inconnu, STOCKAGE sur échec de dépôt"
```

---

### Task 4: Le module front de sérialisation (`src/lib/smartlists.ts`)

**Files:**
- Create: `src/lib/smartlists.ts`
- Test: `src/lib/smartlists.test.ts`

**Interfaces:**
- Consumes: `canoniser` (`src/hooks/filtreEtiquettes.ts`), types `View` (appState), `SmartList`/`SmartListView` (Task 1).
- Produces: `filtreActif(view: View): boolean` ; `serialiserVue(view: ListView): SmartListView` ; `vueVersView(sl: SmartList): View`. Les Tasks 5, 7 et 8 consomment ces trois fonctions.

- [ ] **Step 1: Écrire le test qui échoue**

`src/lib/smartlists.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { filtreActif, serialiserVue, vueVersView } from "./smartlists";
import type { SmartList } from "../../shared/types";
import type { View } from "../state/appState";

const liste = (plus: Partial<Extract<View, { kind: "list" }>> = {}): View => ({
  kind: "list", collectionId: 0, label: "Tous", ...plus,
});

describe("filtreActif", () => {
  // Un cas par filtre (spec §4) : étiquettes, recherche, domaine, dates,
  // nature, non-taggés.
  it.each([
    ["étiquettes", { tags: ["rust"] }],
    ["recherche", { search: "rust" }],
    ["domaine", { domain: "example.com" }],
    ["date début", { createdStart: "2025-01-01" }],
    ["date fin", { createdEnd: "2025-12-31" }],
    ["nature", { media: "article" }],
    ["non-taggés", { notag: true }],
  ])("actif avec %s", (_nom, plus) => {
    expect(filtreActif(liste(plus))).toBe(true);
  });

  it("inactif sans filtre — le TRI seul ne compte pas (spec §4)", () => {
    expect(filtreActif(liste())).toBe(false);
    expect(filtreActif(liste({ sort: "title" }))).toBe(false);
    // Un affichage n'est pas un filtre.
    expect(filtreActif(liste({ viewMode: "mosaic" }))).toBe(false);
  });

  it("inactif hors vue list — le bouton n'existe qu'aux listes", () => {
    expect(filtreActif({ kind: "cleanup" })).toBe(false);
  });
});

describe("serialiserVue", () => {
  it("ne stocke QUE les champs définis : JSON n'a pas de undefined", () => {
    const vue = serialiserVue(liste({ collectionId: 101, tags: ["rust"], sort: "-created" }));
    expect(vue).toEqual({ collectionId: 101, tags: ["rust"], sort: "-created" });
    expect("search" in vue).toBe(false);
    expect("notag" in vue).toBe(false);
  });

  it("canonise les étiquettes (même forme que listQueryArgs)", () => {
    const vue = serialiserVue(liste({ tags: ["webdesign", "code", "WebDesign", " "] }));
    // Dédoublonnage à la casse (WebDesign ignoré), vide sorti, trié (canoniser).
    expect(vue.tags).toEqual(["code", "webdesign"]);
  });
});

describe("vueVersView", () => {
  const sl: SmartList = {
    id: "sl-1",
    label: "Rust dans Dev",
    vue: { collectionId: 101, tags: ["rust", "RUST"], search: "borrows", sort: "title" },
    cree: "2026-09-22T10:00:00Z",
  };

  it("rejette la vue stockée dans le View : identifiant, label, filtres", () => {
    const view = vueVersView(sl);
    // Les étiquettes sont canonisées : ["rust", "RUST"] dédoublonné à la
    // casse (première occurrence gardée) → ["rust"].
    expect(view).toEqual({
      kind: "list",
      collectionId: 101,
      label: "Rust dans Dev",
      smartlistId: "sl-1",
      tags: ["rust"],
      search: "borrows",
      sort: "title",
    });
  });

  it("une vue minimale (collectionId seul) produit une vue list sans filtre", () => {
    const view = vueVersView({ id: "sl-2", label: "Tous", vue: { collectionId: 0 }, cree: "2026-09-22T10:00:00Z" });
    expect(view).toEqual({ kind: "list", collectionId: 0, label: "Tous", smartlistId: "sl-2" });
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run src/lib/smartlists.test.ts`
Expected: FAIL — le module n'existe pas.

- [ ] **Step 3: Implémenter**

`src/lib/smartlists.ts` :

```ts
import { canoniser } from "./filtreEtiquettes";
import type { SmartList, SmartListView } from "../../shared/types";
import type { View } from "../state/appState";

type ListView = Extract<View, { kind: "list" }>;

/** Au moins un filtre actif ? (spec §4 : le geste « Sauvegarder la vue »
 *  n'existe qu'ici.) Le TRI seul ne compte pas — « Tous triés par titre »
 *  n'est pas une smart list — mais il voyage avec la vue stockée. `viewMode`
 *  non plus : un affichage n'est pas un filtre. */
export function filtreActif(view: View): boolean {
  return (
    view.kind === "list" &&
    (view.notag === true ||
      (view.search !== undefined && view.search.trim() !== "") ||
      (view.tags?.length ?? 0) > 0 ||
      view.domain !== undefined ||
      view.createdStart !== undefined ||
      view.createdEnd !== undefined ||
      view.media !== undefined)
  );
}

/** La vue courante en forme sérialisable : seuls les champs DÉFINIS partent
 *  (JSON n'a pas de undefined), les étiquettes canonisées — la clé de cache
 *  de useRaindrops hache la liste entière : deux formes d'un même filtre
 *  feraient deux entrées de cache (trap 2026-09-19). */
export function serialiserVue(view: ListView): SmartListView {
  return {
    collectionId: view.collectionId,
    ...(view.notag === true ? { notag: true } : {}),
    ...(view.search !== undefined && view.search.trim() !== "" ? { search: view.search } : {}),
    ...(view.tags !== undefined && view.tags.length > 0 ? { tags: canoniser(view.tags) } : {}),
    ...(view.sort !== undefined ? { sort: view.sort } : {}),
    ...(view.domain !== undefined ? { domain: view.domain } : {}),
    ...(view.media !== undefined ? { media: view.media } : {}),
    ...(view.createdStart !== undefined ? { createdStart: view.createdStart } : {}),
    ...(view.createdEnd !== undefined ? { createdEnd: view.createdEnd } : {}),
  };
}

/** La vue stockée rejetée telle quelle dans le View par le clic de la barre
 *  latérale — `listQueryArgs` fait le reste : c'est lui, notre parser (spec
 *  §3). Re-canonisation défensive des étiquettes : le JSON est écrit par
 *  nous, mais la clé de cache exige la forme canonique. */
export function vueVersView(sl: SmartList): View {
  const v = sl.vue;
  return {
    kind: "list",
    collectionId: v.collectionId,
    label: sl.label,
    smartlistId: sl.id,
    ...(v.notag === true ? { notag: true } : {}),
    ...(v.search !== undefined ? { search: v.search } : {}),
    ...(v.tags !== undefined && v.tags.length > 0 ? { tags: canoniser(v.tags) } : {}),
    ...(v.sort !== undefined ? { sort: v.sort } : {}),
    ...(v.domain !== undefined ? { domain: v.domain } : {}),
    ...(v.media !== undefined ? { media: v.media } : {}),
    ...(v.createdStart !== undefined ? { createdStart: v.createdStart } : {}),
    ...(v.createdEnd !== undefined ? { createdEnd: v.createdEnd } : {}),
  };
}
```

- [ ] **Step 4: Vérifier le passage**

Run: `npx vitest run src/lib/smartlists.test.ts && npm run typecheck:front`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/smartlists.ts src/lib/smartlists.test.ts
git commit -m "feat(front): sérialisation des vues — filtreActif, serialiserVue, vueVersView (le parser reste listQueryArgs)"
```

---

### Task 5: L'état — `smartlistId` sur la vue, effacé au patch, action `forgetSmartList`

**Files:**
- Modify: `src/state/appState.tsx` (union `View` « list », reducer, contexte)
- Test: `src/state/appState.test.tsx` (nouveau)

**Interfaces:**
- Consumes: rien (état pur).
- Produces: `smartlistId?: string` sur le `View` « list » ; `forgetSmartList(id: string): void` dans le contexte `useAppState`. Contrats testés : TOUT patch de filtre efface `smartlistId` (seul `viewMode` survit) ; `forgetSmartList` efface la marque sans toucher aux filtres. Tasks 7 et 8 consomment.

- [ ] **Step 1: Écrire le test qui échoue**

`src/state/appState.test.tsx` :

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppStateProvider, useAppState, type View } from "./appState";

// Harnais : des boutons qui déclenchent les actions, un Spy qui montre la
// vue — les tests lisent l'EFFET (la vue), jamais l'état interne.
const liste: View = {
  kind: "list", collectionId: 0, label: "Rust",
  tags: ["rust"], search: "borrows", smartlistId: "sl-1",
};

const Harnais = () => {
  const { view, patchList, forgetSmartList } = useAppState();
  return (
    <div>
      <span data-testid="view">{JSON.stringify(view)}</span>
      <button type="button" onClick={() => patchList({ search: "x" })}>patch-filtre</button>
      <button type="button" onClick={() => patchList({ viewMode: "mosaic" })}>patch-mode</button>
      <button type="button" onClick={() => forgetSmartList("sl-1")}>oublie-bonne</button>
      <button type="button" onClick={() => forgetSmartList("sl-autre")}>oublie-autre</button>
    </div>
  );
};

const vue = () => JSON.parse(screen.getByTestId("view").textContent!) as Record<string, unknown>;

const renderHarnais = (initiale: View) => {
  const Ouverture = () => {
    const { go } = useAppState();
    return <button type="button" onClick={() => go(initiale)}>ouvre</button>;
  };
  render(<AppStateProvider><Ouverture /><Harnais /></AppStateProvider>);
  return userEvent.click(screen.getByText("ouvre"));
};

describe("smartlistId dans l'état", () => {
  it("le go porte l'identifiant", async () => {
    await renderHarnais(liste);
    expect(vue()).toMatchObject({ smartlistId: "sl-1", tags: ["rust"] });
  });

  // « La surlignage ne survit pas à la divergence » (spec §5) : tout patch
  // de filtre efface la marque — la vue n'est plus LA smart list.
  it("un patch de filtre efface smartlistId, les filtres restent", async () => {
    await renderHarnais(liste);
    await userEvent.click(screen.getByText("patch-filtre"));
    const v = vue();
    expect(v.smartlistId).toBeUndefined();
    expect(v.tags).toEqual(["rust"]); // les filtres restent : c'est une vue, pas un fichier
  });

  // La bascule d'affichage n'est pas un filtre : la vue reste la smart list.
  it("un patch viewMode seul GARDE smartlistId", async () => {
    await renderHarnais(liste);
    await userEvent.click(screen.getByText("patch-mode"));
    expect(vue()).toMatchObject({ smartlistId: "sl-1", viewMode: "mosaic" });
  });

  // Supprimer la smart list ouverte : la liste filtrée reste, la marque
  // s'en va (spec §5). Une autre id supprimée ne touche à rien.
  it("forgetSmartList de la vue ouverte efface la marque ; une autre id est sans effet", async () => {
    await renderHarnais(liste);
    await userEvent.click(screen.getByText("oublie-autre"));
    expect(vue()).toMatchObject({ smartlistId: "sl-1" });
    await userEvent.click(screen.getByText("oublie-bonne"));
    const v = vue();
    expect(v.smartlistId).toBeUndefined();
    expect(v.search).toBe("borrows");
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run src/state/appState.test.tsx`
Expected: FAIL — `smartlistId` absent de l'union (TS2353 dans le test) et/ou `forgetSmartList` introuvable dans le contexte.

- [ ] **Step 3: Implémenter**

Dans `src/state/appState.tsx` :

1. Dans l'union `View`, variante « list », après `createdEnd?: string;` :

```ts
      // Smart list ouverte (spec 2026-09-22) : l'identifiant PORTE la
      // surlignage de la barre latérale — jamais une heuristique de label.
      // Le reducer l'efface à tout patch de filtre (la vue diverge, l'entrée
      // n'est plus « la » smart list) et à forgetSmartList (vue supprimée).
      smartlistId?: string;
```

2. Dans l'union `Action`, ajouter : `| { type: "forgetSmartList"; id: string }`.

3. Dans `reducer`, REMPLACER la ligne du patch par :

```ts
  if (a.type === "patch" && s.view.kind === "list") {
    // La bascule d'affichage n'est pas un filtre : la vue reste la smart
    // list (spec §5 — la marque ne survit qu'à viewMode).
    const filtreBouge = Object.keys(a.patch).some((k) => k !== "viewMode");
    return { ...s, view: { ...s.view, ...a.patch, ...(filtreBouge ? { smartlistId: undefined } : {}) } };
  }
  if (a.type === "forgetSmartList" && s.view.kind === "list" && s.view.smartlistId === a.id) {
    // La smart list ouverte a été supprimée : la liste filtrée reste —
    // ce sont des filtres, pas un fichier (spec §5).
    return { ...s, view: { ...s.view, smartlistId: undefined } };
  }
```

4. Dans le type du contexte ET la valeur par défaut, ajouter `forgetSmartList: (id: string) => void` (défaut : `() => undefined`) ; dans `AppStateProvider`, `forgetSmartList: (id) => dispatch({ type: "forgetSmartList", id })`.

- [ ] **Step 4: Vérifier le passage**

Run: `npx vitest run src/state/appState.test.tsx && npm run typecheck:front`
Expected: PASS — et la suite front entière reste verte (le champ est optionnel : aucun composant existant ne change).

Run: `npx vitest run src`
Expected: 0 échec.

- [ ] **Step 5: Commit**

```bash
git add src/state/appState.tsx src/state/appState.test.tsx
git commit -m "feat(front): smartlistId sur la vue list — effacé au patch de filtre, forgetSmartList à la suppression"
```

---

### Task 6: Les hooks `src/hooks/useSmartLists.ts`

**Files:**
- Create: `src/hooks/useSmartLists.ts`
- Test: `src/hooks/useSmartLists.test.tsx`

**Interfaces:**
- Consumes: `api` (`src/lib/api`), `useInvalidate` (`src/hooks/useMutations`), types Task 1.
- Produces: `useSmartLists()` (useQuery, clé `["smartlists"]`, rend `SmartList[] | undefined`) ; `useCreerSmartList()` (POST `{label, vue}`) ; `useRenommerSmartList()` (PATCH `{id, label}`) ; `useSupprimerSmartList()` (DELETE `{id}`). Chaque mutation invalide `["smartlists"]`. Tasks 7 et 8 consomment.

- [ ] **Step 1: Écrire le test qui échoue**

`src/hooks/useSmartLists.test.tsx` :

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { useSmartLists, useCreerSmartList, useRenommerSmartList, useSupprimerSmartList } from "./useSmartLists";
import type { SmartList } from "../../shared/types";

const getMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/api", () => ({ api: { get: getMock, send: sendMock } }));

const sl = (champs: Partial<SmartList>): SmartList => ({
  id: "sl-1", label: "Rust", vue: { collectionId: 0, tags: ["rust"] }, cree: "2026-09-22T10:00:00Z", ...champs,
});

// Harnais : rend la liste et expose les trois mutations par boutons — le
// contrat testé est l'appel réseau et l'invalidation, pas le composant.
const Harnais = () => {
  const { data, refetch } = useSmartLists();
  const creer = useCreerSmartList();
  const renommer = useRenommerSmartList();
  const supprimer = useSupprimerSmartList();
  return (
    <div>
      <ul>{(data ?? []).map((s) => <li key={s.id}>{s.label}</li>)}</ul>
      <button type="button" onClick={() => void refetch()}>refetch</button>
      <button type="button" onClick={() => creer.mutate({ label: "Nouvelle", vue: { collectionId: 0 } })}>creer</button>
      <button type="button" onClick={() => renommer.mutate({ id: "sl-1", label: "Autre nom" })}>renommer</button>
      <button type="button" onClick={() => supprimer.mutate("sl-1")}>supprimer</button>
    </div>
  );
};

const rendre = () =>
  render(<QueryClientProvider client={new QueryClient()}><Harnais /></QueryClientProvider>);

beforeEach(() => {
  getMock.mockReset();
  sendMock.mockReset().mockResolvedValue({});
  getMock.mockResolvedValue({ items: [sl({})] });
});

describe("useSmartLists", () => {
  it("GET /api/smartlists rend les items", async () => {
    rendre();
    expect(await screen.findByText("Rust")).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith("/api/smartlists");
  });

  it("creer → POST portant label et vue", async () => {
    rendre();
    await userEvent.click(screen.getByText("creer"));
    await waitFor(() => expect(sendMock).toHaveBeenCalledWith("POST", "/api/smartlists", { label: "Nouvelle", vue: { collectionId: 0 } }));
  });

  it("renommer → PATCH /:id portant le label", async () => {
    rendre();
    await userEvent.click(screen.getByText("renommer"));
    await waitFor(() => expect(sendMock).toHaveBeenCalledWith("PATCH", "/api/smartlists/sl-1", { label: "Autre nom" }));
  });

  it("supprimer → DELETE /:id", async () => {
    rendre();
    await userEvent.click(screen.getByText("supprimer"));
    await waitFor(() => expect(sendMock).toHaveBeenCalledWith("DELETE", "/api/smartlists/sl-1"));
  });

  // L'invalidation est le contrat silencieux : après une écriture, le GET
  // est rejoué (sinon l'entrée n'apparaît qu'au prochain refetch indirect).
  it("une écriture invalide la requête : le GET est rejoué", async () => {
    rendre();
    expect(await screen.findByText("Rust")).toBeInTheDocument();
    getMock.mockResolvedValue({ items: [] }); // l'état APRÈS suppression
    await userEvent.click(screen.getByText("supprimer"));
    await waitFor(() => expect(getMock.mock.calls.length).toBeGreaterThan(1));
    await waitFor(() => expect(screen.queryByText("Rust")).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run src/hooks/useSmartLists.test.tsx`
Expected: FAIL — le module n'existe pas.

- [ ] **Step 3: Implémenter**

`src/hooks/useSmartLists.ts` :

```ts
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useInvalidate } from "./useMutations";
import type { SmartList, SmartListView } from "../../shared/types";

// Le répertoire des vues sauvegardées (spec 2026-09-22) : un JSON local,
// le GET est bon marché — chaque écriture invalide la clé entière, pas de
// mise à jour optimiste à maintenir.

export const useSmartLists = () =>
  useQuery({
    queryKey: ["smartlists"],
    queryFn: () => api.get<{ items: SmartList[] }>("/api/smartlists").then((r) => r.items),
  });

export const useCreerSmartList = () => {
  const invalidate = useInvalidate();
  return useMutation({
    // Le sidecar pose id et cree — le front n'a pas voix dessus (spec §3).
    mutationFn: (v: { label: string; vue: SmartListView }) =>
      api.send<SmartList>("POST", "/api/smartlists", v),
    onSuccess: () => invalidate("smartlists"),
  });
};

export const useRenommerSmartList = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { id: string; label: string }) =>
      api.send<SmartList>("PATCH", `/api/smartlists/${v.id}`, { label: v.label }),
    onSuccess: () => invalidate("smartlists"),
  });
};

export const useSupprimerSmartList = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.send("DELETE", `/api/smartlists/${id}`),
    onSuccess: () => invalidate("smartlists"),
  });
};
```

- [ ] **Step 4: Vérifier le passage**

Run: `npx vitest run src/hooks/useSmartLists.test.tsx && npm run typecheck:front`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSmartLists.ts src/hooks/useSmartLists.test.tsx
git commit -m "feat(front): hooks des vues sauvegardées — une requête, trois mutations, invalidation entière"
```

---

### Task 7: La section « Vues sauvegardées » de la barre latérale

**Files:**
- Modify: `src/design/icones.tsx` (glyphe `marquePage`)
- Modify: `src/i18n/fr.ts` (clés `smartlist.*` de la section)
- Create: `src/components/SectionSmartLists.tsx`
- Test: `src/components/SectionSmartLists.test.tsx`
- Modify: `src/components/Sidebar.tsx` (insertion de la section)
- Modify: `src/components/Sidebar.test.tsx` (mock de `useSmartLists` — piège « route absente du mock »)
- Modify: `src/App.test.tsx` (branche `/api/smartlists` dans `mockApi`)

**Interfaces:**
- Consumes: `vueVersView` (Task 4), `forgetSmartList` (Task 5), les quatre hooks (Task 6), `Icone` (design/icones), `t`.
- Produces: composant `SectionSmartLists` inséré dans `Sidebar` entre le bouton Nettoyage et la section Collections.

- [ ] **Step 1: L'icône et les chaînes**

Dans `src/design/icones.tsx`, ajouter au `paths` (avec le commentaire de la maison) :

```ts
  // marque-page : sauvegarder la vue courante — le ruban dit « je retiens
  // cette vue », la barre latérale en est le recueil.
  marquePage: <path d="M4.5 3.5h7v10L8 11l-3.5 2.5z" />,
```

Dans `src/i18n/fr.ts` (section smart lists, au fil des clés existantes) :

```ts
  // Vues sauvegardées (spec 2026-09-22) — la section de la barre latérale.
  "smartlist.section": "Vues sauvegardées",
  "smartlist.renameAria": "Renommer la vue {name}",
  "smartlist.deleteAria": "Supprimer la vue {name}",
  "smartlist.renameField": "Nouveau nom de la vue",
  "smartlist.indisponible": "Vues sauvegardées indisponibles",
```

- [ ] **Step 2: Écrire le test qui échoue**

`src/components/SectionSmartLists.test.tsx` — le module `api` est mocké par chemin (patron `App.test.tsx`), les hooks restent RÉELS (le fichier teste hooks + composant ensemble) :

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { AppStateProvider, useAppState, type View } from "../state/appState";
import { SectionSmartLists } from "./SectionSmartLists";

const getMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/api", () => ({ api: { get: getMock, send: sendMock } }));

// Deux vues : « Rust » (filtrée sur collection 101 + étiquette) et « Tous »
// minimale — la section doit rendre les deux, dans l'ordre de création.
const SMARTLISTS = {
  items: [
    { id: "sl-1", label: "Rust dans Dev", vue: { collectionId: 101, tags: ["rust"] }, cree: "2026-09-22T10:00:00Z" },
    { id: "sl-2", label: "Affiches", vue: { collectionId: 0, search: "affiche" }, cree: "2026-09-22T11:00:00Z" },
  ],
};

const Spy = () => {
  const { view } = useAppState();
  return <span data-testid="view">{JSON.stringify(view)}</span>;
};

// Bouton de test : simule un patch de filtre posé SUR la smart list ouverte
// (le grief de spec §5 — la marque ne survit pas à la divergence).
const Patcheur = () => {
  const { patchList } = useAppState();
  return <button type="button" onClick={() => patchList({ search: "divergé" })}>diverge</button>;
};

const rendre = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AppStateProvider>
        <Spy />
        <Patcheur />
        <SectionSmartLists />
      </AppStateProvider>
    </QueryClientProvider>,
  );

const vue = () => JSON.parse(screen.getByTestId("view").textContent!) as Record<string, unknown>;

beforeEach(() => {
  getMock.mockReset().mockResolvedValue(SMARTLISTS);
  sendMock.mockReset().mockResolvedValue({});
});

describe("SectionSmartLists", () => {
  it("rend la section, les vues dans l'ordre de création", async () => {
    rendre();
    expect(screen.getByText("Vues sauvegardées")).toBeInTheDocument();
    expect(await screen.findByText("Rust dans Dev")).toBeInTheDocument();
    expect(screen.getByText("Affiches")).toBeInTheDocument();
  });

  // Navigation : le clic rejoue la vue stockée — les items de la liste en
  // témoignent (ici : la VUE porte les filtres, listQueryArgs fait le reste).
  it("cliquer rejoue la vue stockée avec son identifiant", async () => {
    rendre();
    await userEvent.click(await screen.findByText("Rust dans Dev"));
    expect(vue()).toEqual({
      kind: "list", collectionId: 101, label: "Rust dans Dev",
      smartlistId: "sl-1", tags: ["rust"],
    });
  });

  it("l'entrée de la vue ouverte est surlignée (surface, bg-app-sel)", async () => {
    rendre();
    await userEvent.click(await screen.findByText("Rust dans Dev"));
    expect(screen.getByText("Rust dans Dev").closest("button")!.className).toContain("bg-app-sel");
    expect(screen.getByText("Affiches").closest("button")!.className).not.toContain("bg-app-sel");
  });

  // Sabordage visé par la spec §7 : c'est CE test (et le suivant) qui doit
  // échouer si le clic n'emporte pas smartlistId, ou si le surlignage se lit
  // sur le label. Voir Step 5.
  it("un filtre posé sur la smart list ouverte efface la marque (la liste reste)", async () => {
    rendre();
    await userEvent.click(await screen.findByText("Rust dans Dev"));
    await userEvent.click(screen.getByText("diverge"));
    expect(vue().smartlistId).toBeUndefined();
    expect(vue().collectionId).toBe(101); // la liste filtrée reste à l'écran
    expect(screen.getByText("Rust dans Dev").closest("button")!.className).not.toContain("bg-app-sel");
  });

  it("supprimer frappe DELETE et efface la marque de la vue ouverte", async () => {
    rendre();
    await userEvent.click(await screen.findByText("Rust dans Dev"));
    await userEvent.click(screen.getByRole("button", { name: "Supprimer la vue Rust dans Dev" }));
    expect(sendMock).toHaveBeenCalledWith("DELETE", "/api/smartlists/sl-1");
    expect(vue().smartlistId).toBeUndefined(); // forgetSmartList (Task 5)
    expect(vue().tags).toEqual(["rust"]); // la liste filtrée reste
  });

  it("renommer ouvre le champ inline et frappe PATCH à Enter", async () => {
    rendre();
    await userEvent.click(await screen.findByText("Rust dans Dev"));
    await userEvent.click(screen.getByRole("button", { name: "Renommer la vue Rust dans Dev" }));
    const champ = screen.getByLabelText("Nouveau nom de la vue") as HTMLInputElement;
    expect(champ.value).toBe("Rust dans Dev"); // prérempli
    await userEvent.clear(champ);
    await userEvent.type(champ, "Rust web{Enter}");
    expect(sendMock).toHaveBeenCalledWith("PATCH", "/api/smartlists/sl-1", { label: "Rust web" });
  });

  it("GET en échec : la section dit son état (spec §6)", async () => {
    getMock.mockReset().mockRejectedValue(new Error("fetch failed"));
    rendre();
    expect(await screen.findByText("Vues sauvegardées indisponibles")).toBeInTheDocument();
  });

  it("répertoire vide : pas de section du tout (§9 masqué si nul)", async () => {
    getMock.mockReset().mockResolvedValue({ items: [] });
    rendre();
    await waitFor(() => expect(getMock).toHaveBeenCalled());
    expect(screen.queryByText("Vues sauvegardées")).not.toBeInTheDocument();
  });
});
```

(Compléter l'import : `waitFor` depuis `@testing-library/react`.)

- [ ] **Step 3: Vérifier l'échec**

Run: `npx vitest run src/components/SectionSmartLists.test.tsx`
Expected: FAIL — `SectionSmartLists` n'existe pas.

- [ ] **Step 4: Implémenter**

`src/components/SectionSmartLists.tsx` :

```tsx
import { useState } from "react";
import { t } from "../i18n/fr";
import { useAppState } from "../state/appState";
import { useSmartLists, useRenommerSmartList, useSupprimerSmartList } from "../hooks/useSmartLists";
import { vueVersView } from "../lib/smartlists";
import { Icone } from "../design/icones";

// Mêmes jetons que les entrées de la Sidebar (28 px, §8) : une smart list
// se lit comme une vue fixe — la surface porte la sélection, jamais une
// teinte (§9). Définies ICI et non importées de Sidebar.tsx : un import
// remonterait en cycle (Sidebar rend cette section).
const item = "flex min-w-0 flex-1 items-center gap-2 text-left rounded px-2 py-1 leading-5 hover:bg-app-hover cursor-pointer";
const selected = " bg-app-sel font-medium";

// Les commandes sont RÉVÉLÉES au survol, jamais posées (§9 « révélé, pas
// posé ») : absolues, elles ne réservent aucune place au repos ; opacité 0
// mais PRÉSENTES au parcours de tabulation — pointer-events coupé au repos,
// `focus-within` les révèle aussi au clavier.
const commandes =
  "absolute right-0 flex items-center bg-app opacity-0 pointer-events-none " +
  "group-hover:opacity-100 group-hover:pointer-events-auto " +
  "group-focus-within:opacity-100 group-focus-within:pointer-events-auto";

export function SectionSmartLists() {
  const { view, go, forgetSmartList } = useAppState();
  const smartlists = useSmartLists();
  const renommer = useRenommerSmartList();
  const supprimer = useSupprimerSmartList();
  const [edition, setEdition] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // §9 « masqué si nul » : pas d'entrées, pas de titre — SAUF en échec,
  // où la section dit son état (spec §6, comme les autres requêtes).
  const items = smartlists.data ?? [];
  if (!smartlists.isError && items.length === 0) return null;

  return (
    <section>
      <h2 className="px-2 text-xs font-medium text-app-muted">{t("smartlist.section")}</h2>
      {smartlists.isError && (
        <p className="px-2 text-xs text-app-muted">{t("smartlist.indisponible")}</p>
      )}
      {items.map((sl) =>
        edition === sl.id ? (
          <input
            key={sl.id}
            aria-label={t("smartlist.renameField")}
            className="input w-full"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim() !== "") {
                renommer.mutate({ id: sl.id, label: draft.trim() });
                setEdition(null);
              }
              if (e.key === "Escape") setEdition(null);
            }}
          />
        ) : (
          <div key={sl.id} className="group relative flex items-center">
            <button
              data-nav
              className={item + (view.kind === "list" && view.smartlistId === sl.id ? selected : "")}
              onClick={() => go(vueVersView(sl))}
            >
              <span className="min-w-0 flex-1 truncate">{sl.label}</span>
            </button>
            <span className={commandes}>
              <button
                type="button"
                className="btn btn-icone"
                aria-label={t("smartlist.renameAria", { name: sl.label })}
                onClick={() => {
                  setDraft(sl.label);
                  setEdition(sl.id);
                }}
              >
                <Icone nom="crayon" />
              </button>
              {/* Sans frappe de confirmation (spec §5) : une smart list se
                  recrée en trois clics — la frappe SUPPRIMER reste aux gestes
                  irréversibles. */}
              <button
                type="button"
                className="btn btn-icone"
                aria-label={t("smartlist.deleteAria", { name: sl.label })}
                onClick={() => {
                  supprimer.mutate(sl.id);
                  forgetSmartList(sl.id); // no-op si la vue ouverte n'est pas celle-ci
                }}
              >
                <Icone nom="croix" />
              </button>
            </span>
          </div>
        ),
      )}
    </section>
  );
}
```

Dans `src/components/Sidebar.tsx` — import puis insertion entre le bouton Nettoyage et la section Collections :

```tsx
import { SectionSmartLists } from "./SectionSmartLists";
```
```tsx
      {/* Vues sauvegardées (smart lists, 2026-09-22) : entre les vues fixes
          et Collections (spec §5) — la section se masque seule si le
          répertoire est vide. */}
      <SectionSmartLists />

      <section>
        <h2 className="px-2 text-xs font-medium text-app-muted">{t("nav.collections")}</h2>
```

Dans `src/components/Sidebar.test.tsx` — ajouter le mock (après celui de `useStaticData`) ; sans lui, la query réelle échoue en jsdom et le bruit masque les vrais signaux. Le label « Vue sauvegardée » n'est PAS un hasard : la fixture collections porte déjà un enfant « Rust », que le test existant « Rust est un enfant : replié par défaut, il n'est pas rendu » asserte ABSENT — une smart list nommée « Rust » ferait échouer ce test (deux noms, deux assertions contradictoires) :

```tsx
vi.mock("../hooks/useSmartLists", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks/useSmartLists")>()),
  useSmartLists: () => ({
    data: [{ id: "sl-1", label: "Vue sauvegardée", vue: { collectionId: 0, tags: ["rust"] }, cree: "2026-09-22T10:00:00Z" }],
    isLoading: false,
  }),
}));
```

et un test de présence dans le `describe` existant :

```tsx
  it("la section des vues sauvegardées se rend entre Nettoyage et Collections", () => {
    renderSidebar();
    expect(screen.getByText("Vues sauvegardées")).toBeInTheDocument();
    expect(screen.getByText("Vue sauvegardée")).toBeInTheDocument();
  });
```

Dans `src/App.test.tsx`, dans `mockApi` (piège documenté : une route absente du mock rend la branche health, et `{}.items.map` démonte l'arbre) :

```ts
    if (path === "/api/smartlists") return Promise.resolve({ items: [] });
```

- [ ] **Step 5: Sabordage (spec §7 — la navigation)**

Réintroduire le défaut : dans `SectionSmartLists`, le clic navigue SANS l'identifiant — remplacer `onClick={() => go(vueVersView(sl))}` par `onClick={() => go({ ...vueVersView(sl), smartlistId: undefined })}`.

Run: `npx vitest run src/components/SectionSmartLists.test.tsx`
Expected: FAIL sur « l'entrée de la vue ouverte est surlignée » ET « un filtre posé… efface la marque » (la marque n'ayant jamais existé, la seconde peut passer — l'essentiel est que LE SURLIGNAGE échoue).

Revenir en arrière (`git checkout -- src/components/SectionSmartLists.tsx` si le Step 4 n'était pas encore commité — sinon rééditer).

- [ ] **Step 6: Vérifier le passage complet**

Run: `npx vitest run src/components/SectionSmartLists.test.tsx src/components/Sidebar.test.tsx src/App.test.tsx && npm run typecheck:front`
Expected: PASS partout.

- [ ] **Step 7: Commit**

```bash
git add src/design/icones.tsx src/i18n/fr.ts src/components/SectionSmartLists.tsx src/components/SectionSmartLists.test.tsx src/components/Sidebar.tsx src/components/Sidebar.test.tsx src/App.test.tsx
git commit -m "feat(front): section Vues sauvegardées dans la barre latérale — clic rejoue la vue, crayon/croix révélés au survol"
```

---

### Task 8: Le bouton « Sauvegarder la vue » de la TopBar

**Files:**
- Modify: `src/i18n/fr.ts` (clés `smartlist.saveView`, `smartlist.nameAria`, `smartlist.pose`)
- Modify: `src/components/TopBar.tsx`
- Test: `src/components/TopBar.test.tsx` (harnais : QueryClientProvider + mock `api`)

**Interfaces:**
- Consumes: `filtreActif`, `serialiserVue` (Task 4), `useCreerSmartList` (Task 6), icône `marquePage` (Task 7).
- Produces: rien au-delà du composant — le geste complet de création (spec §4).

- [ ] **Step 1: Les chaînes**

Dans `src/i18n/fr.ts` :

```ts
  // Le geste de création (TopBar, spec §4) : visible seulement quand un
  // filtre est actif ; le champ est prérempli de la recherche ou de la
  // première étiquette retenue.
  "smartlist.saveView": "Sauvegarder la vue",
  "smartlist.nameAria": "Nom de la vue sauvegardée",
  "smartlist.pose": "Enregistrer cette vue",
```

- [ ] **Step 2: Écrire le test qui échoue**

Dans `src/components/TopBar.test.tsx` :

1. Ajouter le mock du module api et le provider — le hook `useCreerSmartList` exige un `QueryClientProvider` (piège : sans lui, TOUT le fichier casse au rendu) :

```tsx
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";

const sendMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/api", () => ({ api: { get: vi.fn(), send: sendMock } }));
```

et remplacer le harnais de rendu :

```tsx
const renderTop = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppStateProvider><Spy /><Ouvre /><TopBar /></AppStateProvider>
    </QueryClientProvider>,
  );

// Pose une vue filtrée SANS passer par la saisie (le debounce de 300 ms de
// la recherche serait lourd) : le harnais navigue, comme le ferait un clic
// d'étiquette.
const Ouvre = () => {
  const { go } = useAppState();
  return (
    <>
      <button type="button" onClick={() => go({ kind: "list", collectionId: 0, label: "Tous", tags: ["rust"] })}>vue-étiquette</button>
      <button type="button" onClick={() => go({ kind: "list", collectionId: 0, label: "Tous", search: "affiche" })}>vue-recherche</button>
      <button type="button" onClick={() => go({ kind: "list", collectionId: 0, label: "Tous", sort: "title" })}>vue-tri-seul</button>
    </>
  );
};
```

2. Les tests, dans le `describe` existant :

```tsx
  // Spec §4 : le geste naît là où la vue existe, et seulement quand un
  // filtre est actif — le tri seul ne compte pas.
  it("le bouton n'existe pas sans filtre actif, ni avec le tri seul", async () => {
    renderTop();
    expect(screen.queryByRole("button", { name: "Sauvegarder la vue" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("vue-tri-seul"));
    expect(screen.queryByRole("button", { name: "Sauvegarder la vue" })).not.toBeInTheDocument();
  });

  it.each([
    ["étiquette retenue", "vue-étiquette"],
    ["recherche", "vue-recherche"],
  ])("le bouton existe avec %s, le clic ouvre le formulaire prérempli", async (_nom, declencheur) => {
    renderTop();
    await userEvent.click(screen.getByText(declencheur));
    await userEvent.click(screen.getByRole("button", { name: "Sauvegarder la vue" }));
    const champ = screen.getByLabelText("Nom de la vue sauvegardée") as HTMLInputElement;
    expect(champ.value).toBe(declencheur === "vue-recherche" ? "affiche" : "rust");
  });

  it("Enter pose : POST portant le label et la vue sérialisée, le formulaire se referme", async () => {
    sendMock.mockResolvedValue({});
    renderTop();
    await userEvent.click(screen.getByText("vue-étiquette"));
    await userEvent.click(screen.getByRole("button", { name: "Sauvegarder la vue" }));
    const champ = screen.getByLabelText("Nom de la vue sauvegardée");
    await userEvent.clear(champ);
    await userEvent.type(champ, "Rust{Enter}");
    expect(sendMock).toHaveBeenCalledWith("POST", "/api/smartlists", {
      label: "Rust",
      vue: { collectionId: 0, tags: ["rust"] }, // sérialisée : seuls les champs définis
    });
    expect(screen.queryByLabelText("Nom de la vue sauvegardée")).not.toBeInTheDocument();
  });

  it("Échap annule : rien n'est envoyé", async () => {
    renderTop();
    await userEvent.click(screen.getByText("vue-étiquette"));
    await userEvent.click(screen.getByRole("button", { name: "Sauvegarder la vue" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByLabelText("Nom de la vue sauvegardée")).not.toBeInTheDocument();
    expect(sendMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 3: Vérifier l'échec**

Run: `npx vitest run src/components/TopBar.test.tsx`
Expected: FAIL sur les quatre nouveaux tests (le bouton n'existe pas) ; les tests existants restent verts (le harnais a seulement gagné le provider).

- [ ] **Step 4: Implémenter**

Dans `src/components/TopBar.tsx` :

1. Imports :

```tsx
import { filtreActif, serialiserVue } from "../lib/smartlists";
import { useCreerSmartList } from "../hooks/useSmartLists";
```

2. Dans le composant, à côté des états existants :

```tsx
  const creerVue = useCreerSmartList();
  // Le formulaire inline de sauvegarde (spec §4) : ouvert par le bouton,
  // prérempli au CLIC (la vue peut changer entre le rendu et le geste).
  const [sauvegarde, setSauvegarde] = useState(false);
  const [nomVue, setNomVue] = useState("");
  const poserVue = () => {
    if (view.kind !== "list" || nomVue.trim() === "") return;
    creerVue.mutate(
      { label: nomVue.trim(), vue: serialiserVue(view) },
      { onSuccess: () => { setSauvegarde(false); setNomVue(""); } },
    );
  };
```

3. Dans la rangée `ml-auto` (le geste de sauvegarde AVANT la bascule d'affichage) :

```tsx
        <div className="ml-auto flex gap-1">
          {/* Sauvegarder la vue (spec §4) : le bouton n'existe qu'avec un
              filtre actif ; le tri seul ne suffit pas — filtreActif le dit. */}
          {!sauvegarde && isList && filtreActif(view) && (
            <button
              type="button"
              aria-label={t("smartlist.saveView")}
              className={commande}
              onClick={() => {
                setNomVue((view.search?.trim() || view.tags?.[0] || "").trim());
                setSauvegarde(true);
              }}
            >
              <Icone nom="marquePage" />
            </button>
          )}
          {sauvegarde && (
            <>
              <input
                aria-label={t("smartlist.nameAria")}
                className="input w-40"
                autoFocus
                value={nomVue}
                onChange={(e) => setNomVue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") poserVue();
                  if (e.key === "Escape") {
                    setSauvegarde(false);
                    setNomVue("");
                  }
                }}
              />
              <button
                type="button"
                aria-label={t("smartlist.pose")}
                className={commande}
                disabled={creerVue.isPending || nomVue.trim() === ""}
                onClick={poserVue}
              >
                <Icone nom="coche" />
              </button>
            </>
          )}
          <button
            type="button"
            aria-label={enMosaique ? t("view.showList") : t("view.showMosaic")}
            className={commande}
            onClick={() => patchList({ viewMode: enMosaique ? "list" : "mosaic" })}
          >
            <Icone nom={enMosaique ? "liste" : "mosaique"} />
          </button>
        </div>
```

- [ ] **Step 5: Sabordage (spec §7 — le bouton filtré)**

Réintroduire le défaut : remplacer `filtreActif(view)` par `true` dans la condition du bouton.

Run: `npx vitest run src/components/TopBar.test.tsx`
Expected: FAIL sur « le bouton n'existe pas sans filtre actif, ni avec le tri seul » — et lui seul (les tests du formulaire restent verts). Revenir en arrière.

- [ ] **Step 6: Vérifier le passage complet**

Run: `npx vitest run src/components/TopBar.test.tsx && npm test > /tmp/test-smartlists-t8.log 2>&1; echo "rc=$?"; tail -5 /tmp/test-smartlists-t8.log && npm run typecheck`
Expected: `rc=0`, suite et typecheck verts.

- [ ] **Step 7: Commit**

```bash
git add src/i18n/fr.ts src/components/TopBar.tsx src/components/TopBar.test.tsx
git commit -m "feat(front): « Sauvegarder la vue » dans la TopBar — bouton sous filtre actif, formulaire inline, Enter pose Échap annule"
```

---

### Task 9: Documentation (DESIGN §8ter, ROADMAP, CHANGELOG) et vérification finale

**Files:**
- Modify: `docs/DESIGN.md` (nouvelle section §8ter — la direction visuelle fait foi, elle doit dire cette surface)
- Modify: `docs/ROADMAP.md` (entrée « Vues sauvegardées » → Soldé)
- Modify: `CHANGELOG.md` (entrée sous `[Unreleased]` → « Ajouté »)

- [ ] **Step 1: DESIGN.md**

Insérer après la section « 8bis. L'en-tête plein-fond », avant « 9. Règles » :

```markdown
## 8ter. Vues sauvegardées

Une vue filtrée peut être nommée : elle vit dans la barre latérale, entre
les vues fixes et Collections, dans l'ordre de création. Elle se lit comme
une vue fixe — même hauteur (28 px), même typographie, même surface de
sélection (`--color-app-sel`) — la surface porte la sélection, jamais une
teinte (§9). Pas de compteur : la vue rejoue ses filtres, elle n'affiche
pas ce qu'elle contient. Le répertoire vide masque la section entière ;
son échec de chargement se dit en une ligne discrète sous le titre.

Les deux commandes — renommer (crayon), supprimer (croix) — sont
**révélées au survol, jamais posées** : posées à demeure, elles mangeraient
la largeur de chaque ligne pour un geste rare. Absolues à droite de la
ligne, opacité nulle au repos, révélation au survol ET au focus (`focus-within`)
— le clavier les atteint comme le pointeur.

Le geste de création vit dans la **TopBar**, à côté de la bascule
d'affichage : un marque-page (glyphe `marquePage`), présent **seulement
quand un filtre est actif** — sauvegarder une vue non filtrée n'a pas de
sens, et le tri seul n'est pas un filtre. Le clic déplie un champ inline,
prérempli de la recherche ou de la première étiquette retenue ; Enter pose
(coche), Échap annule. La suppression d'une vue ne frappe jamais : une
smart list se recrée en trois clics — la frappe SUPPRIMER reste aux gestes
irréversibles.
```

- [ ] **Step 2: ROADMAP.md**

1. Dans « Soldé (renvois) », ajouter en fin de liste :

```markdown
- **Vues sauvegardées (« smart lists »)** (2026-09-22) : une vue filtrée
  nommée dans la barre latérale, qui vit — dépôt JSON local, routes CRUD,
  `smartlistId` sur la vue (effacé au patch de filtre), section barre
  latérale, bouton TopBar. Aucune logique propre : `listQueryArgs` reste
  le seul parser. Spec
  `docs/superpowers/specs/2026-09-22-smart-lists-design.md`. Détail :
  CHANGELOG.
```

2. Supprimer l'entrée ouverte correspondante dans « UX / interface » :

```markdown
- [ ] **Vues sauvegardées (« smart lists »)** — une vue filtrée nommée dans
      la barre latérale, qui vit : sérialiser `listQueryArgs` là où Karakeep
      stocke une requête réinterprétée par son parser partagé
      (`docs/KARAKEEP.md` §8).
```

- [ ] **Step 3: CHANGELOG.md**

Sous `### Ajouté`, avant l'entrée « L'inversion fiche ↔ lecture » :

```markdown
#### Les vues sauvegardées — smart lists (2026-09-22)

- **« Sauvegarder la vue » dans la barre d'outils**, visible seulement
  quand un filtre est actif : champ inline prérempli (recherche ou première
  étiquette retenue), Enter pose, Échap annule.
- **La vue vit dans la barre latérale** (« Vues sauvegardées ») : le clic
  rejoue collection, filtres ET tri stockés — aucune logique propre, le
  parser des listes fait le reste. Création, renommage au survol,
  suppression sans frappe (une vue se recrée en trois clics).
- **La marque ne ment pas** : tout filtre posé sur la smart list ouverte
  éteint sa marque (la liste filtrée reste) ; supprimer la vue ouverte
  aussi. Un JSON local en dossier de données — absent ou corrompu, la
  section se masque, l'app ne casse pas.
```

- [ ] **Step 4: Vérification finale complète**

Run: `npm run typecheck && npm test > /tmp/test-final-smartlists.log 2>&1; echo "rc=$?"; tail -6 /tmp/test-final-smartlists.log`
Expected: `rc=0`.

Run: `wc -l src/components/SectionSmartLists.tsx src/lib/smartlists.ts src/hooks/useSmartLists.ts sidecar/smartlists/store.ts sidecar/api/routes/smartlists.ts src/state/appState.tsx src/components/TopBar.tsx src/components/Sidebar.tsx`
Expected: aucun fichier au-delà de 300 (plafond dur 400).

Run: `npx tsc -p tsconfig.front.json --noEmit --noUnusedLocals`
Expected: vert (le dépôt n'a pas d'ESLint : c'est le seul filet contre les imports morts après découpage).

- [ ] **Step 5: Commit**

```bash
git add docs/DESIGN.md docs/ROADMAP.md CHANGELOG.md
git commit -m "docs: vues sauvegardées — DESIGN §8ter, ROADMAP soldée, changelog"
```

---

## Self-review (fait à l'écriture du plan)

**Couverture de la spec** :
- §3 données → Task 2 (dépôt), Task 3 (routes, zod, id/cree côté sidecar, pseudo-collections stockables — le zod n'exclut aucun collectionId, corbeille/favoris compris), JSON illisible → liste vide (test Task 2).
- §4 création → Task 8 (bouton sous filtre actif, tri seul exclu, préremplissage, Enter/Échap, invalidation).
- §5 barre latérale → Task 7 (section, ordre de création, clic `go` + `smartlistId`, crayon/croix au survol, suppression sans frappe) ; surlignage sur identifiant → Task 5 (effacement au patch et à la suppression) + tests Task 7 ; label périmé après renommage → assumé (aucun code : la vue ouverte garde son label, rien à faire).
- §6 cas aux bords → collection disparue : la vue rend vide sans casser (aucun code : `listQueryArgs` rejoue, la liste est vide — même parti que les collections vides) ; étiquettes/domaine disparus : idem ; filtre modifié dans la vue ouverte → Task 5 (pas d'écriture fantôme : le patch ne frappe jamais PATCH) ; doublons de nom permis (aucune contrainte d'unicité côté zod/store) ; hors ligne → Task 7 (état d'échec nommé).
- §7 tests → chaque task ; les DEUX sabotages → Task 7 Step 5 et Task 8 Step 5.
- §9 docs → Task 9 (DESIGN §8ter, ROADMAP soldée, i18n).

**Écarts volontaires assumés** : pas de `flush()` au store (chaque route attend son écriture — contrairement aux origines de corbeille écrites en masse en vol) ; le surlignage des vues fixes ne teste pas `smartlistId === undefined` (le comportement existant de « Tous » surligné sous filtre d'étiquette n'est pas du périmètre — la smart list, elle, se surligne juste via son propre identifiant).

**Cohérence des noms** : `SmartListView`/`SmartList` (Task 1) utilisés tels quels partout ; `SmartListStore`/`makeSmartListStore` (Task 2) consommés par Task 3 ; `filtreActif`/`serialiserVue`/`vueVersView` (Task 4) par 5 (non — 5 n'en dépend pas), 7 et 8 ; `forgetSmartList` (Task 5) par 7 ; les quatre hooks (Task 6) par 7 et 8 ; icône `marquePage` (Task 7) par 8. Vérifié.
