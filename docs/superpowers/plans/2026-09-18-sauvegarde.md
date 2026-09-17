# Sauvegarde et couche de données locale — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sauvegarder les 12 210 signets dans des instantanés horodatés,
vérifiés, dans un dossier choisi par l'utilisateur — rafraîchis chaque jour
pour presque rien, et dont on peut affirmer qu'ils reflètent la bibliothèque.

**Architecture:** Un module `sidecar/backup/` distinct de `sidecar/analysis/`
(l'un veut le brut complet, l'autre le normalisé léger). Il lit par **REST
direct** — le pont MCP n'expose pas `sort=-lastUpdate`, donc aucun incrémental
n'y est possible — à travers la **file existante**, étendue pour porter les deux
canaux avec une priorité et un plancher. Les instantanés sont écrits en JSONL
ligne à ligne, relus aussitôt, et leurs empreintes consignées.

**Tech Stack:** TypeScript (sidecar Node ≥ 20), `node:crypto` (SHA-256),
`node:zlib` (gzip des archives), Vitest + un vrai serveur HTTP local
(`sidecar/testing/targetServer.ts` pour le modèle). Aucune dépendance nouvelle.

**Spec:** `docs/superpowers/specs/2026-09-16-sauvegarde-donnees-locales-design.md`
— **lire son §1bis en premier** : huit corrections contraignantes issues de la
relecture critique du 2026-09-18, dont une qui casse la promesse centrale si
elle est ignorée.

## Global Constraints

Repris mot pour mot de la spec et de CLAUDE.md. Chaque task les inclut.

- **Raindrop reste la seule source de vérité EN ÉCRITURE** (§3.1). La réplique
  locale est une copie de lecture, reconstructible, jamais autoritaire.
- **Format brut** (§3.4) : les objets sont écrits **tels que l'API les
  renvoie**, jamais à travers `toRaindropItem` — ce mapper perd `cache`,
  `broken`, `highlights` et la liste `media`.
- **Le jeton Raindrop n'apparaît dans aucun fichier de sauvegarde** (§3.5).
- **Une seule file vers l'API** (§4.4) : 550 ms entre débuts d'appels, la limite
  de 120 req/min étant **globale par utilisateur**. La sauvegarde n'a pas le
  droit d'ignorer un throttle que le reste respecte.
- **Pagination : 50 items max** par requête (§10).
- **Aucun appel réseau réel dans les tests** — un vrai serveur HTTP local, pas
  un `fetch` mocké (§7, leçon de l'incident `unrestore`).
- Fichiers **≤ 300 lignes** visées, plafond dur **400**.
- Interface en français ; messages d'erreur du sidecar en français.
- Pas de `git push` sans demande. Trailer nommant le modèle réel.

---

### Task 1: La file partagée — priorité et plancher

**Files:**
- Modify: `sidecar/mcp/throttle.ts`
- Modify: `sidecar/mcp/throttle.test.ts`

**Interfaces:**
- Produces : `Throttle.run<T>(fn, opts?: { rang?: "interactif" | "fond" })`.
  Le défaut reste `"interactif"` — **tous les appelants existants gardent leur
  comportement**, aucune signature cassée.
- Consommé par : Tasks 2, 4, 5, 7 (tout appel de sauvegarde passe `rang: "fond"`).

**Pourquoi.** §4.4 : le throttle n'encadre aujourd'hui **que** le MCP
(`sidecar/index.ts` : seul `deps.mcp` est enveloppé) ; le client REST appelle
`fetch` sans passer par lui. Sans conséquence jusqu'ici — il ne servait qu'à
des corrections d'URL isolées — mais ≈ 250 requêtes de sauvegarde hors file
dépasseraient la limite. Et la correction §1bis n°3 : sans **plancher**, « ce
qui reste » peut ne jamais venir.

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `sidecar/mcp/throttle.test.ts` :

```ts
  it("l'interactif passe devant le fond déjà en attente", async () => {
    const t = new Throttle(0);
    const ordre: string[] = [];
    // Une tâche occupe la file, les deux suivantes s'empilent derrière.
    const bloque = t.run(async () => { await new Promise((r) => setTimeout(r, 20)); ordre.push("bloque"); });
    const fond = t.run(async () => { ordre.push("fond"); }, { rang: "fond" });
    const interactif = t.run(async () => { ordre.push("interactif"); });
    await Promise.all([bloque, fond, interactif]);
    expect(ordre).toEqual(["bloque", "interactif", "fond"]);
  });

  // Le plancher (spec §4.4, correction §1bis n°3) : sans lui, une application
  // utilisée sans interruption affamerait la sauvegarde et le balayage
  // hebdomadaire n'aboutirait jamais.
  it("le fond progresse même sous charge interactive continue", async () => {
    const t = new Throttle(0);
    const ordre: string[] = [];
    const fini: Promise<unknown>[] = [];
    // 12 interactives empilées d'un coup, puis 3 de fond derrière elles.
    for (let i = 0; i < 12; i++) fini.push(t.run(async () => { ordre.push("i"); }));
    for (let i = 0; i < 3; i++) fini.push(t.run(async () => { ordre.push("f"); }, { rang: "fond" }));
    await Promise.all(fini);
    // Une sur quatre au moins : les trois tâches de fond sont servies avant
    // la fin des douze interactives, pas reléguées à la queue.
    const derniereF = ordre.lastIndexOf("f");
    expect(derniereF).toBeLessThan(ordre.length - 1);
    expect(ordre.filter((x) => x === "f")).toHaveLength(3);
  });

  it("sans rang précisé, le comportement d'avant est inchangé", async () => {
    const t = new Throttle(0);
    const ordre: number[] = [];
    await Promise.all([1, 2, 3].map((n) => t.run(async () => { ordre.push(n); })));
    expect(ordre).toEqual([1, 2, 3]);
  });
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

```bash
npx vitest run sidecar/mcp/throttle.test.ts
```

Attendu : ÉCHEC — `run` n'accepte pas de second argument, l'ordre obtenu est
celui de l'insertion (`["bloque", "fond", "interactif"]`).

- [ ] **Step 3: Écrire l'implémentation**

Remplacer la file « une promesse chaînée » par **deux files d'attente
explicites** et une boucle de service — la chaîne de promesses actuelle ne peut
pas réordonner, puisque l'ordre y est figé à l'insertion.

```ts
type Rang = "interactif" | "fond";

interface Tache {
  rang: Rang;
  lancer(): void;
}

/**
 * File séquentielle avec espacement minimum entre DÉBUTS d'appels.
 * 120 req/min autorisées par Raindrop → 550 ms ≈ 109 req/min (marge).
 * Le 429 HTTP est indétectable via MCP (aplati en "Error: ..." par le
 * package) : la protection est préventive, pas réactive (contrainte plan).
 *
 * DEUX RANGS (spec sauvegarde §4.4) : la limite étant globale par
 * utilisateur, la sauvegarde partage cette file au lieu d'appeler `fetch`
 * à côté. L'interactif passe devant — sinon un job de 2 min 20 rendrait
 * l'interface poussive tout du long.
 *
 * AVEC UN PLANCHER : une sur `PLANCHER_FOND` va au fond même si des
 * interactives attendent. Sans lui, « ce qui reste » peut ne jamais venir,
 * et le balayage hebdomadaire n'aboutirait jamais sur une application
 * utilisée sans interruption.
 */
export class Throttle {
  private readonly attente: Record<Rang, Tache[]> = { interactif: [], fond: [] };
  private enMarche = false;
  private lastStart = 0;
  private _pending = 0;
  /** Depuis combien de services consécutifs le fond n'a-t-il rien eu. */
  private jeuneDuFond = 0;

  /** Une requête de fond servie au moins toutes les quatre. */
  static readonly PLANCHER_FOND = 4;

  constructor(public readonly minIntervalMs: number) {}

  get pendingCount(): number {
    return this._pending;
  }

  run<T>(fn: () => Promise<T>, opts?: { rang?: Rang }): Promise<T> {
    this._pending++;
    const rang = opts?.rang ?? "interactif";
    return new Promise<T>((resoudre, rejeter) => {
      this.attente[rang].push({
        rang,
        lancer: () => {
          fn().then(resoudre, rejeter).finally(() => {
            this._pending--;
            this.servirSuivant();
          });
        },
      });
      this.servirSuivant();
    });
  }

  /** Qui passe : le fond si le plancher l'exige, l'interactif sinon. */
  private choisir(): Tache | undefined {
    const fondDu = this.jeuneDuFond >= Throttle.PLANCHER_FOND - 1;
    const ordre: Rang[] = fondDu ? ["fond", "interactif"] : ["interactif", "fond"];
    for (const r of ordre) {
      const t = this.attente[r].shift();
      if (t) {
        this.jeuneDuFond = t.rang === "fond" ? 0 : this.jeuneDuFond + 1;
        return t;
      }
    }
    return undefined;
  }

  private servirSuivant(): void {
    if (this.enMarche) return;
    const tache = this.choisir();
    if (!tache) return;
    this.enMarche = true;
    const attendre = Math.max(0, this.lastStart + this.minIntervalMs - Date.now());
    const partir = () => {
      this.lastStart = Date.now();
      this.enMarche = false;
      tache.lancer();
      // Une tâche lancée libère la file : la suivante peut démarrer dès que
      // l'espacement le permet, sans attendre la fin de celle-ci.
      this.servirSuivant();
    };
    if (attendre > 0) setTimeout(partir, attendre);
    else partir();
  }
}
```

⚠️ **Différence de comportement à comprendre avant d'écrire.** L'ancienne
implémentation attendait la **fin** de chaque tâche avant de démarrer la
suivante (chaînage de promesses). Celle-ci n'espace que les **débuts**, ce que
la documentation de la classe décrivait déjà (« espacement minimum entre DÉBUTS
d'appels ») mais que le code ne faisait pas. Si un test existant dépend de la
sérialisation stricte, **le signaler plutôt que de l'affaiblir** — c'est un
changement de contrat qui mérite d'être vu.

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

```bash
npx vitest run sidecar/mcp/throttle.test.ts
npm test
```

Attendu : les trois nouveaux verts, **et toute la suite inchangée**.

- [ ] **Step 5: Commit**

```bash
git add sidecar/mcp/throttle.ts sidecar/mcp/throttle.test.ts
git commit -F - <<'EOF'
feat(sidecar): la file porte deux rangs, avec un plancher pour le fond

La limite de 120 req/min est GLOBALE par utilisateur : la sauvegarde doit
partager cette file au lieu d'appeler fetch à côté (spec §4.4). L'interactif
passe devant — un job de 2 min 20 rendrait l'interface poussive tout du long.

Et un plancher d'une requête sur quatre (correction §1bis n°3), sans lequel
« ce qui reste » peut ne jamais venir : sur une application utilisée sans
interruption, la sauvegarde serait affamée et le balayage hebdomadaire
n'aboutirait jamais.

La file passe de « chaîne de promesses » à deux files servies par une boucle :
une chaîne ne peut pas réordonner, l'ordre y est figé à l'insertion.
EOF
```

---

### Task 2: Le client de lecture REST

**Files:**
- Create: `sidecar/backup/lecture.ts`
- Create: `sidecar/backup/lecture.test.ts`
- Create: `sidecar/testing/apiServer.ts` (le faux Raindrop, vrai serveur HTTP)

**Interfaces:**
- Produces :
  ```ts
  export interface PageBrute { count: number; items: unknown[] }
  export interface Lecture {
    page(collectionId: number, opts: { sort: string; page: number; perpage?: number }): Promise<PageBrute>;
    compteur(collectionId: number): Promise<number>;
    collections(): Promise<unknown[]>;
    highlights(page: number): Promise<PageBrute>;
    user(): Promise<unknown>;
  }
  export function makeLecture(opts: {
    token: string; baseUrl?: string; fetchImpl?: typeof fetch;
    file: { run<T>(fn: () => Promise<T>, o?: { rang?: "interactif" | "fond" }): Promise<T> };
  }): Lecture;
  ```
- Consomme : la file de la Task 1 (`rang: "fond"` sur **tous** les appels).
- Consommé par : Tasks 4, 5, 7.

**Pourquoi le brut.** §3.4 : les objets sont rendus **tels quels** (`unknown[]`),
jamais passés à `toRaindropItem` — ce mapper perd `cache`, `broken`,
`highlights` et la liste `media`. Un champ qu'on n'a pas écrit est
définitivement perdu.

- [ ] **Step 1: Écrire le faux serveur Raindrop**

`sidecar/testing/apiServer.ts` — un **vrai** serveur HTTP local (leçon de
l'incident `unrestore`, §7 : un `fetch` mocké valide notre appel, jamais l'API
d'en face).

```ts
import { createServer, type Server } from "node:http";

export interface FauxApi {
  port: number;
  close(): Promise<void>;
  /** La bibliothèque servie, triable et paginable. */
  items: { _id: number; created: string; lastUpdate: string; title: string }[];
  /** Combien de requêtes ont été reçues, par chemin. */
  appels: string[];
  /** Fait répondre 429 aux N prochaines requêtes de liste. */
  repondre429(n: number): void;
}

export async function startFauxApi(items: FauxApi["items"] = []): Promise<FauxApi> {
  let reste429 = 0;
  const appels: string[] = [];
  const etat = { items };
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    appels.push(url.pathname);
    const json = (code: number, corps: unknown) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(corps));
    };
    if (url.pathname.startsWith("/rest/v1/raindrops/")) {
      if (reste429 > 0) { reste429--; return json(429, { error: "rate" }); }
      const sort = url.searchParams.get("sort") ?? "created";
      const page = Number(url.searchParams.get("page") ?? 0);
      const perpage = Number(url.searchParams.get("perpage") ?? 50);
      const cle = sort.replace(/^-/, "") as "created" | "lastUpdate";
      const desc = sort.startsWith("-");
      const tries = [...etat.items].sort((a, b) =>
        desc ? b[cle].localeCompare(a[cle]) : a[cle].localeCompare(b[cle]));
      return json(200, { count: etat.items.length, items: tries.slice(page * perpage, page * perpage + perpage) });
    }
    if (url.pathname === "/rest/v1/collections") return json(200, { items: [{ _id: 1, title: "A" }] });
    if (url.pathname === "/rest/v1/highlights") return json(200, { count: 0, items: [] });
    if (url.pathname === "/rest/v1/user") return json(200, { user: { _id: 7 } });
    json(404, { error: "inconnu" });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  return {
    port, items: etat.items, appels,
    repondre429: (n) => { reste429 = n; },
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
```

- [ ] **Step 2: Écrire les tests qui échouent**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { startFauxApi, type FauxApi } from "../testing/apiServer.js";
import { makeLecture } from "./lecture.js";
import { Throttle } from "../mcp/throttle.js";

let api: FauxApi | undefined;
afterEach(async () => { await api?.close(); api = undefined; });

const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    _id: 1000 + i,
    created: `2020-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    lastUpdate: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    title: `t${i}`,
  }));

const lecture = (a: FauxApi) =>
  makeLecture({ token: "jeton", baseUrl: `http://127.0.0.1:${a.port}/rest/v1`, file: new Throttle(0) });

describe("lecture", () => {
  it("rend les items BRUTS et le compte, sans normaliser", async () => {
    api = await startFauxApi(items(3));
    const p = await lecture(api).page(0, { sort: "created", page: 0 });
    expect(p.count).toBe(3);
    // Le brut : les champs de l'API, pas ceux du DTO du front.
    expect(p.items[0]).toMatchObject({ _id: 1000, created: expect.any(String) });
  });

  it("le compteur ne rapatrie pas la bibliothèque", async () => {
    api = await startFauxApi(items(120));
    expect(await lecture(api).compteur(0)).toBe(120);
    // perpage=1 : un compteur ne doit pas coûter une page entière.
    expect(api.appels.filter((a) => a.includes("raindrops"))).toHaveLength(1);
  });

  it("le jeton part en en-tête, jamais dans l'URL", async () => {
    api = await startFauxApi(items(1));
    await lecture(api).page(0, { sort: "created", page: 0 });
    expect(api.appels.join("|")).not.toContain("jeton");
  });

  it("un 429 est rendu comme tel, pas aplati en panne réseau", async () => {
    api = await startFauxApi(items(1));
    api.repondre429(1);
    await expect(lecture(api).page(0, { sort: "created", page: 0 })).rejects.toThrow(/429/);
  });
});
```

- [ ] **Step 3: Lancer les tests et vérifier qu'ils échouent**

```bash
npx vitest run sidecar/backup/lecture.test.ts
```

Attendu : `Failed to resolve import "./lecture.js"`.

- [ ] **Step 4: Écrire `sidecar/backup/lecture.ts`**

```ts
//! Le canal de lecture de la sauvegarde : REST direct, pas le MCP.
//!
//! Le pont n'expose pas `sort=-lastUpdate` (vérifié dans le JS du paquet
//! épinglé) : sans lui AUCUN incrémental n'est possible et chaque
//! rafraîchissement coûterait 245 requêtes. Il aplatit aussi les codes HTTP
//! en `Error: failed to …`, or un job de plusieurs minutes doit distinguer
//! un 429 d'une panne réseau (spec §3.2).

const API_BASE = "https://api.raindrop.io/rest/v1";

export interface PageBrute {
  count: number;
  items: unknown[];
}

export interface Lecture {
  page(collectionId: number, opts: { sort: string; page: number; perpage?: number }): Promise<PageBrute>;
  compteur(collectionId: number): Promise<number>;
  collections(): Promise<unknown[]>;
  highlights(page: number): Promise<PageBrute>;
  user(): Promise<unknown>;
}

interface File {
  run<T>(fn: () => Promise<T>, o?: { rang?: "interactif" | "fond" }): Promise<T>;
}

export function makeLecture(opts: {
  token: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  file: File;
  timeoutMs?: number;
}): Lecture {
  const base = opts.baseUrl ?? API_BASE;
  const f = opts.fetchImpl ?? fetch;

  // TOUT passe par la file, au rang « fond » : la limite de 120 req/min est
  // globale par utilisateur, et l'interface doit rester vive pendant les
  // 2 min 20 d'un balayage (spec §4.4).
  const lire = async (chemin: string): Promise<unknown> =>
    opts.file.run(async () => {
      const res = await f(`${base}${chemin}`, {
        headers: { Authorization: `Bearer ${opts.token}` },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
      });
      if (!res.ok) {
        // Le code HTTP est conservé : c'est précisément ce que le MCP perd,
        // et ce qui permet de distinguer une pause 429 d'un échec.
        throw new Error(`raindrop api http ${res.status}`);
      }
      return res.json();
    }, { rang: "fond" });

  const pageBrute = async (chemin: string): Promise<PageBrute> => {
    const j = (await lire(chemin)) as { count?: number; items?: unknown[] };
    return { count: j.count ?? 0, items: j.items ?? [] };
  };

  return {
    page: (collectionId, { sort, page, perpage = 50 }) =>
      pageBrute(`/raindrops/${collectionId}?sort=${encodeURIComponent(sort)}&page=${page}&perpage=${perpage}`),
    // perpage=1 : un compteur ne doit pas coûter une page entière (§5.3, la
    // comparaison de compteurs se veut « une requête »).
    compteur: async (collectionId) => (await pageBrute(`/raindrops/${collectionId}?perpage=1&page=0`)).count,
    collections: async () => ((await lire("/collections")) as { items?: unknown[] }).items ?? [],
    highlights: (page) => pageBrute(`/highlights?page=${page}&perpage=50`),
    user: () => lire("/user"),
  };
}
```

- [ ] **Step 5: Lancer les tests et vérifier qu'ils passent**

```bash
npx vitest run sidecar/backup/lecture.test.ts
```

Attendu : `Tests 4 passed`.

- [ ] **Step 6: Commit**

```bash
git add sidecar/backup/lecture.ts sidecar/backup/lecture.test.ts sidecar/testing/apiServer.ts
git commit -m "feat(backup): le canal de lecture REST, brut et dans la file

Le MCP n'expose pas sort=-lastUpdate : sans lui aucun incrémental n'est
possible. Et il aplatit les codes HTTP, or un job de plusieurs minutes doit
distinguer un 429 d'une panne réseau (spec §3.2).

Les objets sont rendus BRUTS (unknown[]), jamais via toRaindropItem qui perd
cache, broken, highlights et media — un champ qu'on n'a pas écrit est
définitivement perdu (§3.4).

Testé contre un VRAI serveur HTTP local : un fetch mocké valide notre appel,
jamais l'API d'en face (leçon de l'incident unrestore)."
```

---

### Task 3: L'instantané — écriture JSONL, empreintes, vérification

**Files:**
- Create: `sidecar/backup/instantane.ts`
- Create: `sidecar/backup/instantane.test.ts`

**Interfaces:**
- Produces :
  ```ts
  export interface EcrivainJsonl { ligne(objet: unknown): Promise<void>; fermer(): Promise<{ lignes: number; sha256: string }> }
  export function ouvrirJsonl(chemin: string): Promise<EcrivainJsonl>;
  export function sha256Fichier(chemin: string): Promise<string>;
  export interface VerdictVerification { ok: boolean; lignes: number; raison?: string }
  export function verifierJsonl(chemin: string, attendu: { lignes: number; sha256: string }): Promise<VerdictVerification>;
  export function horodatage(d?: Date): string;   // "2026-09-16T15-30-00"
  ```
- Consommé par : Tasks 4, 5, 6.

**Pourquoi.** §6 : « une archive jamais relue est une archive qu'on *croit*
bonne, et c'est le mode de défaillance qu'une sauvegarde existe pour exclure ».
JSONL (§4.2) pour écrire en flux sans charger 11 Mo, reprendre une sauvegarde
interrompue, et relire ligne à ligne.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { writeFile, readFile } from "node:fs/promises";
import { repertoireTemporaire } from "../testing/tmp.js";
import { ouvrirJsonl, sha256Fichier, verifierJsonl, horodatage } from "./instantane.js";

const dir = repertoireTemporaire("backup-instantane");

describe("instantané", () => {
  it("écrit une ligne par objet, et rend le compte et l'empreinte", async () => {
    const f = join(dir(), "r.jsonl");
    const e = await ouvrirJsonl(f);
    await e.ligne({ _id: 1, titre: "un" });
    await e.ligne({ _id: 2, titre: "deux" });
    const { lignes, sha256 } = await e.fermer();
    expect(lignes).toBe(2);
    expect(sha256).toMatch(/^[0-9a-f]{64}$/);
    const brut = await readFile(f, "utf8");
    expect(brut.trimEnd().split("\n")).toHaveLength(2);
    expect(JSON.parse(brut.split("\n")[0]!)).toEqual({ _id: 1, titre: "un" });
    expect(await sha256Fichier(f)).toBe(sha256);
  });

  // Le contrat que §6 exige : ce qui a été écrit est relu, tout de suite.
  it("un fichier intact est vérifié bon", async () => {
    const f = join(dir(), "ok.jsonl");
    const e = await ouvrirJsonl(f);
    await e.ligne({ a: 1 });
    const attendu = await e.fermer();
    expect(await verifierJsonl(f, attendu)).toMatchObject({ ok: true, lignes: 1 });
  });

  it("une ligne tronquée est détectée, pas avalée", async () => {
    const f = join(dir(), "tronque.jsonl");
    const e = await ouvrirJsonl(f);
    await e.ligne({ a: 1 });
    const attendu = await e.fermer();
    await writeFile(f, '{"a": 1}\n{"b": ', "utf8");
    const v = await verifierJsonl(f, attendu);
    expect(v.ok).toBe(false);
    expect(v.raison).toMatch(/ligne 2/);
  });

  it("une empreinte qui ne correspond plus est détectée", async () => {
    const f = join(dir(), "altere.jsonl");
    const e = await ouvrirJsonl(f);
    await e.ligne({ a: 1 });
    const attendu = await e.fermer();
    await writeFile(f, '{"a": 2}\n', "utf8");   // même nombre de lignes, JSON valide
    const v = await verifierJsonl(f, attendu);
    expect(v.ok).toBe(false);
    expect(v.raison).toMatch(/empreinte/);
  });

  it("l'horodatage est utilisable comme nom de dossier", () => {
    expect(horodatage(new Date("2026-09-16T15:30:00Z"))).toBe("2026-09-16T15-30-00");
  });
});
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

```bash
npx vitest run sidecar/backup/instantane.test.ts
```

Attendu : `Failed to resolve import "./instantane.js"`.

- [ ] **Step 3: Écrire `sidecar/backup/instantane.ts`**

```ts
//! L'écriture d'un instantané, et sa relecture immédiate.
//!
//! §6 : « une archive jamais relue est une archive qu'on CROIT bonne, et
//! c'est le mode de défaillance qu'une sauvegarde existe pour exclure ».
//! Le JSONL (§4.2) permet d'écrire en flux sans charger 11 Mo, de reprendre
//! une sauvegarde interrompue, et de relire ligne à ligne.

import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { once } from "node:events";

export interface EcrivainJsonl {
  ligne(objet: unknown): Promise<void>;
  fermer(): Promise<{ lignes: number; sha256: string }>;
}

export async function ouvrirJsonl(chemin: string): Promise<EcrivainJsonl> {
  await mkdir(dirname(chemin), { recursive: true });
  const flux = createWriteStream(chemin, { encoding: "utf8" });
  // L'empreinte se calcule AU FIL de l'écriture : relire 11 Mo pour la
  // produire doublerait la lecture disque sans rien apporter.
  const hash = createHash("sha256");
  let lignes = 0;
  return {
    async ligne(objet) {
      const texte = JSON.stringify(objet) + "\n";
      hash.update(texte);
      lignes++;
      if (!flux.write(texte)) await once(flux, "drain");
    },
    async fermer() {
      await new Promise<void>((r, j) => flux.end((e?: Error) => (e ? j(e) : r())));
      return { lignes, sha256: hash.digest("hex") };
    },
  };
}

export async function sha256Fichier(chemin: string): Promise<string> {
  return createHash("sha256").update(await readFile(chemin)).digest("hex");
}

export interface VerdictVerification {
  ok: boolean;
  lignes: number;
  raison?: string;
}

/**
 * Relit ce qui vient d'être écrit : nombre de lignes, validité JSON de
 * CHACUNE, puis empreinte. Dans cet ordre — une ligne tronquée se nomme
 * mieux qu'une empreinte qui diffère, et l'utilisateur mérite de savoir
 * LAQUELLE.
 */
export async function verifierJsonl(
  chemin: string,
  attendu: { lignes: number; sha256: string },
): Promise<VerdictVerification> {
  let brut: string;
  try {
    brut = await readFile(chemin, "utf8");
  } catch (e) {
    return { ok: false, lignes: 0, raison: `illisible : ${e instanceof Error ? e.message : String(e)}` };
  }
  const lignes = brut === "" ? [] : brut.replace(/\n$/, "").split("\n");
  for (const [i, l] of lignes.entries()) {
    try {
      JSON.parse(l);
    } catch {
      return { ok: false, lignes: lignes.length, raison: `ligne ${i + 1} n'est pas du JSON valide` };
    }
  }
  if (lignes.length !== attendu.lignes) {
    return { ok: false, lignes: lignes.length, raison: `${lignes.length} lignes au lieu de ${attendu.lignes}` };
  }
  if ((await sha256Fichier(chemin)) !== attendu.sha256) {
    return { ok: false, lignes: lignes.length, raison: "empreinte différente de celle écrite" };
  }
  return { ok: true, lignes: lignes.length };
}

/** `2026-09-16T15-30-00` — utilisable comme nom de dossier (§4.2). */
export function horodatage(d: Date = new Date()): string {
  return d.toISOString().slice(0, 19).replace(/:/g, "-");
}
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

```bash
npx vitest run sidecar/backup/instantane.test.ts
```

Attendu : `Tests 5 passed`.

- [ ] **Step 5: Commit**

```bash
git add sidecar/backup/instantane.ts sidecar/backup/instantane.test.ts
git commit -m "feat(backup): l'instantané s'écrit en flux et se relit aussitôt

Une archive jamais relue est une archive qu'on CROIT bonne — c'est le mode de
défaillance qu'une sauvegarde existe pour exclure (§6). Chaque fichier est donc
relu après écriture : nombre de lignes, validité JSON de CHACUNE, puis
empreinte, dans cet ordre — une ligne tronquée se nomme mieux qu'une empreinte
qui diffère.

L'empreinte se calcule au fil de l'écriture : relire 11 Mo pour la produire
doublerait la lecture disque sans rien apporter."
```

---

### Task 4: Le balayage complet et la réconciliation par identifiants

**Files:**
- Create: `sidecar/backup/balayage.ts`
- Create: `sidecar/backup/balayage.test.ts`

**Interfaces:**
- Consomme : `Lecture` (Task 2), `ouvrirJsonl` (Task 3).
- Produces :
  ```ts
  export interface ResultatBalayage {
    ids: Set<number>;
    lignes: number;
    sha256: string;
    complet: boolean;      // faux = réconciliation en échec après rejeu
    raison?: string;
    countFinal: number;
  }
  export function balayerComplet(deps: {
    lecture: Lecture; chemin: string; collectionId: number;
    onProgress?(faits: number, total: number): void;
    annule?(): boolean;
  }): Promise<ResultatBalayage>;
  ```

**C'est la task la plus importante du plan.** Elle porte la correction §1bis
n° 1, sans laquelle la sauvegarde promet une fidélité qu'elle ne peut pas tenir.

**Le raisonnement, en entier.** Le balayage trie par **`created` ascendant** —
jamais `-created`. En descendant, un signet créé pendant les 2 min 20 apparaît
en page 0 et décale tout ce qui suit. En ascendant, les nouveaux s'ajoutent
*après* le point de lecture et ne perturbent rien.

**Mais l'ascendant ne protège pas des suppressions.** Une suppression en amont
décale la suite **vers l'arrière** : lire la page 5 (indices 250-299), voir
disparaître l'indice 10, et la page 6 rend les anciens indices 301-350 —
l'ancien 300 n'est jamais lu. L'application supprime elle-même (nettoyage,
corbeille), et l'incrémental par `-lastUpdate` ne rattrapera pas un élément
sauté qui n'a pas de date nouvelle.

D'où : on collecte les `_id` au passage, et on les réconcilie avec le `count`
relu **à la fin**.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { repertoireTemporaire } from "../testing/tmp.js";
import { startFauxApi, type FauxApi } from "../testing/apiServer.js";
import { makeLecture } from "./lecture.js";
import { Throttle } from "../mcp/throttle.js";
import { balayerComplet } from "./balayage.js";

const dir = repertoireTemporaire("backup-balayage");
let api: FauxApi | undefined;
afterEach(async () => { await api?.close(); api = undefined; });

const items = (n: number, decalage = 0) =>
  Array.from({ length: n }, (_, i) => ({
    _id: 1000 + i + decalage,
    created: `2020-01-01T00:${String(i % 60).padStart(2, "0")}:00.000Z`,
    lastUpdate: "2026-01-01T00:00:00.000Z",
    title: `t${i}`,
  }));

const deps = (a: FauxApi, nom: string) => ({
  lecture: makeLecture({ token: "j", baseUrl: `http://127.0.0.1:${a.port}/rest/v1`, file: new Throttle(0) }),
  chemin: join(dir(), nom),
  collectionId: 0,
});

describe("balayage complet", () => {
  it("écrit tous les items et rend leurs identifiants", async () => {
    api = await startFauxApi(items(120));
    const r = await balayerComplet(deps(api, "a.jsonl"));
    expect(r.lignes).toBe(120);
    expect(r.ids.size).toBe(120);
    expect(r.complet).toBe(true);
  });

  it("trie par created ASCENDANT — jamais -created", async () => {
    api = await startFauxApi(items(60));
    await balayerComplet(deps(api, "b.jsonl"));
    const requetes = api.appels.filter((a) => a.includes("raindrops"));
    expect(requetes.length).toBeGreaterThan(0);
    // Le sens du tri est porté par l'URL : le vérifier là où il vit.
    expect(api.appels.join("|")).not.toContain("-created");
  });

  // LE test de la correction §1bis n°1. Une suppression en amont pendant le
  // balayage décale la suite vers l'arrière : un élément est sauté, et
  // l'incrémental ne le rattrapera jamais.
  it("une suppression pendant le balayage est DÉTECTÉE par la réconciliation", async () => {
    api = await startFauxApi(items(120));
    const d = deps(api, "c.jsonl");
    let pages = 0;
    const lectureEspionne = {
      ...d.lecture,
      page: async (c: number, o: { sort: string; page: number; perpage?: number }) => {
        const p = await d.lecture.page(c, o);
        // Après la première page, on supprime en amont — exactement la course
        // que l'ordre ascendant ne protège pas.
        if (pages++ === 0) api!.items.splice(0, 1);
        return p;
      },
    };
    const r = await balayerComplet({ ...d, lecture: lectureEspionne });
    expect(r.complet).toBe(false);
    expect(r.raison).toMatch(/réconciliation/i);
  });

  it("un balayage sans incident se déclare complet, et peut l'affirmer", async () => {
    api = await startFauxApi(items(75));
    const r = await balayerComplet(deps(api, "d.jsonl"));
    expect(r.complet).toBe(true);
    expect(r.ids.size).toBe(r.countFinal);
  });

  it("la progression est rapportée page par page", async () => {
    api = await startFauxApi(items(120));
    const vus: number[] = [];
    await balayerComplet({ ...deps(api, "e.jsonl"), onProgress: (f) => vus.push(f) });
    expect(vus.length).toBeGreaterThanOrEqual(3);
    expect(vus.at(-1)).toBe(120);
  });

  it("l'annulation arrête le balayage sans écrire un instantané menteur", async () => {
    api = await startFauxApi(items(200));
    let n = 0;
    const r = await balayerComplet({ ...deps(api, "f.jsonl"), annule: () => ++n > 2 });
    expect(r.complet).toBe(false);
    expect(r.raison).toMatch(/annul/i);
  });
});
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

```bash
npx vitest run sidecar/backup/balayage.test.ts
```

Attendu : `Failed to resolve import "./balayage.js"`.

- [ ] **Step 3: Écrire `sidecar/backup/balayage.ts`**

```ts
//! Le balayage complet de la bibliothèque, et sa réconciliation.
//!
//! TRI : `created` ASCENDANT, jamais `-created` (§4.2). En descendant, un
//! signet créé pendant les 2 min 20 apparaît en page 0 et décale tout ce qui
//! suit. En ascendant, les nouveaux s'ajoutent APRÈS le point de lecture.
//!
//! MAIS l'ascendant ne protège pas des SUPPRESSIONS (correction §1bis n°1) :
//! une suppression en amont décale la suite vers l'arrière et fait sauter un
//! élément — que l'incrémental par `-lastUpdate` ne rattrapera jamais, un
//! élément sauté n'ayant aucune date nouvelle. D'où la réconciliation par
//! identifiants ci-dessous.

import { ouvrirJsonl } from "./instantane.js";
import type { Lecture } from "./lecture.js";

const PAR_PAGE = 50;

export interface ResultatBalayage {
  ids: Set<number>;
  lignes: number;
  sha256: string;
  /** Faux = la réconciliation a échoué, ou le balayage a été annulé. */
  complet: boolean;
  raison?: string;
  countFinal: number;
}

interface Deps {
  lecture: Lecture;
  chemin: string;
  collectionId: number;
  onProgress?(faits: number, total: number): void;
  annule?(): boolean;
}

/** Un passage : écrit le JSONL et collecte les identifiants. */
async function passer(deps: Deps): Promise<Omit<ResultatBalayage, "complet" | "raison">> {
  const ecrivain = await ouvrirJsonl(deps.chemin);
  const ids = new Set<number>();
  let page = 0;
  let total = 0;
  for (;;) {
    if (deps.annule?.()) break;
    const p = await deps.lecture.page(deps.collectionId, {
      sort: "created",
      page,
      perpage: PAR_PAGE,
    });
    total = p.count;
    for (const item of p.items) {
      await ecrivain.ligne(item);
      const id = (item as { _id?: number })._id;
      if (typeof id === "number") ids.add(id);
    }
    deps.onProgress?.(ids.size, total);
    if (p.items.length < PAR_PAGE) break;
    page++;
  }
  const { lignes, sha256 } = await ecrivain.fermer();
  // Le compte est relu À LA FIN : c'est lui qui révèle ce qui a bougé pendant
  // la course, pas celui du début.
  const countFinal = await deps.lecture.compteur(deps.collectionId);
  return { ids, lignes, sha256, countFinal };
}

/**
 * Balaye, réconcilie, et rejoue UNE fois si l'écart persiste.
 *
 * Égalité `ids.size === countFinal` : l'instantané est complet, et on peut
 * l'affirmer. Écart : quelque chose a été supprimé pendant la course et un
 * élément a été sauté. Un rejeu suffit dans la quasi-totalité des cas ; s'il
 * échoue encore, l'instantané est marqué INCOMPLET et ne sera jamais compté
 * comme la dernière sauvegarde valide (§6).
 */
export async function balayerComplet(deps: Deps): Promise<ResultatBalayage> {
  for (const essai of [1, 2]) {
    const r = await passer(deps);
    if (deps.annule?.()) {
      return { ...r, complet: false, raison: "balayage annulé" };
    }
    if (r.ids.size === r.countFinal) {
      return { ...r, complet: true };
    }
    if (essai === 2) {
      return {
        ...r,
        complet: false,
        raison:
          `réconciliation impossible : ${r.ids.size} identifiants collectés pour ` +
          `${r.countFinal} annoncés — la bibliothèque a changé pendant les deux passages`,
      };
    }
  }
  /* c8 ignore next */
  throw new Error("inatteignable");
}
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

```bash
npx vitest run sidecar/backup/balayage.test.ts
```

Attendu : `Tests 6 passed`.

- [ ] **Step 5: Commit**

```bash
git add sidecar/backup/balayage.ts sidecar/backup/balayage.test.ts
git commit -F - <<'EOF'
feat(backup): le balayage complet, et sa réconciliation par identifiants

Le tri est `created` ASCENDANT, jamais `-created` : en descendant, un signet
créé pendant les 2 min 20 apparaît en page 0 et décale tout ce qui suit.

Mais l'ascendant ne protège QUE des créations (correction §1bis n°1). Une
suppression en amont du point de lecture décale la suite vers l'arrière et fait
sauter un élément — et l'incrémental par -lastUpdate ne le rattrapera jamais,
un élément sauté n'ayant aucune date nouvelle. Le cas n'est pas théorique :
l'application supprime elle-même, et le balayage dure 2 min 20.

D'où la réconciliation : les identifiants sont collectés au passage (ils sont
déjà en main), puis comparés au `count` relu À LA FIN. Égalité, l'instantané
est complet et on peut l'affirmer. Écart, on rejoue une fois ; s'il persiste,
l'instantané est marqué incomplet plutôt que présenté comme valide.
EOF
```

---

### Task 5: Le rafraîchissement incrémental

**Files:**
- Create: `sidecar/backup/incremental.ts`
- Create: `sidecar/backup/incremental.test.ts`

**Interfaces:**
- Consomme : `Lecture` (Task 2).
- Produces :
  ```ts
  export interface ResultatIncremental { modifies: unknown[]; nouveauWatermark: string; pages: number }
  export function lireModifies(deps: {
    lecture: Lecture; collectionId: number; watermark: string; maxPages?: number;
  }): Promise<ResultatIncremental>;
  ```

**Pourquoi.** §5.2 : quelques éléments modifiés coûtent **une** requête — c'est
ce qui rend la sauvegarde quotidienne quasi gratuite. Correction §1bis n° 4 :
plusieurs éléments peuvent partager la même seconde de `lastUpdate`. Un `>`
strict en saute, un `>=` seul bouclerait. La règle : **`>=`, une page de
recouvrement, dédoublonnage par `_id`**.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { startFauxApi, type FauxApi } from "../testing/apiServer.js";
import { makeLecture } from "./lecture.js";
import { Throttle } from "../mcp/throttle.js";
import { lireModifies } from "./incremental.js";

let api: FauxApi | undefined;
afterEach(async () => { await api?.close(); api = undefined; });

const item = (id: number, lastUpdate: string) =>
  ({ _id: id, created: "2020-01-01T00:00:00.000Z", lastUpdate, title: `t${id}` });

const lect = (a: FauxApi) =>
  makeLecture({ token: "j", baseUrl: `http://127.0.0.1:${a.port}/rest/v1`, file: new Throttle(0) });

describe("incrémental", () => {
  it("s'arrête au watermark et ne rapatrie que le neuf", async () => {
    api = await startFauxApi([
      item(3, "2026-03-01T00:00:00.000Z"),
      item(2, "2026-02-01T00:00:00.000Z"),
      item(1, "2026-01-01T00:00:00.000Z"),
    ]);
    const r = await lireModifies({ lecture: lect(api), collectionId: 0, watermark: "2026-02-01T00:00:00.000Z" });
    const ids = r.modifies.map((m) => (m as { _id: number })._id).sort();
    // `>=` : l'élément PILE au watermark est réapplique — idempotent, et il
    // vaut mieux le réécrire que le sauter.
    expect(ids).toEqual([2, 3]);
    expect(r.nouveauWatermark).toBe("2026-03-01T00:00:00.000Z");
  });

  // Correction §1bis n°4 : plusieurs éléments à la même seconde.
  it("des dates égales ne font sauter personne, ni produire de doublon", async () => {
    const meme = "2026-05-05T12:00:00.000Z";
    api = await startFauxApi([
      item(10, meme), item(11, meme), item(12, meme),
      item(1, "2026-01-01T00:00:00.000Z"),
    ]);
    const r = await lireModifies({ lecture: lect(api), collectionId: 0, watermark: meme });
    const ids = r.modifies.map((m) => (m as { _id: number })._id).sort((a, b) => a - b);
    expect(ids).toEqual([10, 11, 12]);
    // Le dédoublonnage par _id : la page de recouvrement les revoit.
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rien de neuf coûte une seule requête", async () => {
    api = await startFauxApi([item(1, "2026-01-01T00:00:00.000Z")]);
    const r = await lireModifies({ lecture: lect(api), collectionId: 0, watermark: "2026-06-01T00:00:00.000Z" });
    expect(r.modifies).toHaveLength(0);
    expect(r.pages).toBe(1);
  });

  it("un watermark vide rend la main sans tout rapatrier", async () => {
    api = await startFauxApi([item(1, "2026-01-01T00:00:00.000Z")]);
    const r = await lireModifies({ lecture: lect(api), collectionId: 0, watermark: "", maxPages: 2 });
    expect(r.pages).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

```bash
npx vitest run sidecar/backup/incremental.test.ts
```

Attendu : `Failed to resolve import "./incremental.js"`.

- [ ] **Step 3: Écrire `sidecar/backup/incremental.ts`**

```ts
//! Le rafraîchissement incrémental : `-lastUpdate` jusqu'au watermark.
//!
//! C'est ce qui rend la sauvegarde quotidienne quasi gratuite (§5.2) — quelques
//! éléments modifiés coûtent une requête, là où un balayage complet en coûte
//! 245.
//!
//! ÉGALITÉ DE DATES (correction §1bis n°4) : plusieurs éléments peuvent
//! partager la même seconde de `lastUpdate`. Un `>` strict en sauterait, un
//! `>=` seul bouclerait. La règle : `>=`, UNE page de recouvrement au-delà du
//! croisement, et dédoublonnage par `_id`. Réappliquer un élément déjà à jour
//! est sans effet — l'opération est idempotente.

import type { Lecture } from "./lecture.js";

const PAR_PAGE = 50;
/** Garde-fou : un watermark absent ou aberrant ne doit pas rapatrier 245 pages. */
const MAX_PAGES_DEFAUT = 20;

export interface ResultatIncremental {
  modifies: unknown[];
  nouveauWatermark: string;
  pages: number;
}

export async function lireModifies(deps: {
  lecture: Lecture;
  collectionId: number;
  watermark: string;
  maxPages?: number;
}): Promise<ResultatIncremental> {
  const max = deps.maxPages ?? MAX_PAGES_DEFAUT;
  const parId = new Map<number, unknown>();
  let nouveauWatermark = deps.watermark;
  let pages = 0;
  let recouvrementRestant = -1; // -1 = pas encore croisé

  for (let page = 0; page < max; page++) {
    const p = await deps.lecture.page(deps.collectionId, {
      sort: "-lastUpdate",
      page,
      perpage: PAR_PAGE,
    });
    pages++;
    let croiseSurCettePage = false;
    for (const item of p.items) {
      const o = item as { _id?: number; lastUpdate?: string };
      const date = o.lastUpdate ?? "";
      if (date > nouveauWatermark) nouveauWatermark = date;
      // `>=` et non `>` : l'élément PILE au watermark est réappliqué. Le
      // réécrire est sans effet ; le sauter perdrait ses voisins de même
      // seconde.
      if (deps.watermark === "" || date >= deps.watermark) {
        if (typeof o._id === "number") parId.set(o._id, item);
      } else {
        croiseSurCettePage = true;
      }
    }
    if (p.items.length < PAR_PAGE) break;
    if (croiseSurCettePage && recouvrementRestant === -1) {
      // Une page de recouvrement : les éléments de même seconde peuvent
      // chevaucher la frontière de page.
      recouvrementRestant = 1;
      continue;
    }
    if (recouvrementRestant > 0) {
      recouvrementRestant--;
      if (recouvrementRestant === 0) break;
    }
  }
  return { modifies: [...parId.values()], nouveauWatermark, pages };
}
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

```bash
npx vitest run sidecar/backup/incremental.test.ts
```

Attendu : `Tests 4 passed`.

- [ ] **Step 5: Commit**

```bash
git add sidecar/backup/incremental.ts sidecar/backup/incremental.test.ts
git commit -m "feat(backup): le rafraîchissement incrémental, et sa règle d'égalité

Quelques éléments modifiés coûtent une requête, là où un balayage complet en
coûte 245 : c'est ce qui rend la sauvegarde quotidienne quasi gratuite (§5.2).

Plusieurs éléments peuvent partager la même seconde de lastUpdate (correction
§1bis n°4). Un > strict en sauterait, un >= seul bouclerait. La règle : >=, une
page de recouvrement au-delà du croisement, dédoublonnage par _id. Réappliquer
un élément déjà à jour est sans effet."
```

---

### Task 6: Le manifeste et la rotation

**Files:**
- Create: `sidecar/backup/manifeste.ts`
- Create: `sidecar/backup/manifeste.test.ts`

**Interfaces:**
- Consomme : rien des tasks précédentes (pur + disque).
- Produces :
  ```ts
  export interface EntreeInstantane {
    horodatage: string; complet: boolean; count: number; watermark: string;
    empreintes: Record<string, { lignes: number; sha256: string }>;
  }
  export interface Manifeste { version: 1; instantanes: EntreeInstantane[] }
  export function lireManifeste(dossier: string): Promise<Manifeste>;
  export function ecrireManifeste(dossier: string, m: Manifeste): Promise<void>;
  export function aConserver(horodatages: string[], maintenant: Date): string[];
  export function dernierValide(m: Manifeste): EntreeInstantane | undefined;
  ```

**Pourquoi.** §5.5 : rétention des **7 derniers** instantanés, plus **le plus
ancien de chacune des 4 semaines calendaires précédentes**. La promotion se
calcule **à partir des instantanés présents**, jamais d'un calendrier théorique :
si l'app reste fermée trois semaines, les semaines sans instantané restent
vides, rien n'est fabriqué et rien n'est purgé à tort.

Correction §1bis n° 7 : `manifest.json` s'écrit **atomiquement** — c'est le seul
fichier réécrit à chaque passage, et une coupure le laisserait tronqué avec
l'inventaire de toutes les sauvegardes.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { repertoireTemporaire } from "../testing/tmp.js";
import { lireManifeste, ecrireManifeste, aConserver, dernierValide } from "./manifeste.js";

const dir = repertoireTemporaire("backup-manifeste");

describe("manifeste", () => {
  it("un dossier vierge rend un manifeste vide, pas une erreur", async () => {
    expect(await lireManifeste(join(dir(), "neuf"))).toEqual({ version: 1, instantanes: [] });
  });

  it("l'écriture est atomique — aucun fichier temporaire ne survit", async () => {
    const d = join(dir(), "atomique");
    await ecrireManifeste(d, { version: 1, instantanes: [] });
    const fichiers = await readdir(d);
    expect(fichiers).toEqual(["manifest.json"]);
  });

  it("un instantané incomplet n'est jamais le dernier valide", () => {
    const m = {
      version: 1 as const,
      instantanes: [
        { horodatage: "2026-09-01T10-00-00", complet: true, count: 10, watermark: "w1", empreintes: {} },
        { horodatage: "2026-09-02T10-00-00", complet: false, count: 9, watermark: "w2", empreintes: {} },
      ],
    };
    expect(dernierValide(m)?.horodatage).toBe("2026-09-01T10-00-00");
  });
});

describe("rotation", () => {
  const j = (n: number) => `2026-09-${String(n).padStart(2, "0")}T10-00-00`;

  it("garde les sept derniers", () => {
    const tous = Array.from({ length: 10 }, (_, i) => j(i + 10));
    const gardes = aConserver(tous, new Date("2026-09-19T12:00:00Z"));
    expect(gardes).toEqual(expect.arrayContaining(tous.slice(-7)));
  });

  // §5.5 : la promotion se calcule à partir des instantanés PRÉSENTS. Une
  // semaine sans instantané reste vide — rien n'est fabriqué, rien n'est
  // purgé à tort.
  it("des semaines sans instantané ne font rien perdre", () => {
    const tous = ["2026-08-03T10-00-00", "2026-09-14T10-00-00", "2026-09-15T10-00-00"];
    const gardes = aConserver(tous, new Date("2026-09-15T12:00:00Z"));
    expect(gardes).toEqual(expect.arrayContaining(tous));
  });

  it("le plus ancien de chaque semaine précédente échappe à la purge", () => {
    const tous = [
      "2026-08-24T10-00-00", "2026-08-26T10-00-00",          // semaine A
      "2026-08-31T10-00-00",                                   // semaine B
      ...Array.from({ length: 8 }, (_, i) => j(i + 8)),        // les récents
    ];
    const gardes = aConserver(tous, new Date("2026-09-16T12:00:00Z"));
    expect(gardes).toContain("2026-08-24T10-00-00");   // le plus ancien de A
    expect(gardes).not.toContain("2026-08-26T10-00-00"); // pas le second de A
    expect(gardes).toContain("2026-08-31T10-00-00");
  });
});
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

```bash
npx vitest run sidecar/backup/manifeste.test.ts
```

Attendu : `Failed to resolve import "./manifeste.js"`.

- [ ] **Step 3: Écrire `sidecar/backup/manifeste.ts`**

```ts
//! L'inventaire des instantanés, et la règle de rétention.
//!
//! ÉCRITURE ATOMIQUE (correction §1bis n°7) : `manifest.json` est le SEUL
//! fichier réécrit à chaque passage — les instantanés, eux, naissent dans un
//! dossier neuf. Une coupure en cours d'écriture le laisserait tronqué, et
//! avec lui l'inventaire de toutes les sauvegardes.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const FICHIER = "manifest.json";

export interface EntreeInstantane {
  horodatage: string;
  complet: boolean;
  count: number;
  watermark: string;
  empreintes: Record<string, { lignes: number; sha256: string }>;
}

export interface Manifeste {
  version: 1;
  instantanes: EntreeInstantane[];
}

/** Un dossier vierge ou un manifeste illisible rend un inventaire vide : la
 *  prochaine sauvegarde repartira complète, et le dira (§4.1). */
export async function lireManifeste(dossier: string): Promise<Manifeste> {
  try {
    const m = JSON.parse(await readFile(join(dossier, FICHIER), "utf8")) as Manifeste;
    if (m.version === 1 && Array.isArray(m.instantanes)) return m;
  } catch {
    /* absent, tronqué, ou d'une version inconnue */
  }
  return { version: 1, instantanes: [] };
}

export async function ecrireManifeste(dossier: string, m: Manifeste): Promise<void> {
  await mkdir(dossier, { recursive: true });
  const cible = join(dossier, FICHIER);
  const temporaire = `${cible}.en-cours`;
  await writeFile(temporaire, JSON.stringify(m, null, 2), "utf8");
  // Renommage sur le MÊME système de fichiers : atomique.
  await rename(temporaire, cible);
}

export function dernierValide(m: Manifeste): EntreeInstantane | undefined {
  return [...m.instantanes].reverse().find((i) => i.complet);
}

/** Lundi de la semaine d'un horodatage `2026-09-16T10-00-00`, en `YYYY-MM-DD`. */
function semaineDe(horodatage: string): string {
  const d = new Date(`${horodatage.slice(0, 10)}T00:00:00Z`);
  const jour = (d.getUTCDay() + 6) % 7; // lundi = 0
  d.setUTCDate(d.getUTCDate() - jour);
  return d.toISOString().slice(0, 10);
}

/**
 * Les 7 derniers, plus le PLUS ANCIEN de chacune des 4 semaines précédentes.
 *
 * La promotion se calcule à partir des instantanés PRÉSENTS, jamais d'un
 * calendrier théorique (§5.5) : si l'app reste fermée trois semaines, les
 * semaines sans instantané restent vides — rien n'est fabriqué, rien n'est
 * purgé à tort.
 */
export function aConserver(horodatages: string[], maintenant: Date): string[] {
  const tries = [...horodatages].sort();
  const garde = new Set(tries.slice(-7));
  const semaineCourante = semaineDe(maintenant.toISOString().slice(0, 19).replace(/:/g, "-"));

  const parSemaine = new Map<string, string>();
  for (const h of tries) {
    const s = semaineDe(h);
    if (s === semaineCourante) continue;
    // Le plus ancien : `tries` est croissant, donc le premier vu gagne.
    if (!parSemaine.has(s)) parSemaine.set(s, h);
  }
  // Les quatre semaines précédentes les plus récentes.
  for (const h of [...parSemaine.entries()].sort().slice(-4).map(([, v]) => v)) {
    garde.add(h);
  }
  return tries.filter((h) => garde.has(h));
}
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

```bash
npx vitest run sidecar/backup/manifeste.test.ts
```

Attendu : `Tests 6 passed`.

- [ ] **Step 5: Commit**

```bash
git add sidecar/backup/manifeste.ts sidecar/backup/manifeste.test.ts
git commit -m "feat(backup): l'inventaire et la rétention

manifest.json s'écrit atomiquement (correction §1bis n°7) : c'est le seul
fichier réécrit à chaque passage, et une coupure le laisserait tronqué avec
l'inventaire de toutes les sauvegardes.

Rétention : les 7 derniers, plus le plus ancien de chacune des 4 semaines
précédentes — calculé à partir des instantanés PRÉSENTS, jamais d'un calendrier
théorique. Si l'app reste fermée trois semaines, rien n'est fabriqué et rien
n'est purgé à tort."
```

---

### Task 7: Les archives — copies permanentes, orphelins et budget

**Files:**
- Create: `sidecar/backup/archives.ts`
- Create: `sidecar/backup/archives.test.ts`
- Modify: `sidecar/testing/apiServer.ts` (ajouter `/raindrop/:id/cache` et le faux S3)

**Interfaces:**
- Consomme : la file (Task 1).
- Produces :
  ```ts
  export function archiver(deps: {
    token: string; baseUrl?: string; fetchImpl?: typeof fetch;
    file: { run<T>(fn: () => Promise<T>, o?: { rang?: "interactif" | "fond" }): Promise<T> };
    dossierArchives: string; raindropId: number;
  }): Promise<{ ok: true; chemin: string; octets: number } | { ok: false; raison: string }>;
  export function purgerOrphelins(dossierArchives: string, idsVivants: Set<number>): Promise<number>;
  export function appliquerBudget(dossierArchives: string, maxOctets: number): Promise<number>;
  export const ARCHIVES_MAX_GO = 5;
  ```

**Les faits mesurés (§5.4, §10).** `GET /raindrop/{id}/cache` répond **303**
(et non 307 comme l'annonce la doc) vers une URL S3 **signée et temporaire**.
La signature ne couvre que `GET` — un `HEAD` renvoie 403, donc pas de sondage
de taille. Le contenu est du **HTML gzippé** servi en `text/html` : les
fichiers s'écrivent `<raindropId>.html.gz` **tels quels**, nommer `.html` un
contenu gzippé produirait des archives que rien n'ouvre.

Correction §1bis n° 5 : la redirection se suit **à la main**
(`redirect: "manual"`) — suivie automatiquement, l'en-tête `Authorization` du
premier appel serait réémis vers une URL déjà signée, que S3 peut rejeter.

Correction §1bis n° 2 : `archives/` vit hors des instantanés horodatés, donc la
rotation ne le touche pas. Sans règle il croîtrait sans borne, à 2,1 Mo pièce.

- [ ] **Step 1: Étendre le faux serveur**

Dans `sidecar/testing/apiServer.ts`, avant le `json(404, …)` final :

```ts
    if (/^\/rest\/v1\/raindrop\/\d+\/cache$/.test(url.pathname)) {
      // 303, le code MESURÉ — la doc annonce 307 (spec §5.4).
      res.writeHead(303, { Location: `http://127.0.0.1:${port}/s3/objet?X-Amz-Signature=abc` });
      res.end();
      return;
    }
    if (url.pathname === "/s3/objet") {
      // La signature ne couvre que GET : un HEAD est refusé (403), mesuré.
      if (req.method === "HEAD") { res.writeHead(403); res.end(); return; }
      // Un en-tête d'authentification sur une URL DÉJÀ signée est rejeté —
      // c'est ce que la redirection suivie automatiquement provoquerait.
      if (req.headers.authorization) { res.writeHead(400); res.end("signature + auth"); return; }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(gzipSync(Buffer.from("<html>archive</html>")));
      return;
    }
```

En tête du fichier : `import { gzipSync } from "node:zlib";`, et `port` doit
être connu du handler — le capturer dans une variable `let portServi = 0`
assignée après `listen`, et l'utiliser dans le `Location`.

- [ ] **Step 2: Écrire les tests qui échouent**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { repertoireTemporaire } from "../testing/tmp.js";
import { startFauxApi, type FauxApi } from "../testing/apiServer.js";
import { Throttle } from "../mcp/throttle.js";
import { archiver, purgerOrphelins, appliquerBudget } from "./archives.js";

const dir = repertoireTemporaire("backup-archives");
let api: FauxApi | undefined;
afterEach(async () => { await api?.close(); api = undefined; });

describe("archiver", () => {
  it("suit le 303 à la main et écrit du .html.gz tel quel", async () => {
    api = await startFauxApi([]);
    const dossier = join(dir(), "a");
    const r = await archiver({
      token: "j", baseUrl: `http://127.0.0.1:${api.port}/rest/v1`,
      file: new Throttle(0), dossierArchives: dossier, raindropId: 42,
    });
    expect(r.ok).toBe(true);
    const chemin = join(dossier, "42.html.gz");
    const octets = await readFile(chemin);
    // Le contenu reste gzippé : nommer .html un contenu compressé produirait
    // des archives que rien n'ouvre.
    expect(octets.subarray(0, 3)).toEqual(Buffer.from([0x1f, 0x8b, 0x08]));
    expect(gunzipSync(octets).toString()).toContain("archive");
  });
});

describe("rétention des archives", () => {
  it("purge les orphelins — un signet effacé n'a plus d'archive", async () => {
    const dossier = join(dir(), "orphelins");
    await mkdir(dossier, { recursive: true });
    await writeFile(join(dossier, "1.html.gz"), "a");
    await writeFile(join(dossier, "2.html.gz"), "b");
    const supprimes = await purgerOrphelins(dossier, new Set([1]));
    expect(supprimes).toBe(1);
    expect(await readdir(dossier)).toEqual(["1.html.gz"]);
  });

  it("le budget évince les plus anciennes, pas les récentes", async () => {
    const dossier = join(dir(), "budget");
    await mkdir(dossier, { recursive: true });
    await writeFile(join(dossier, "1.html.gz"), Buffer.alloc(100));
    await new Promise((r) => setTimeout(r, 15));
    await writeFile(join(dossier, "2.html.gz"), Buffer.alloc(100));
    const evinces = await appliquerBudget(dossier, 150);
    expect(evinces).toBe(1);
    expect(await readdir(dossier)).toEqual(["2.html.gz"]);
  });
});
```

- [ ] **Step 3: Lancer les tests et vérifier qu'ils échouent**

```bash
npx vitest run sidecar/backup/archives.test.ts
```

Attendu : `Failed to resolve import "./archives.js"`.

- [ ] **Step 4: Écrire `sidecar/backup/archives.ts`**

```ts
//! Les copies permanentes Pro, archivées à la demande.
//!
//! MESURÉ le 2026-09-16 (§5.4) : `GET /raindrop/{id}/cache` répond **303**
//! (la doc annonce 307) vers une URL S3 signée et temporaire ; la signature ne
//! couvre que GET (un HEAD renvoie 403, donc pas de sondage de taille) ; le
//! contenu est du HTML GZIPPÉ servi en `text/html`.
//!
//! La redirection se suit À LA MAIN (correction §1bis n°5) : suivie
//! automatiquement, l'en-tête `Authorization` du premier appel serait réémis
//! vers une URL déjà signée, que S3 peut rejeter.

import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Budget par défaut du dossier d'archives (correction §1bis n°2). */
export const ARCHIVES_MAX_GO = 5;

interface File {
  run<T>(fn: () => Promise<T>, o?: { rang?: "interactif" | "fond" }): Promise<T>;
}

export async function archiver(deps: {
  token: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  file: File;
  dossierArchives: string;
  raindropId: number;
  timeoutMs?: number;
}): Promise<{ ok: true; chemin: string; octets: number } | { ok: false; raison: string }> {
  const base = deps.baseUrl ?? "https://api.raindrop.io/rest/v1";
  const f = deps.fetchImpl ?? fetch;
  const delai = deps.timeoutMs ?? 60_000;

  return deps.file.run(async () => {
    try {
      const r1 = await f(`${base}/raindrop/${deps.raindropId}/cache`, {
        headers: { Authorization: `Bearer ${deps.token}` },
        redirect: "manual",
        signal: AbortSignal.timeout(delai),
      });
      const cible = r1.headers.get("location");
      if (!cible) {
        return { ok: false as const, raison: `pas de redirection (http ${r1.status})` };
      }
      // Second appel SANS en-tête d'authentification : l'URL est déjà signée.
      const r2 = await f(cible, { signal: AbortSignal.timeout(delai) });
      if (!r2.ok) return { ok: false as const, raison: `copie inaccessible (http ${r2.status})` };
      const octets = Buffer.from(await r2.arrayBuffer());
      await mkdir(deps.dossierArchives, { recursive: true });
      // `.html.gz` : le contenu EST gzippé. Le nommer `.html` produirait des
      // archives que rien n'ouvre.
      const chemin = join(deps.dossierArchives, `${deps.raindropId}.html.gz`);
      await writeFile(chemin, octets);
      return { ok: true as const, chemin, octets: octets.byteLength };
    } catch (e) {
      return { ok: false as const, raison: e instanceof Error ? e.message : String(e) };
    }
  }, { rang: "fond" });
}

const ID_DE = (nom: string): number | undefined => {
  const m = /^(\d+)\.html\.gz$/.exec(nom);
  return m ? Number(m[1]) : undefined;
};

/**
 * Une archive dont l'identifiant n'est plus vivant est supprimée. Appelée à
 * chaque balayage complet, où l'ensemble des identifiants est justement connu
 * (correction §1bis n°2) — sans quoi l'archive d'un signet effacé resterait
 * indéfiniment sous un identifiant qui ne résout plus.
 */
export async function purgerOrphelins(dossierArchives: string, idsVivants: Set<number>): Promise<number> {
  let supprimes = 0;
  let noms: string[];
  try {
    noms = await readdir(dossierArchives);
  } catch {
    return 0; // pas encore d'archives
  }
  for (const nom of noms) {
    const id = ID_DE(nom);
    if (id !== undefined && !idsVivants.has(id)) {
      await rm(join(dossierArchives, nom), { force: true });
      supprimes++;
    }
  }
  return supprimes;
}

/**
 * Au-delà du budget, les archives les PLUS ANCIENNES sont évincées jusqu'à
 * repasser sous le seuil. Une archive évincée se recrée à la demande —
 * l'endpoint `/cache` reste la source. Pas d'exception pour les liens morts :
 * une règle unique vaut mieux qu'une exception qui rouvrirait la croissance
 * sans borne.
 */
export async function appliquerBudget(dossierArchives: string, maxOctets: number): Promise<number> {
  let noms: string[];
  try {
    noms = await readdir(dossierArchives);
  } catch {
    return 0;
  }
  const fichiers = [];
  for (const nom of noms) {
    if (ID_DE(nom) === undefined) continue;
    const s = await stat(join(dossierArchives, nom));
    fichiers.push({ nom, octets: s.size, mtime: s.mtimeMs });
  }
  let total = fichiers.reduce((n, f) => n + f.octets, 0);
  fichiers.sort((a, b) => a.mtime - b.mtime); // le plus ancien d'abord
  let evinces = 0;
  for (const f of fichiers) {
    if (total <= maxOctets) break;
    await rm(join(dossierArchives, f.nom), { force: true });
    total -= f.octets;
    evinces++;
  }
  return evinces;
}
```

- [ ] **Step 5: Lancer les tests et vérifier qu'ils passent**

```bash
npx vitest run sidecar/backup/archives.test.ts
npm test
```

Attendu : `Tests 3 passed` sur le fichier, et la suite complète verte.

- [ ] **Step 6: Commit**

```bash
git add sidecar/backup/archives.ts sidecar/backup/archives.test.ts sidecar/testing/apiServer.ts
git commit -F - <<'EOF'
feat(backup): les archives — 303 suivi à la main, orphelins et budget

Le 303 (mesuré ; la doc annonce 307) se suit À LA MAIN : suivi
automatiquement, l'en-tête Authorization du premier appel serait réémis vers
une URL DÉJÀ signée, que S3 peut rejeter (correction §1bis n°5). Le faux
serveur de test refuse 400 dans ce cas — le piège est verrouillé, pas
seulement évité.

Le contenu reste gzippé et s'écrit `<id>.html.gz` : nommer .html un contenu
compressé produirait des archives que rien n'ouvre.

Et la rétention qui manquait (correction §1bis n°2) : archives/ vit hors des
instantanés horodatés, donc la rotation ne l'atteignait pas. Purge des
orphelins à chaque balayage complet, et budget de 5 Go avec éviction du plus
ancien — une archive évincée se recrée, /cache reste la source.
EOF
```

---

### Task 8: Le câblage — orchestration, routes, job SSE

**Files:**
- Create: `sidecar/backup/sauvegarde.ts`
- Create: `sidecar/backup/sauvegarde.test.ts`
- Create: `sidecar/api/routes/sauvegarde.ts`
- Modify: `sidecar/api/app.ts`, `sidecar/api/deps.ts`, `sidecar/index.ts`, `sidecar/config.ts`

**Interfaces:**
- Consomme : toutes les tasks précédentes.
- Produces :
  ```ts
  export interface Sauvegarde {
    executer(mode: "complet" | "incremental", job?: JobHandle): Promise<EntreeInstantane>;
    doitBalayerComplet(m: Manifeste, maintenant: Date): boolean;
  }
  export function makeSauvegarde(deps: { lecture: Lecture; dossier: string; file: File; token: string }): Sauvegarde;
  ```
- Routes : `POST /api/backup/run` (`{ mode }` → job SSE),
  `GET /api/backup/status` (dernier instantané valide, date, complétude).

**Ce que l'orchestration doit tenir :**

- **Balayage complet au moins une fois par semaine** (§5.3), que les compteurs
  aient bougé ou non — la comparaison de compteurs est un *déclencheur bon
  marché, pas une garantie* : une suppression **et** un ajout entre deux
  passages laissent le compte inchangé.
- **Déclenchement** (§4.4) : au démarrage si la dernière sauvegarde date de
  plus de 24 h, plus le déclenchement manuel.
- **Le dossier inaccessible** (§4.1) : l'incrémental devient impossible, la
  sauvegarde repart complète, et **le dit**.
- **Ce qui est collecté** (§5.1) : `/raindrops/0`, `/raindrops/-99` (la
  corbeille — elle contient ce que l'utilisateur vient de supprimer, donc
  exactement ce qu'une sauvegarde doit pouvoir rendre), `/collections`,
  `/highlights` (**l'endpoint global** — jamais bookmark par bookmark, ce
  serait 12 210 requêtes ≈ 2 h), `/user`.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
import { describe, it, expect } from "vitest";
import { makeSauvegarde } from "./sauvegarde.js";
import type { Manifeste } from "./manifeste.js";

const vide: Manifeste = { version: 1, instantanes: [] };
const avec = (horodatage: string): Manifeste => ({
  version: 1,
  instantanes: [{ horodatage, complet: true, count: 10, watermark: "w", empreintes: {} }],
});

describe("quand faut-il un balayage complet", () => {
  const s = makeSauvegarde({ lecture: {} as never, dossier: "/tmp/x", file: {} as never, token: "j" });

  it("jamais sauvegardé : complet", () => {
    expect(s.doitBalayerComplet(vide, new Date("2026-09-18T10:00:00Z"))).toBe(true);
  });

  it("sauvegardé hier : l'incrémental suffit", () => {
    expect(s.doitBalayerComplet(avec("2026-09-17T10-00-00"), new Date("2026-09-18T10:00:00Z"))).toBe(false);
  });

  // §5.3 : la comparaison de compteurs est un déclencheur bon marché, PAS une
  // garantie — une suppression ET un ajout laissent le compte inchangé.
  it("plus de sept jours sans balayage complet : complet, quoi qu'en disent les compteurs", () => {
    expect(s.doitBalayerComplet(avec("2026-09-10T10-00-00"), new Date("2026-09-18T10:00:00Z"))).toBe(true);
  });

  it("un instantané incomplet ne compte pas comme un balayage", () => {
    const m: Manifeste = {
      version: 1,
      instantanes: [{ horodatage: "2026-09-17T10-00-00", complet: false, count: 1, watermark: "w", empreintes: {} }],
    };
    expect(s.doitBalayerComplet(m, new Date("2026-09-18T10:00:00Z"))).toBe(true);
  });
});
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

```bash
npx vitest run sidecar/backup/sauvegarde.test.ts
```

Attendu : `Failed to resolve import "./sauvegarde.js"`.

- [ ] **Step 3: Écrire `sidecar/backup/sauvegarde.ts`**

L'orchestration, en suivant exactement les flux du §5. Points obligatoires :

```ts
/** Sept jours — §5.3 : « un balayage complet est exécuté au moins une fois par
 *  semaine, que les compteurs aient bougé ou non ». La comparaison de
 *  compteurs est un déclencheur bon marché, pas une garantie : une suppression
 *  ET un ajout entre deux passages laissent le compte inchangé, et l'élément
 *  supprimé survivrait indéfiniment comme s'il existait encore. */
const JOURS_BALAYAGE_COMPLET = 7;
```

`doitBalayerComplet(m, maintenant)` rend `true` si `dernierValide(m)` est
absent, ou si son horodatage remonte à plus de `JOURS_BALAYAGE_COMPLET`.

`executer("complet")` : `balayerComplet` sur `0` puis sur `-99`, les
collections, les highlights paginés, l'utilisateur ; `verifierJsonl` sur chaque
fichier écrit ; `purgerOrphelins(archives, ids)` et
`appliquerBudget(archives, ARCHIVES_MAX_GO * 2**30)` ; entrée ajoutée au
manifeste avec `complet` **issu du résultat du balayage**, jamais forcé à
`true` ; rotation via `aConserver`.

`executer("incremental")` : relit le dernier instantané valide, applique
`lireModifies`, écrit le suivant. Si le dossier est inaccessible ou si la
vérification d'empreinte du précédent échoue, **bascule en complet** et le
signale — §6 : « sans quoi une corruption silencieuse se propagerait de
sauvegarde en sauvegarde ».

- [ ] **Step 4: Écrire la route et le câblage**

`sidecar/api/routes/sauvegarde.ts` — `POST /run` crée un job via `deps.jobs`
(le même `runJob` que les scans, `sidecar/jobs/`), `GET /status` rend le dernier
instantané valide. `sidecar/config.ts` gagne `BACKUP_DIR` (optionnel — sans
lui, la sauvegarde est inactive et le dit ; le sélecteur graphique viendra du
shell Tauri).

- [ ] **Step 5: Vérifier l'ensemble**

```bash
npm test
npm run typecheck
npm run typecheck:front
wc -l sidecar/backup/*.ts
```

Attendu : suite complète verte, typechecks propres, **chaque fichier de
`sidecar/backup/` sous 300 lignes**.

- [ ] **Step 6: Commit**

```bash
git add sidecar/backup/ sidecar/api/ sidecar/config.ts sidecar/index.ts
git commit -m "feat(backup): l'orchestration, la route et le job SSE

Le balayage complet est exécuté au moins une fois par semaine, que les
compteurs aient bougé ou non (§5.3) : la comparaison de compteurs est un
déclencheur bon marché, PAS une garantie — une suppression et un ajout entre
deux passages laissent le compte inchangé, et l'élément supprimé survivrait
indéfiniment comme s'il existait encore.

La corbeille est sauvegardée : elle contient ce que l'utilisateur vient de
supprimer, donc exactement ce qu'une sauvegarde doit pouvoir rendre. Les
surlignages passent par l'endpoint GLOBAL — un par bookmark serait 12 210
requêtes, ≈ 2 h.

Un instantané dont l'empreinte ne se vérifie plus ne sert jamais de base à un
incrémental : sans cela une corruption silencieuse se propagerait de sauvegarde
en sauvegarde."
```

---

## Auto-relecture

**Couverture de la spec.**

| Exigence | Task |
|---|---|
| §3.2 canal REST direct | 2 |
| §3.4 format brut | 2 (`unknown[]`, jamais `toRaindropItem`) |
| §4.2 arborescence, JSONL | 3, 8 |
| §4.2 tri ascendant **+ réconciliation** (§1bis n°1) | **4** |
| §4.4 file partagée, priorité **+ plancher** (§1bis n°3) | **1** |
| §4.4 déclenchement 24 h | 8 |
| §5.1 ce qui est collecté (corbeille, highlights globaux) | 8 |
| §5.2 incrémental **+ égalité de dates** (§1bis n°4) | **5** |
| §5.3 balayage hebdomadaire garanti | 8 |
| §5.4 archives, 303 **suivi à la main** (§1bis n°5) | **7** |
| §5.4 rétention des archives (§1bis n°2) | **7** |
| §5.5 rotation calculée sur les instantanés présents | 6 |
| §6 vérification post-écriture, empreintes | 3, 8 |
| §6 manifeste atomique (§1bis n°7) | **6** |
| §7 vrai serveur HTTP local | 2 (`apiServer.ts`), 7 |

**Non couvert par ce plan, et assumé :**

- **§5.6 export lisible** (CSV/HTML dérivé de l'instantané) — c'est une vue,
  pas la sauvegarde ; elle se dérive hors ligne sans requête et ne bloque rien.
  À son propre lot, une fois qu'il y a des instantanés à exporter.
- **§3.5 l'avertissement au choix du dossier** — il vit dans l'écran de
  sélection, donc dans le shell Tauri (§4.3 : « le sélecteur de dossier relève
  de Tauri »). Le moteur se livre avec un chemin de configuration ; l'écran et
  son avertissement viendront avec le sélecteur.
- **§1bis n°6 (`archives/` nommé dans l'avertissement)** suit le même chemin.

**Cohérence des types.** `Lecture` (Task 2) est consommée telle quelle par 4, 5
et 8 ; `EntreeInstantane` et `Manifeste` (Task 6) par 8 ; `ResultatBalayage.ids`
(Task 4) alimente `purgerOrphelins` (Task 7) ; le rang `"fond"` de la file
(Task 1) est passé par `lecture.ts` et `archives.ts`, jamais par les appels
interactifs existants.
