# Lecture du contenu archivé et page web réelle — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deux gestes depuis la fiche — **Lire** le contenu archivé dans une vue de lecture confortable (texte extrait, serif, rail de métadonnées) et **Voir la page** réelle dans une fenêtre webview dédiée créée par le shell (zéro capability).

**Architecture:** Le sidecar sert le `.html.gz` décompressé **en flux** (`createGunzip` chaîné à la réponse, jamais la copie entière en mémoire) par une route nouvelle `GET /api/backup/archives/:id/content` ; le front extrait le texte avec `DOMParser` (natif du webview, zéro dépendance) et le rend en colonne serif ~66 caractères avec rail droit. La fenêtre page web est une commande Tauri `ouvrir_page_web(url)` qui valide au bord Rust (http/https uniquement), étiquette la fenêtre par empreinte SHA-256 de l'URL (rouvrir = concentrer), et la crée **hors de toute capability** — un site dans cette fenêtre est un œil, pas une main.

**Tech Stack:** Tauri 2 (Rust, `url` + `sha2` déjà dans l'arbre), sidecar Node/Hono (zlib en flux), React 19 + react-query, Vitest (jsdom pour le front, node pour le sidecar), `cargo test`.

**Spec:** `docs/superpowers/specs/2026-09-19-lecture-et-page-web-design.md` — le plan argue de la spec ; les exécuteurs lisent les deux. Le périmètre verrouillé (spec principale §3) tient : pas d'IA, Raindrop seule source de vérité, suppression = corbeille.

**Amendé le 2026-09-21** (relecture critique intégrant `docs/KARAKEEP.md`,
l'analyse du gestionnaire voisin) : la lecture v1 rend des **blocs filtrés
par whitelist** — titres, emphases, listes, citations, images de l'archive —
reconstruits en arbre React (`createElement`, jamais d'`innerHTML`), plus du
texte nu ; le rail porte le **temps de lecture** (calculé, ≈ 220 mots/min).
La spec 2026-09-19 est amendée en conséquence (§3 et §8). Hors v1, nommés :
repositionner les highlights dans le contenu lu (blocant : Raindrop n'expose
pas d'offsets, seul le texte), classifieur de qualité d'extraction, plein
écran sans sidebar.

## Global Constraints

- **Taille des fichiers : cible ≤ 300 lignes, plafond dur 400** (CLAUDE.md). Tout fichier nouveau ci-dessous est compté ; `DetailPane.tsx` (271) ne grossit que de 3 lignes.
- **Imports relatifs avec extension `.js`** côté sidecar (moduleResolution nodenext) — sinon le build `tsc` est cassé au runtime.
- **Interface en français**, externalisée dans `src/i18n/fr.ts`. Règle du `|` : **le singulier vaut pour 0 comme pour 1**, pluriel dès 2, sur la variable `n` ; jamais plus d'un `|` par valeur. Les états venus du sidecar se TRADUISENT (jamais d'identifiant interne à l'écran) — même motif que `LABELS_PROGRESSION`.
- **Jamais d'`innerHTML` avec le contenu archivé** : l'extraction ne garde que du `textContent` — l'injection est exclue par construction, aucune « sanitisation » n'a à être crue (spec §3).
- **API locale 127.0.0.1 + Bearer**, comme toute l'API ; le token Raindrop ne transite jamais. La route de lecture est LOCALE (aucun appel Raindrop) : elle n'emprunte pas la file à 550 ms.
- **Chiffres en dur dans l'interface : jamais.** La garde de 64 Mo est une constante nommée du sidecar ; tout le reste se calcule.
- **Tests** : `npm test` (vitest). Un test qui décide d'un commit : `npm test > /tmp/t.log 2>&1; rc=$?` puis tester `$rc` — **jamais** `npm test | tail` (le code de sortie serait celui de `tail`).
- **Typechecks** : `npm run typecheck` (sidecar + tests via `tsconfig.check.json`) et `npm run typecheck:front`. Après un découpage de fichier : `npx tsc -p tsconfig.front.json --noEmit --noUnusedLocals` (les imports morts ne sont signalés par rien d'autre).
- **Sabotage** : un test non sabordé n'est pas une couverture. Chaque tâche ci-dessous contient son pas de sabotage quand une assertion d'absence ou de garde est en jeu.
- **Commits** : trailer nommant le modèle RÉELLEMENT actif (CLAUDE.md, qui prend le pas sur toute mention générique) — sous cette session GLM : `Co-Authored-By: GLM 5.3 <noreply@z.ai>`. À revérifier au moment d'exécuter.
- **Interdit** : lancer l'analyse des liens en grand (11 968 requêtes tiers) ; ce lot n'y touche pas. Sondes réseau : 1-3 requêtes de métadonnées max.

## Décisions posées par ce plan (la spec laissait le détail ouvert)

| Question | Tranché ici | Pourquoi |
|---|---|---|
| Refus nommés de la route | `ARCHIVE_ABSENTE` (404), `ARCHIVE_TROP_VOLUMINEUSE` (413), `ARCHIVE_ILLISIBLE` (500) — trois codes nouveaux dans `shared/errors.ts` | La spec exige « 404 nommé » et « refus avec raison nommée » ; l'union `ErrorCode` n'avait ni 404 ni 413 |
| Comment la garde de 64 Mo refuse AVANT tout envoi | Lecture de `ISIZE` (les 4 derniers octets d'un gzip = taille décompressée mod 2^32) + vérif de la magie `1f 8b`, à froid sur le descripteur de fichier | Décompresser pour compter réintroduirait la copie entière en mémoire ; 4 octets suffisent. Une archive ≥ 4 Go ne peut pas exister : l'écriture coupe à 256 Mo (`ARCHIVE_MAX_OCTETS`) |
| Fausse garde du test sans fichier de 64 Mo | Fixture valide dont on RÉÉCRIT les 4 octets d'ISIZE avec 65 Mo | Le garde lit ISIZE avant tout flux : la fixture exerce exactement ce qu'il lit |
| La fiche pendant la lecture | **Démontée** (`detailOuvert` devient faux en vue `lecture`) ; la sélection reste, le retour la retrouve | « Vue pleine largeur » (spec §3) ; le rail porte les métadonnées — fiche + rail ensemble dupliqueraient tout (« l'écran ne surcharge jamais », DESIGN §9) |
| Étiquettes du rail | Ligne de texte simple (`a · b`), pas des pilules | Une pilule inerte « fait douter de l'autre » (DESIGN §9) ; une pilule cliquable NAVIGUERAIT hors de la lecture (comportement mesuré hors vue liste) et perdrait la position de lecture |
| Le retour lecture | `vueDeRetour(view)` exportée de `appState.tsx`, partagée avec la Revue | « Même règle que la Revue » (spec §3) : une seule définition, testée une fois |
| Téléchargement à la demande dans la fiche | Réutilise `ArchiveJob` (RevueArchive.tsx) MAIS la fiche refuse de le monter tant qu'un archivage est en vol (`useJobsEnVol`) | L'adoption d'un job ÉTRANGER (un lot de la Revue) ferait croire à un téléchargement qui n'a pas eu lieu ; la route refuserait de toute façon — nommer l'attente est plus honnête |
| Étiquette et titre de la fenêtre webview | Label `page-` + 16 hex de SHA-256 de l'URL ; titre = hôte | Les labels Tauri n'admettent que `[A-Za-z0-9_/-:]` ; l'empreinte concentre les réouvertures (spec §4) |
| Création de la fenêtre | `run_on_main_thread` + verdict par canal mpsc | Trap plan 3 : tout ce qui touche la fenêtre vit sur le thread principal ; une commande async y échappe |

---

### Task 1: `contenuArchive.ts` — la lecture EN FLUX d'une archive

**Files:**
- Create: `sidecar/backup/contenuArchive.ts`
- Test: `sidecar/backup/contenuArchive.test.ts`

**Interfaces:**
- Consumes: rien (module autonome sur `node:fs`/`node:zlib`).
- Produces: `LECTURE_MAX_OCTETS = 64 * 2 ** 20` ; `type ContenuArchive = { ok: true; flux: ReadableStream<Uint8Array>; dateIso: string } | { ok: false; raison: "introuvable" | "trop-volumineuse" | "illisible"; detail: string }` ; `lireContenu(dossierArchives: string, id: number): Promise<ContenuArchive>` — consommés par la Task 2.

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// sidecar/backup/contenuArchive.test.ts
import { describe, it, expect } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { text } from "node:stream/consumers";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { gzipSync } from "node:zlib";
import { repertoireTemporaire } from "../testing/tmp.js";
import { lireContenu, LECTURE_MAX_OCTETS } from "./contenuArchive.js";

// `repertoireTemporaire` rend une string, pas une fabrique (trap lot 09-18).
const dir = () => repertoireTemporaire("lecture-contenu-");

const poser = async (id: number, octets: Buffer, base = dir()): Promise<string> => {
  const dossier = join(base, "archives");
  await mkdir(dossier, { recursive: true });
  await writeFile(join(dossier, `${id}.html.gz`), octets);
  return dossier;
};

const corps = async (v: Awaited<ReturnType<typeof lireContenu>>): Promise<string> =>
  v.ok ? await text(Readable.fromWeb(v.flux as unknown as NodeReadableStream)) : "";

describe("lireContenu", () => {
  it("sert le HTML DÉCOMPRIMÉ, fidèle à l'archive (spec lecture §3)", async () => {
    const original = "<html><body><p>bonjour</p></body></html>";
    const dossier = await poser(42, gzipSync(Buffer.from(original)));
    const v = await lireContenu(dossier, 42);
    expect(v.ok).toBe(true);
    expect(await corps(v)).toBe(original); // décompressé, et PAS autre chose
    if (v.ok) expect(Number.isNaN(new Date(v.dateIso).getTime())).toBe(false);
  });

  it("sans archive : « introuvable », jamais une 500 (404 nommé de la spec §5)", async () => {
    const dossier = await poser(42, gzipSync(Buffer.from("x")));
    const v = await lireContenu(dossier, 99);
    expect(v).toMatchObject({ ok: false, raison: "introuvable" });
  });

  it("un fichier qui n'est pas du gzip est « illisible » AVANT tout flux", async () => {
    const dossier = await poser(42, Buffer.from("<html>pas gzip</html>"));
    const v = await lireContenu(dossier, 42);
    expect(v).toMatchObject({ ok: false, raison: "illisible" });
  });

  it("une archive trop courte n'est pas un gzip", async () => {
    const dossier = await poser(42, Buffer.from([0x1f, 0x8b])); // la magie seule
    const v = await lireContenu(dossier, 42);
    expect(v).toMatchObject({ ok: false, raison: "illisible" });
  });

  it("la garde de 64 Mo coupe sur l'ISIZE, avec sa raison (spec lecture §3)", async () => {
    // Fixture HONNÊTE pour le garde : un vrai petit gzip dont on RÉÉCRIT les
    // 4 octets d'ISIZE à 65 Mo. Le garde lit l'ISIZE avant tout flux — la
    // fixture exerce exactement ce qu'il lit, sans 64 Mo sur le disque.
    const vrai = gzipSync(Buffer.from("<html>petit</html>"));
    const annonce = Buffer.from(vrai);
    annonce.writeUInt32LE(65 * 2 ** 20, annonce.length - 4);
    const dossier = await poser(42, annonce);
    const v = await lireContenu(dossier, 42);
    expect(v).toMatchObject({ ok: false, raison: "trop-volumineuse" });
    if (!v.ok) expect(v.detail).toMatch(/64 Mo/);
  });

  it("la garde est à 64 Mo exactement — la constante que la spec a bornée", () => {
    expect(LECTURE_MAX_OCTETS).toBe(64 * 2 ** 20);
  });

  it("un gz corrompu AU CORPS interrompt le flux sans plante — le refus du front, pas du serveur", async () => {
    const vrai = gzipSync(Buffer.from("<html>" + "x".repeat(400) + "</html>"));
    const faux = Buffer.from(vrai);
    faux.fill(0x00, 10, faux.length - 8); // corps n'importe quoi
    faux.writeUInt32LE(400, faux.length - 4); // ISIZE crédible : les contrôles à froid passent
    const dossier = await poser(42, faux);
    const v = await lireContenu(dossier, 42);
    expect(v.ok).toBe(true); // rien ne le détecte à froid : c'est À MI-FLUX que ça casse
    await expect(corps(v)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `npx vitest run sidecar/backup/contenuArchive.test.ts`
Expected: FAIL — « Cannot find module './contenuArchive.js' » (le module n'existe pas encore).

- [ ] **Step 3: Écrire l'implémentation**

```ts
// sidecar/backup/contenuArchive.ts
//! La lecture du contenu archivé (spec lecture §3) : le `.html.gz` rendu
//! DÉCOMPRIMÉ EN FLUX — jamais la copie entière en mémoire, la leçon de
//! l'écriture (lot 2026-09-18) appliquée à la lecture.
//!
//! Le refus NOMMÉ n'est possible qu'AVANT le premier octet envoyé. D'où des
//! contrôles à froid, sur le seul descripteur de fichier :
//! - la magie `1f 8b` sur les deux premiers octets : un fichier qui n'est
//!   pas gzip est nommé « illisible » au lieu d'exploser à mi-flux ;
//! - `ISIZE` (les 4 derniers octets d'un gzip) porte la taille décompressée
//!   **modulo 2^32** — lisible en 4 octets, là où décompresser pour compter
//!   coûterait la lecture entière. Le dépassement de modulo n'est pas
//!   atteignable : l'écriture coupe à 256 Mo (`ARCHIVE_MAX_OCTETS`), aucun
//!   fichier de ce dossier ne peut annoncer un ISIZE enveloppé.
//!
//! La corruption EN COURS de flux reste possible (en-tête vrai, corps faux) :
//! le flux s'interrompt alors, le sidecar ne plante pas (testé), et le front
//! nomme l'échec « archive illisible » (spec §5).

import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";

/** Garde de décompression (spec lecture §3). MESURÉ (2026-09-19) : le p99
 *  stocké (31,5 Mo) sort à ~47 Mo décompressé (rapport 1,5×) — seuls les
 *  hors-normes (≈ > 42 Mo stockés) la rencontrent. */
export const LECTURE_MAX_OCTETS = 64 * 2 ** 20;

export type ContenuArchive =
  | { ok: true; flux: ReadableStream<Uint8Array>; dateIso: string }
  | { ok: false; raison: "introuvable" | "trop-volumineuse" | "illisible"; detail: string };

export async function lireContenu(dossierArchives: string, id: number): Promise<ContenuArchive> {
  // `id` est déjà un entier (la route l'a validé) : le nom de fichier n'est
  // pas un chemin négociable.
  const chemin = join(dossierArchives, `${id}.html.gz`);
  let fh: Awaited<ReturnType<typeof open>>;
  try {
    fh = await open(chemin, "r");
  } catch {
    return { ok: false, raison: "introuvable", detail: `aucune archive pour le signet ${id}` };
  }
  try {
    const s = await fh.stat();
    // 18 octets = 10 d'en-tête + 8 de pied gzip : en dessous, rien à déplier.
    if (s.size < 18) {
      return { ok: false, raison: "illisible", detail: `archive trop courte (${s.size} octets) pour être un gzip` };
    }
    const magie = Buffer.alloc(2);
    await fh.read(magie, 0, 2, 0);
    if (!(magie[0] === 0x1f && magie[1] === 0x8b)) {
      return { ok: false, raison: "illisible", detail: "l'archive n'est pas du gzip (signature absente)" };
    }
    const isize = Buffer.alloc(4);
    await fh.read(isize, 0, 4, s.size - 4);
    const decomprime = isize.readUInt32LE(0);
    if (decomprime > LECTURE_MAX_OCTETS) {
      return {
        ok: false,
        raison: "trop-volumineuse",
        detail: `décompressée, l'archive dépasserait la garde de ${Math.round(LECTURE_MAX_OCTETS / 2 ** 20)} Mo (ISIZE annonce ${decomprime})`,
      };
    }
    const flux = Readable.toWeb(createReadStream(chemin).pipe(createGunzip())) as ReadableStream<Uint8Array>;
    return { ok: true, flux, dateIso: s.mtime.toISOString() };
  } finally {
    await fh.close();
  }
}
```

- [ ] **Step 4: Vérifier que le test passe**

Run: `npx vitest run sidecar/backup/contenuArchive.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Sabotage — prouver que la garde mord**

Inverser temporairement le comparateur (`decomprime < LECTURE_MAX_OCTETS`).
Run: `npx vitest run sidecar/backup/contenuArchive.test.ts`
Expected: FAIL sur « la garde de 64 Mo coupe ». Remettre `<` → `>`, re-run : PASS. (Sans ce pas, le test de garde peut passer sur un module qui ne garde rien.)

- [ ] **Step 6: Commit**

```bash
git add sidecar/backup/contenuArchive.ts sidecar/backup/contenuArchive.test.ts
git commit -m "feat(sidecar): lireContenu — le .html.gz décompressé en flux, refus nommés à froid

Co-Authored-By: GLM 5.3 <noreply@z.ai>"
```

---

### Task 2: La route `/api/backup/archives/:id/content`, les codes d'erreur, l'exposition CORS

**Files:**
- Modify: `shared/errors.ts` (union `ErrorCode` + `STATUS_BY_CODE`)
- Modify: `sidecar/backup/archivage.ts:38-45,135-150` (l'interface `Archivage` expose `dossierArchives`)
- Modify: `sidecar/api/routes/sauvegarde.ts` (la route, après `app.get("/archives", …)`)
- Modify: `sidecar/api/app.ts:44-45` (exposition CORS de `X-Archive-Date`)
- Test: `sidecar/api/routes/sauvegarde.lecture.test.ts`

**Interfaces:**
- Consumes: `lireContenu`, `LECTURE_MAX_OCTETS` (Task 1) ; `apiError(c, code, message)` ; le motif `deps()` des tests de `sauvegarde.test.ts`.
- Produces: `GET /api/backup/archives/:id/content` → 200 `text/html; charset=utf-8` + `X-Archive-Date` (ISO) + corps HTML décompressé ; 400 `INVALID_INPUT` (identifiant non entier, sauvegarde inactive) ; 404 `ARCHIVE_ABSENTE` ; 413 `ARCHIVE_TROP_VOLUMINEUSE` ; 500 `ARCHIVE_ILLISIBLE`. `Archivage.dossierArchives: string`. `ErrorCode` gagne `"ARCHIVE_ABSENTE" | "ARCHIVE_TROP_VOLUMINEUSE" | "ARCHIVE_ILLISIBLE"`.

- [ ] **Step 1: Étendre `shared/errors.ts`**

Union `ErrorCode`, ajouter à la fin :

```ts
  | "ARCHIVE_ABSENTE" // spec lecture §5 : l'archive a disparu entre le marqueur et le clic
  | "ARCHIVE_TROP_VOLUMINEUSE" // garde de décompression 64 Mo (spec lecture §3)
  | "ARCHIVE_ILLISIBLE" // gzip défectueux : les contrôles à froid n'ont pas tout attrapé
```

Et dans `STATUS_BY_CODE` (le type du Record devient `400 | 404 | 409 | 413 | 429 | 500 | 502 | 503 | 504`, idem l'annotation de retour d'`apiError`) :

```ts
  ARCHIVE_ABSENTE: 404,
  ARCHIVE_TROP_VOLUMINEUSE: 413,
  ARCHIVE_ILLISIBLE: 500,
```

- [ ] **Step 2: Exposer `dossierArchives` sur `Archivage`**

Dans `sidecar/backup/archivage.ts`, interface `Archivage` :

```ts
export interface Archivage {
  /** Archive les identifiants donnés, un par un. Rend le détail — un échec
   *  sur un signet n'interrompt jamais les suivants. */
  archiver(ids: number[], job?: JobHandle): Promise<ResultatArchivage>;
  enCours(): boolean;
  /** Ce qui est archivé, pour le panneau et les marqueurs (spec sélection §4.1). */
  inventaire(): Promise<{ ids: number[]; octets: number }>;
  /** Le dossier `archives/` réel — la route de lecture y sert le contenu
   *  (spec lecture §3). Le chemin vit ICI (même dérivation que l'écriture,
   *  `join(deps.dossier, "archives")`), jamais recalculé ailleurs. */
  readonly dossierArchives: string;
}
```

Et dans le `return { … }` de `makeArchivage` : `dossierArchives,` (la constante `dossierArchives` existe déjà ligne 64).

- [ ] **Step 3: Écrire le test qui échoue**

```ts
// sidecar/api/routes/sauvegarde.lecture.test.ts
import { describe, it, expect } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { createApp } from "../app.js";
import type { SidecarDeps } from "../deps.js";
import { JobStore } from "../../jobs/store.js";
import { Throttle } from "../../mcp/throttle.js";
import { makeArchivage } from "../../backup/archivage.js";
import { repertoireTemporaire } from "../../testing/tmp.js";

const TOKEN = "t";

// Même motif que sauvegarde.test.ts : les deps factices, l'archivage RÉEL —
// la lecture ne passe par le réseau à aucun moment, seul le dossier compte.
const deps = (archivage?: SidecarDeps["archivage"]): SidecarDeps => ({
  mcp: async () => ({ ok: true as const, data: {} }),
  state: () => "connected",
  restart: async () => undefined,
  jobs: new JobStore(),
  cache: {} as SidecarDeps["cache"],
  scanner: {} as SidecarDeps["scanner"],
  origins: {} as SidecarDeps["origins"],
  direct: {} as SidecarDeps["direct"],
  ...(archivage ? { archivage } : {}),
});

const req = async (
  hono: ReturnType<typeof createApp>,
  path: string,
  init?: RequestInit,
): Promise<Response> =>
  hono.request(path, { ...init, headers: { Authorization: `Bearer ${TOKEN}` } });

// Un archivage RÉEL posé sur un dossier temporaire — `makeArchivage` dérive
// `dossierArchives` de `dossier`, exactement comme en production.
const archivageReel = () => {
  const rep = repertoireTemporaire("lecture-route-");
  return { archivage: makeArchivage({ token: "j", dossier: rep, file: new Throttle(0) }), rep };
};

const poserArchive = async (rep: string, id: number, octets: Buffer): Promise<void> => {
  const dossier = join(rep, "archives");
  await mkdir(dossier, { recursive: true });
  await writeFile(join(dossier, `${id}.html.gz`), octets);
};

const original = "<html><body><p>article fidèle</p></body></html>";

describe("GET /api/backup/archives/:id/content", () => {
  it("sans dossier configuré, refuse lisiblement (400, BACKUP_DIR)", async () => {
    const app = createApp(deps(), { localToken: TOKEN });
    const res = await req(app, "/api/backup/archives/42/content");
    expect(res.status).toBe(400);
    const corpsJson = (await res.json()) as { error: { code: string; message: string } };
    expect(corpsJson.error.code).toBe("INVALID_INPUT");
    expect(corpsJson.error.message).toMatch(/BACKUP_DIR/);
  });

  it("un identifiant non entier est refusé AVANT de construire un nom de fichier", async () => {
    const { archivage } = archivageReel();
    const app = createApp(deps(archivage), { localToken: TOKEN });
    const res = await req(app, "/api/backup/archives/abc/content");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("INVALID_INPUT");
  });

  it("sert le HTML décompressé FIDÈLE, en text/html, daté par X-Archive-Date", async () => {
    const { archivage, rep } = archivageReel();
    await poserArchive(rep, 42, gzipSync(Buffer.from(original)));
    const app = createApp(deps(archivage), { localToken: TOKEN });
    const res = await req(app, "/api/backup/archives/42/content");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toBe(original);
    const date = res.headers.get("x-archive-date");
    expect(date).not.toBeNull();
    expect(Number.isNaN(new Date(date!).getTime())).toBe(false);
  });

  it("404 ARCHIVE_ABSENTE sur identifiant sans archive (spec lecture §5)", async () => {
    const { archivage, rep } = archivageReel();
    await poserArchive(rep, 42, gzipSync(Buffer.from(original)));
    const app = createApp(deps(archivage), { localToken: TOKEN });
    // Prouver d'abord que l'objet DEVAIT être absent : 42 existe, 99 non.
    const presente = await req(app, "/api/backup/archives/42/content");
    expect(presente.status).toBe(200);
    const res = await req(app, "/api/backup/archives/99/content");
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("ARCHIVE_ABSENTE");
  });

  it("la garde de 64 Mo répond 413 ARCHIVE_TROP_VOLUMINEUSE, avec sa raison", async () => {
    const { archivage, rep } = archivageReel();
    const vrai = gzipSync(Buffer.from(original));
    const annonce = Buffer.from(vrai);
    annonce.writeUInt32LE(65 * 2 ** 20, annonce.length - 4);
    await poserArchive(rep, 42, annonce);
    const app = createApp(deps(archivage), { localToken: TOKEN });
    const res = await req(app, "/api/backup/archives/42/content");
    expect(res.status).toBe(413);
    const corpsJson = (await res.json()) as { error: { code: string; message: string } };
    expect(corpsJson.error.code).toBe("ARCHIVE_TROP_VOLUMINEUSE");
    expect(corpsJson.error.message).toMatch(/64 Mo/);
  });

  it("un gz corrompu interrompt le flux SANS planter le serveur", async () => {
    const { archivage, rep } = archivageReel();
    const vrai = gzipSync(Buffer.from("<html>" + "x".repeat(400) + "</html>"));
    const faux = Buffer.from(vrai);
    faux.fill(0x00, 10, faux.length - 8);
    faux.writeUInt32LE(400, faux.length - 4);
    await poserArchive(rep, 42, faux);
    const app = createApp(deps(archivage), { localToken: TOKEN });
    const res = await req(app, "/api/backup/archives/42/content");
    expect(res.status).toBe(200); // les contrôles à froid passent : ça casse à mi-flux
    await expect(res.text()).rejects.toThrow();
    // Le serveur SURVIT — « un refus, pas un plantage » (spec lecture §6).
    const apres = await req(app, "/api/backup/archives/99/content");
    expect(apres.status).toBe(404);
  });

  it("l'origine du webview peut LIRE X-Archive-Date (exposée par CORS)", async () => {
    // Sans « Access-Control-Expose-Headers », les en-têtes non simples sont
    // masqués au JS même sur une 200 : le rail perdrait sa date en réel,
    // là où un test sans Origin ne verrait jamais le défaut.
    const { archivage, rep } = archivageReel();
    await poserArchive(rep, 42, gzipSync(Buffer.from(original)));
    const app = createApp(deps(archivage), { localToken: TOKEN });
    const res = await app.request("/api/backup/archives/42/content", {
      headers: { Authorization: `Bearer ${TOKEN}`, Origin: "tauri://localhost" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-expose-headers")).toContain("X-Archive-Date");
  });
});
```

- [ ] **Step 4: Vérifier que le test échoue**

Run: `npx vitest run sidecar/api/routes/sauvegarde.lecture.test.ts`
Expected: FAIL — 404 sur toutes les routes `/content` (elle n'existe pas) ; le test CORS échoue aussi (en-tête absent).

- [ ] **Step 5: Écrire la route**

Dans `sidecar/api/routes/sauvegarde.ts`, import et route (après `app.get("/archives", …)`) :

```ts
import { lireContenu } from "../../backup/contenuArchive.js";
```

```ts
  // Le contenu archivé pour le mode lecture (spec lecture §3) : HTML
  // décompressé EN FLUX — la lecture ne passe par la file Raindrop à aucun
  // moment, c'est un fichier local. La date de l'archive voyage dans
  // `X-Archive-Date` (mtime du fichier) : lire sans montrer la fraîcheur de
  // ce qu'on lit serait cacher la moitié du diagnostic.
  app.get("/archives/:id/content", async (c) => {
    // Validation AVANT la construction du nom de fichier : `Number` d'un
    // segment d'URL ne produit qu'un nombre ou NaN — aucun chemin négociable.
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return apiError(c, "INVALID_INPUT", "identifiant entier attendu");
    const archivage = deps.archivage;
    if (!archivage) return apiError(c, "INVALID_INPUT", INACTIVE);
    const verdict = await lireContenu(archivage.dossierArchives, id);
    if (!verdict.ok) {
      const code =
        verdict.raison === "introuvable"
          ? "ARCHIVE_ABSENTE"
          : verdict.raison === "trop-volumineuse"
            ? "ARCHIVE_TROP_VOLUMINEUSE"
            : "ARCHIVE_ILLISIBLE";
      return apiError(c, code, verdict.detail);
    }
    c.header("Content-Type", "text/html; charset=utf-8");
    c.header("X-Archive-Date", verdict.dateIso);
    return c.body(verdict.flux);
  });
```

- [ ] **Step 6: Exposer l'en-tête par CORS**

Dans `sidecar/api/app.ts`, middleware Origin (après `Access-Control-Max-Age`) :

```ts
    // La date de l'archive (spec lecture §3) doit rester LISIBLE au JS du
    // webview : CORS masque tout en-tête non exposé, même sur une 200.
    c.header("Access-Control-Expose-Headers", "X-Archive-Date");
```

- [ ] **Step 7: Vérifier que le test passe + sabotage**

Run: `npx vitest run sidecar/api/routes/sauvegarde.lecture.test.ts`
Expected: PASS (7 tests).

Sabotage 1 — retirer la validation d'entier (commenter le `if (!Number.isInteger(id))`).
Run: `npx vitest run sidecar/api/routes/sauvegarde.lecture.test.ts`
Expected: FAIL sur « identifiant non entier ». Remettre, PASS.

Sabotage 2 — retirer la ligne `Access-Control-Expose-Headers`.
Run: `npx vitest run sidecar/api/routes/sauvegarde.lecture.test.ts`
Expected: FAIL sur le test CORS. Remettre, PASS.

- [ ] **Step 8: Le voisin ne casse pas**

Run: `npx vitest run sidecar/api/routes/sauvegarde.test.ts && npm run typecheck`
Expected: PASS — les fakes `as unknown as Archivage` de l'existant tolèrent la propriété nouvelle (double cast), et `makeArchivage` la fournit.

- [ ] **Step 9: Commit**

```bash
git add shared/errors.ts sidecar/backup/archivage.ts sidecar/api/routes/sauvegarde.ts sidecar/api/routes/sauvegarde.lecture.test.ts sidecar/api/app.ts
git commit -m "feat(sidecar): la route de lecture du contenu archivé — flux, refus nommés, date exposée

Co-Authored-By: GLM 5.3 <noreply@z.ai>"
```

---

### Task 3: Le helper front `pageWeb.ts` — un seul point d'entrée vers la page réelle

**Files:**
- Create: `src/lib/pageWeb.ts`
- Test: `src/lib/pageWeb.test.ts`

**Interfaces:**
- Consumes: `@tauri-apps/api/core` (dépendance présente, `^2.11.1`).
- Produces: `ouvrirPageWeb(url: string): Promise<void>` — sous l'origine Tauri, la commande `ouvrir_page_web` (Task 4) ; hors Tauri (dev navigateur, tests), `window.open`. Consommé par les Tasks 6 et 7.

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// src/lib/pageWeb.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ouvrirPageWeb } from "./pageWeb";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

describe("ouvrirPageWeb", () => {
  afterEach(() => {
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.restoreAllMocks();
  });

  it("hors Tauri (dev navigateur, tests) : window.open, jamais l'API Tauri", async () => {
    const ouvert = vi.spyOn(window, "open").mockReturnValue(null);
    await ouvrirPageWeb("https://exemple.fr/page");
    expect(ouvert).toHaveBeenCalledWith("https://exemple.fr/page", "_blank", "noopener");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("sous l'origine Tauri : la commande du shell, jamais window.open", async () => {
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    const ouvert = vi.spyOn(window, "open").mockReturnValue(null);
    invokeMock.mockResolvedValue(undefined);
    await ouvrirPageWeb("https://exemple.fr/page");
    expect(invokeMock).toHaveBeenCalledWith("ouvrir_page_web", { url: "https://exemple.fr/page" });
    expect(ouvert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `npx vitest run src/lib/pageWeb.test.ts`
Expected: FAIL — « Cannot find module './pageWeb' ».

- [ ] **Step 3: Écrire l'implémentation**

```ts
// src/lib/pageWeb.ts
// La page web RÉELLE (spec lecture §4) : sous l'origine Tauri, la commande
// du shell — fenêtre dédiée, ZÉRO capability ; hors Tauri (dev navigateur,
// tests), window.open. Un seul helper : jamais un site dans l'iframe de
// l'app (X-Frame-Options y bloquerait les gros sites, et l'origine de l'app
// y serait exposée).
export async function ouvrirPageWeb(url: string): Promise<void> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("ouvrir_page_web", { url });
    return;
  }
  window.open(url, "_blank", "noopener");
}
```

- [ ] **Step 4: Vérifier que le test passe**

Run: `npx vitest run src/lib/pageWeb.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pageWeb.ts src/lib/pageWeb.test.ts
git commit -m "feat(front): ouvrirPageWeb — la commande Tauri sous l'origine, window.open ailleurs

Co-Authored-By: GLM 5.3 <noreply@z.ai>"
```

---

### Task 4: La commande Rust `ouvrir_page_web` — validation au bord, empreinte, zéro capability

**Files:**
- Create: `src-tauri/src/page_web.rs`
- Modify: `src-tauri/Cargo.toml` (dépendance `url`)
- Modify: `src-tauri/src/lib.rs:1-14,69-79` (`mod page_web;` + enregistrement)
- Test: `src-tauri/src/page_web.rs` (`#[cfg(test)]` en pied de fichier)

**Interfaces:**
- Consumes: `tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder}`, `sha2` (dépendance directe), `url` (ajoutée par cette tâche).
- Produces: la commande Tauri `ouvrir_page_web(url: String) -> Result<(), String>` — invoquée par le front sous le nom `"ouvrir_page_web"`, argument `{ url }`. Le front ne connaît QUE ce nom (Task 3).

- [ ] **Step 1: Ajouter la dépendance `url`**

Dans `src-tauri/Cargo.toml`, section `[dependencies]` :

```toml
# Validation des URL de la fenêtre page web (spec lecture §4) : schéma et
# hôte se lisent sur une URL PARÉE, pas sur des sous-chaînes. Déjà dans
# l'arbre en transitive via tauri.
url = "2"
```

- [ ] **Step 2: Écrire le module et ses tests qui échouent**

```rust
// src-tauri/src/page_web.rs
//! La fenêtre de la page web RÉELLE (spec lecture §4).
//!
//! Un site dans cette fenêtre est un ŒIL, pas une main : `capabilities/
//! default.json` ne liste que `main`, la fenêtre créée ici (étiquette
//! `page-…`) ne matche AUCUNE capability — zéro IPC, zéro plugin. C'est le
//! point de sécurité de tout le lot : le test
//! `les_capabilities_ne_listent_que_la_fenetre_principale` verrouille le
//! fichier contre un `"*"` futur, qui réintégrerait la fenêtre en silence.

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Validation AU BORD (spec lecture §4) : schémas http et https, jamais
/// `file://`, jamais `javascript:`, jamais l'origine de l'app. Une URL
/// refusée rend une ERREUR NOMMÉE, pas un panique. Pur : testé en bas de
/// fichier, le reste du module ne crée rien tant que cette fonction n'a
/// pas dit oui.
pub fn valider(url_brute: &str) -> Result<String, String> {
    let u = url::Url::parse(url_brute).map_err(|e| format!("URL illisible : {e}"))?;
    match u.scheme() {
        "http" | "https" => {}
        autre => {
            return Err(format!(
                "schéma refusé : {autre}:// — seuls http et https s'ouvrent ici"
            ))
        }
    }
    if u.host_str() == Some("tauri.localhost") {
        return Err(
            "l'origine de l'application ne s'ouvre pas dans la fenêtre page web".into(),
        );
    }
    Ok(u.to_string())
}

/// Étiquette de fenêtre STABLE par URL : rouvrir la MÊME URL concentre la
/// fenêtre existante au lieu d'en multiplier (spec lecture §4). Empreinte
/// SHA-256 tronquée à 16 hex — les étiquettes Tauri n'admettent que
/// lettres, chiffres, `-`, `/`, `:`, `_`.
fn empreinte(url: &str) -> String {
    let d = Sha256::digest(url.as_bytes());
    d.iter().take(8).map(|b| format!("{b:02x}")).collect()
}

/// Deux URL différentes au caractère près sont deux pages : l'empreinte
/// porte l'URL normalisée de `valider`, pas la saisie brute.
fn etiquette_de(url_normale: &str) -> String {
    format!("page-{}", empreinte(url_normale))
}

#[tauri::command]
pub async fn ouvrir_page_web(app: AppHandle, url: String) -> Result<(), String> {
    let url = valider(&url)?;
    let label = etiquette_de(&url);
    // Déjà ouverte pour CETTE URL : concentrer au lieu de multiplier.
    if let Some(fenetre) = app.get_webview_window(&label) {
        let _ = fenetre.unminimize();
        let _ = fenetre.set_focus();
        return Ok(());
    }
    // Le titre naît une fois : le site ne peut pas le changer (aucun JS
    // n'est injecté, aucun IPC — c'est un œil, pas une main).
    let titre = url
        .parse::<url::Url>()
        .ok()
        .and_then(|u| u.host_str().map(str::to_string))
        .unwrap_or_else(|| "Page web".into());
    // La création d'une fenêtre WebKit se fait sur le thread principal
    // (constat plan 3 : tout ce qui touche la fenêtre y vit) ; une commande
    // async y échappe. Le builder passe donc par `run_on_main_thread`, et
    // la commande attend le verdict par canal — le geste est bref
    // (millisecondes), l'attente n'est pas un travail bloquant long.
    let (tx, rx) = std::sync::mpsc::channel();
    let app_pour_fenetre = app.clone();
    let label_pour_fenetre = label.clone();
    let url_pour_fenetre = url.clone();
    app.run_on_main_thread(move || {
        let resultat = url_pour_fenetre
            .parse()
            .map_err(|e| format!("URL refusée par le webview : {e}"))
            .and_then(|cible| {
                WebviewWindowBuilder::new(
                    &app_pour_fenetre,
                    label_pour_fenetre.clone(),
                    WebviewUrl::External(cible),
                )
                .title(titre)
                .inner_size(1024.0, 768.0)
                .build()
                .map(|_| ())
                .map_err(|e| format!("fenêtre non créée : {e}"))
            });
        let _ = tx.send(resultat);
    })
    .map_err(|e| format!("thread principal injoignable : {e}"))?;
    rx.recv()
        .map_err(|e| format!("création de fenêtre interrompue : {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn http_et_https_passent() {
        assert!(valider("http://exemple.fr/page").is_ok());
        assert!(valider("https://exemple.fr/page?a=1").is_ok());
    }

    #[test]
    fn tout_autre_schema_est_refuse_par_son_nom() {
        // Le message NOMME le schéma : une erreur qu'on comprend, pas un
        // « invalid url » nu.
        let e = valider("file:///etc/passwd").unwrap_err();
        assert!(e.contains("file"), "le refus nomme le schéma : {e}");
        assert!(valider("javascript:alert(1)").is_err());
        assert!(valider("data:text/html,<h1>x</h1>").is_err());
    }

    #[test]
    fn l_origine_de_l_app_est_refusee_explicitement() {
        // `tauri://localhost` est refusé par son schéma ; MAIS
        // `https://tauri.localhost` est un VRAI https — sans la garde sur
        // l'hôte, elle passerait. Le test porte les deux.
        assert!(valider("tauri://localhost/").is_err());
        let e = valider("https://tauri.localhost/index.html").unwrap_err();
        assert!(e.contains("origine"), "le refus nomme l'origine : {e}");
    }

    #[test]
    fn une_url_illisible_est_une_erreur_nommee() {
        assert!(valider(":::").is_err());
    }

    #[test]
    fn l_empreinte_est_stable_et_discriminante() {
        assert_eq!(empreinte("https://a.fr"), empreinte("https://a.fr"));
        assert_ne!(empreinte("https://a.fr"), empreinte("https://b.fr"));
        assert_eq!(empreinte("https://a.fr").len(), 16);
    }

    #[test]
    fn l_etiquette_est_prefixee_et_valide_pour_tauri() {
        let etiquette = etiquette_de("https://exemple.fr/page");
        assert!(etiquette.starts_with("page-"));
        assert!(etiquette
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-/_:".contains(c)));
    }

    #[test]
    fn les_capabilities_ne_listent_que_la_fenetre_principale() {
        // Point de sécurité du lot (spec lecture §4, À VÉRIFIER, pas à
        // présumer) : la fenêtre `page-…` ne doit JAMAIS matcher une
        // capability. Un `"*"` ou un préfixe glob dans la liste la
        // réintégreraient en silence — ce test tire avant.
        let chemin = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("capabilities/default.json");
        let brut = std::fs::read_to_string(chemin).expect("capabilities/default.json lisible");
        let v: serde_json::Value =
            serde_json::from_str(&brut).expect("capabilities/default.json est du JSON");
        let fenetres = v["windows"].as_array().expect("windows est une liste");
        assert_eq!(fenetres.len(), 1, "une seule fenêtre listée : main");
        assert_eq!(fenetres[0].as_str(), Some("main"));
    }
}
```

Dans `src-tauri/src/lib.rs` : ajouter `mod page_web;` aux déclarations (ordre alphabétique, entre `node` et `reglages`), puis dans le `generate_handler!` :

```rust
            commandes::retirer_dossier_sauvegarde,
            page_web::ouvrir_page_web
```

- [ ] **Step 3: Vérifier que les tests passent**

Le `mod page_web;` et l'entrée du handler (Step 2) sont posés dès le départ : le module compile avec ses tests d'un seul tenant — un fichier Rust neuf ne peut pas « échouer en rouge » comme un module TS absent. Le rouge de cette tâche est le SABOTAGE de la Step 4 : c'est lui qui prouve que les tests mordent.

Run: `cd src-tauri && cargo test`
Expected: PASS — les 7 tests de `page_web` (dont les capabilities, qui verrouillent l'ÉTAT du fichier sans piloter l'écriture) plus tous les tests existants du crate.

- [ ] **Step 4: Sabotage — prouver que la validation mord**

Remplacer temporairement le `match u.scheme()` par `let _ = u;` (tout passe).
Run: `cd src-tauri && cargo test page_web`
Expected: FAIL sur « tout_autre_schema_est_refuse_par_son_nom » et « l_origine_de_l_app_est_refusee ». Remettre le `match`, re-run : PASS.

Sabotage 2 — ajouter `"*"` à `windows` dans `capabilities/default.json` (SANS committer).
Run: `cd src-tauri && cargo test page_web`
Expected: FAIL sur le test des capabilities (c'est LUI qu'il fallait prouver vivant). Remettre `["main"]`, re-run : PASS.

- [ ] **Step 5: Vérification réelle de la fenêtre (le pas que la spec exige, pas à présumer)**

Lancer l'app en dev (`npx tauri dev`) et depuis la console du webview :
`window.__TAURI_INTERNALS__` n'est pas global par défaut (trap plan 3) — sonder plutôt par un vrai geste : ouvrir un signet → « Voir la page » (Task 7 ; si la Task 7 n'est pas encore posée, invoquer depuis un `console.log` temporaire dans le front via l'import dynamique). Vérifier : la fenêtre s'ouvre sur https://exemple.fr, se concentre à la réouverture (pas de doublon), et **aucune erreur IPC** dans la page ouverte (le site ne peut rien invoquer). Ces vérifications passent au réel à la Task 7 ; ici, au minimum : `cargo build` compile.

Run: `cd src-tauri && cargo build`
Expected: compilation sans erreur ni avertissement nouveau.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/page_web.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat(shell): ouvrir_page_web — fenêtre étiquetée par empreinte, zéro capability, http/https seulement

Co-Authored-By: GLM 5.3 <noreply@z.ai>"
```

---

### Task 5: `lecture.ts` — charger le contenu, extraire les blocs de lecture

**Files:**
- Create: `src/lib/lecture.ts`
- Test: `src/lib/lecture.test.ts`

**Interfaces:**
- Consumes: `getConnection()` (`src/lib/connection.ts`), `ApiError` et `ErrorCode` (`src/lib/api.ts`, `shared/errors.ts` — codes de la Task 2).
- Produces: `chargerContenu(id: number): Promise<{ html: string; dateArchive: string | null }>` et `extraireBlocs(html: string): Bloc[]` (`[]` = extraction vide, état nommé par la vue) avec :

```ts
/** Un segment de texte courant, éventuellement enrichi. */
type Segment = { texte: string; gras?: boolean; italique?: boolean; lien?: string };
/** Un bloc de lecture : un élément de niveau, ou une image de l'archive. */
type Bloc =
  | { balise: "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "li" | "blockquote" | "pre"; segments: Segment[] }
  | { balise: "img"; src: string; alt: string };
```

Consommés par la Task 6. **HTML FILTRÉ (amendé 2026-09-21, arbitré avec
l'analyse Karakeep `docs/KARAKEEP.md` §6-§8)** : le rendu n'est plus du texte
nu mais une whitelist de blocs et d'inlines, **construite en arbre DOM**
(`createElement`/`textContent` côté vue, jamais d'`innerHTML`) — la sécurité
reste exclue par construction, et la lecture garde titres, emphases, listes,
citations et images.

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// src/lib/lecture.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiError } from "./api";
import { chargerContenu, extraireBlocs } from "./lecture";

describe("extraireBlocs", () => {
  // Priorités de la spec lecture §3, dans l'ordre : article > [role=main] >
  // main > div/section au textContent le plus long > corps.
  it("retient <article> en priorité", () => {
    const html = `<html><body>
      <nav><p>Menu accueil contact</p></nav>
      <article><p>Le vrai texte de l'article.</p></article>
      <div><p>Un pied de page long — mais moins que le menu, peu importe.</p></div>
    </body></html>`;
    expect(extraireBlocs(html)).toEqual([
      { balise: "p", segments: [{ texte: "Le vrai texte de l'article." }] },
    ]);
  });

  // Sans article concurrent : le rôle gagne, puis le <main>, etc. L'ordre
  // des priorités se SABOTE à la Step 5 — un test de priorité qui passerait
  // sur un ordre inversé ne prouverait rien.
  it("retient [role=main] à défaut d'article", () => {
    const html = `<html><body>
      <div role="main"><p>Le contenu principal.</p></div>
      <main><p>Un main concurrent, sans rôle.</p></main>
      <div><p>Un conteneur banal.</p></div>
    </body></html>`;
    expect(extraireBlocs(html)).toEqual([
      { balise: "p", segments: [{ texte: "Le contenu principal." }] },
    ]);
  });

  it("les inlines deviennent des segments : gras, italique, lien", () => {
    const html = `<html><body><article>
      <p>Texte <strong>gras</strong> et <em>italique</em> puis <a href="https://x.fr/a">un lien</a> fin.</p>
    </article></body></html>`;
    expect(extraireBlocs(html)).toEqual([
      {
        balise: "p",
        segments: [
          { texte: "Texte" },
          { texte: "gras", gras: true },
          { texte: "et" },
          { texte: "italique", italique: true },
          { texte: "puis" },
          { texte: "un lien", lien: "https://x.fr/a" },
          { texte: "fin." },
        ],
      },
    ]);
  });

  it("un lien javascript: ne devient pas un lien — son texte reste", () => {
    const html = `<html><body><article><p><a href="javascript:alert(1)">piège</a></p></article></body></html>`;
    expect(extraireBlocs(html)).toEqual([
      { balise: "p", segments: [{ texte: "piège" }] },
    ]);
  });

  it("les images de l'archive deviennent des blocs propres — src http(s) et data:image seulement", () => {
    const html = `<html><body><article>
      <img src="https://x.fr/photo.jpg" alt="Une photo">
      <img src="data:image/png;base64,AAAA" alt="En ligne">
      <img src="file:///etc/passwd" alt="interdit">
      <p>Texte.</p>
    </article></body></html>`;
    const blocs = extraireBlocs(html);
    expect(blocs).toEqual([
      { balise: "img", src: "https://x.fr/photo.jpg", alt: "Une photo" },
      { balise: "img", src: "data:image/png;base64,AAAA", alt: "En ligne" },
      { balise: "p", segments: [{ texte: "Texte." }] },
    ]);
  });

  it("<pre> garde son texte BRUT (espaces et sauts préservés, inline aplati)", () => {
    const html = `<html><body><article>
      <pre>const x = 1;
if   (x)   {   }


  doSomething(<strong>1</strong>);</pre>
    </article></body></html>`;
    expect(extraireBlocs(html)).toEqual([
      { balise: "pre", segments: [{ texte: "const x = 1;\nif   (x)   {   }\n\n\n  doSomething(1);" }] },
    ]);
  });

  it("les listes produisent des blocs li, dans l'ordre du document", () => {
    const html = `<html><body><article>
      <p>Intro.</p>
      <ul><li>Un.</li><li>Deux.</li></ul>
      <p>Fin.</p>
    </article></body></html>`;
    const blocs = extraireBlocs(html);
    expect(blocs.map((b) => b.balise)).toEqual(["p", "li", "li", "p"]);
  });

  it("extraction vide : chaîne vide — l'état est nommé par la vue", () => {
    expect(extraireBlocs("<html><body><div></div></body></html>")).toEqual([]);
  });
});

describe("chargerContenu", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("frappe la route locale avec le Bearer, rend le HTML et la date d'archive", async () => {
    fetchMock.mockResolvedValue(new Response("<html>x</html>", {
      status: 200,
      headers: { "Content-Type": "text/html", "X-Archive-Date": "2026-09-18T10:00:00.000Z" },
    }));
    const r = await chargerContenu(42);
    expect(r.html).toBe("<html>x</html>");
    expect(r.dateArchive).toBe("2026-09-18T10:00:00.000Z");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/backup/archives/42/content");
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Bearer /);
  });

  it("une date d'archive absente reste ABSENTE (null), jamais inventée", async () => {
    fetchMock.mockResolvedValue(new Response("<html>x</html>", { status: 200 }));
    const r = await chargerContenu(42);
    expect(r.dateArchive).toBeNull();
  });

  it("le 404 nommé traverse comme ApiError ARCHIVE_ABSENTE", async () => {
    fetchMock.mockResolvedValue(new Response(
      JSON.stringify({ error: { code: "ARCHIVE_ABSENTE", message: "aucune archive" } }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    ));
    const err = await chargerContenu(42).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("ARCHIVE_ABSENTE");
  });
});
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `npx vitest run src/lib/lecture.test.ts`
Expected: FAIL — « Cannot find module './lecture' ».

- [ ] **Step 3: Écrire l'implémentation**

```ts
// src/lib/lecture.ts
// La chaîne de lecture côté front (spec lecture §3, amendée 2026-09-21) :
// le HTML archivé est servi par le sidecar, le CONTENU est extrait ICI —
// DOMParser natif du webview, zéro dépendance, et JAMAIS d'innerHTML : la
// whitelist ci-dessous est reconstruite en arbre par la vue (createElement).
import { getConnection } from "./connection";
import { ApiError } from "./api";
import type { ErrorCode } from "../../shared/errors";

export interface ContenuCharge {
  html: string;
  /** ISO du mtime du fichier d'archive (en-tête `X-Archive-Date`) — la
   *  fraîcheur de ce qu'on lit (spec lecture §3). NULL si l'en-tête manque :
   *  une absence ne devient jamais une date inventée. */
  dateArchive: string | null;
}

async function erreurDe(reponse: Response): Promise<ApiError> {
  let code: ErrorCode = "RAINDROP_API";
  let message = `http ${reponse.status}`;
  try {
    const j = (await reponse.json()) as { error?: { code?: ErrorCode; message?: string } };
    if (j.error?.code) code = j.error.code;
    if (j.error?.message) message = j.error.message;
  } catch { /* corps non JSON */ }
  return new ApiError(code, reponse.status, message);
}

/** Le HTML archivé, DÉCOMPRIMÉ par le sidecar en flux. `api.get` ne va pas :
 *  il parse du JSON et jette les en-têtes — ici le corps est du HTML et la
 *  date de l'archive vit dans `X-Archive-Date`. */
export async function chargerContenu(id: number): Promise<ContenuCharge> {
  const { baseUrl, token } = getConnection();
  const reponse = await fetch(`${baseUrl}/api/backup/archives/${id}/content`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(70_000),
  });
  if (!reponse.ok) throw await erreurDe(reponse);
  return { html: await reponse.text(), dateArchive: reponse.headers.get("X-Archive-Date") };
}

// ─── Extraction en blocs filtrés (whitelist, jamais d'innerHTML) ────────────

export type Segment = { texte: string; gras?: boolean; italique?: boolean; lien?: string };

export type Bloc =
  | { balise: "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "li" | "blockquote" | "pre"; segments: Segment[] }
  | { balise: "img"; src: string; alt: string };

const BLOCS_NIVEAU = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "pre"]);
const SRC_PERMIS = /^(https?:\/\/|data:image\/)/;

/** Les inlines whitelistés d'un bloc, dans l'ordre du document. Les espaces
 *  de source sont normalisés (hors `pre`, traité en texte brut avant). */
function segmentsDe(el: Element): Segment[] {
  const out: Segment[] = [];
  const pousser = (texte: string, base: Partial<Segment>) => {
    const net = texte.replace(/\s+/g, " ").trim();
    if (net) out.push({ texte: net, ...base });
  };
  const marche = (noeud: Node, base: Partial<Segment>) => {
    for (const enfant of noeud.childNodes) {
      if (enfant.nodeType === 3) pousser(enfant.textContent ?? "", base);
      else if (enfant.nodeType === 1) {
        const e = enfant as Element;
        const balise = e.tagName.toLowerCase();
        if (balise === "strong" || balise === "b") marche(e, { ...base, gras: true });
        else if (balise === "em" || balise === "i") marche(e, { ...base, italique: true });
        else if (balise === "a") {
          const href = e.getAttribute("href") ?? "";
          if (/^https?:\/\//.test(href)) marche(e, { ...base, lien: href });
          else marche(e, base);
        } else if (balise === "br") pousser(" ", base);
        else if (balise === "img") continue; // les images sortent en blocs propres, au niveau bloc
        else marche(e, base);
      }
    }
  };
  marche(el, {});
  return out;
}

function plusLargeConteneur(doc: Document): Element | null {
  let meilleur: Element | null = null;
  let longueur = 0;
  for (const c of doc.querySelectorAll("div, section")) {
    const l = c.textContent?.length ?? 0;
    if (l > longueur) {
      meilleur = c;
      longueur = l;
    }
  }
  return meilleur;
}

/**
 * L'extraction (spec lecture §3, amendée) : `<article>`, puis
 * `[role=main]`, puis `<main>`, puis le div/section au `textContent` le plus
 * long, puis le corps. Production : les blocs whitelistés dans l'ordre du
 * document, leurs inlines en segments typés, les images en blocs propres
 * (src `http(s)` ou `data:image` seulement). `pre` garde son texte BRUT.
 * Extraction vide → [] : l'état est NOMMÉ par la vue (spec §5).
 */
export function extraireBlocs(html: string): Bloc[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const racine =
    doc.querySelector("article") ??
    doc.querySelector('[role="main"]') ??
    doc.querySelector("main") ??
    plusLargeConteneur(doc) ??
    doc.body;
  if (!racine) return [];
  const out: Bloc[] = [];
  const marche = (parent: Element) => {
    for (const enfant of Array.from(parent.children)) {
      const balise = enfant.tagName.toLowerCase();
      if (balise === "img") {
        const src = enfant.getAttribute("src") ?? "";
        if (SRC_PERMIS.test(src)) {
          out.push({ balise: "img", src, alt: enfant.getAttribute("alt") ?? "" });
        }
        continue;
      }
      if (BLOCS_NIVEAU.has(balise)) {
        if (balise === "pre") {
          const texte = enfant.textContent ?? "";
          if (texte.trim()) out.push({ balise: "pre", segments: [{ texte }] });
          continue;
        }
        const segments = segmentsDe(enfant);
        if (segments.length > 0) {
          out.push({ balise: balise as "p", segments });
        }
        continue;
      }
      // Conteneur : les images internes sortent d'abord, puis on descend.
      for (const img of enfant.querySelectorAll("img")) {
        const src = img.getAttribute("src") ?? "";
        if (SRC_PERMIS.test(src)) {
          out.push({ balise: "img", src, alt: img.getAttribute("alt") ?? "" });
        }
      }
      marche(enfant);
    }
  };
  marche(racine);
  return out;
}
```

- [ ] **Step 4: Vérifier que le test passe**

Run: `npx vitest run src/lib/lecture.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Sabotage — prouver que la priorité mord**

Inverser l'ordre des deux premières lignes de `racine` (`[role="main"]` avant `article`).
Run: `npx vitest run src/lib/lecture.test.ts`
Expected: FAIL sur « retient `<article>` en priorité ». Remettre, PASS.

- [ ] **Step 6: Typecheck front**

Run: `npm run typecheck:front`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/lecture.ts src/lib/lecture.test.ts
git commit -m "feat(front): extraireBlocs — la lecture en fragments filtrés, jamais d'innerHTML

Co-Authored-By: GLM 5.3 <noreply@z.ai>"
```
### Task 6: La vue lecture — `kind: "lecture"`, `LectureView`, le retour, le rail

**Files:**
- Modify: `src/state/appState.tsx` (le kind `lecture` dans l'union `View` + `vueDeRetour` exportée)
- Create: `src/components/LectureView.tsx`
- Modify: `src/App.tsx:52-58,184-198,199-203` (brancher la vue, `vueDeRetour`, la fiche démontée pendant la lecture)
- Modify: `src/styles.css` (`.lecture-corps`, `.rail-titre` — DESIGN §12 sera écrit à la Task 8)
- Modify: `src/i18n/fr.ts` (les clés de la vue)
- Test: `src/components/LectureView.test.tsx`

**Interfaces:**
- Consumes: `chargerContenu`, `extraireBlocs` + `type Bloc` (Task 5) ; `ApiError` ; `ouvrirPageWeb` (Task 3) ; `useCollections` ; `Icone` (nom `"croix"`) ; fixture `raindrop()` de `src/test/fixtures.ts`.
- Produces: `View` gagne `{ kind: "lecture"; raindropId: number; label: string; sourceCopie?: boolean; returnView?: View }` ; `vueDeRetour(v: View): View` ; `<LectureView view={…} goBack={…} />` (props : la vue extraite + un callback de retour). Consommés par `App.tsx` (cette tâche) et la Task 7.

- [ ] **Step 1: Étendre `View` et poser `vueDeRetour`**

Dans `src/state/appState.tsx`, ajouter au bout de l'union `View` (après le kind `review`) :

```ts
  // La LECTURE du contenu archivé (spec lecture §3) : vue pleine largeur,
  // ouverte depuis la fiche. `sourceCopie` : le texte vient d'une copie
  // permanente téléchargée À LA VOLÉE (badge du rail) ; absent = l'archive
  // locale était déjà là. `returnView`, même règle que la Revue : l'aller ne
  // prouve rien sans le retour.
  | { kind: "lecture"; raindropId: number; label: string; sourceCopie?: boolean; returnView?: View }
```

Et exporter, après le reducer :

```ts
/** La vue de retour — Revue ET Lecture, une seule règle (spec lecture §3 :
 *  « même règle que la Revue ») : la vue d'origine notée, sinon « Tous ».
 *  Testée par le comportement des deux vues ; une seule définition. */
export function vueDeRetour(v: View): View {
  return (v.kind === "review" || v.kind === "lecture") && v.returnView
    ? v.returnView
    : { kind: "list", collectionId: 0, label: t("nav.all") };
}
```

- [ ] **Step 2: Ajouter les clés i18n de la vue**

Dans `src/i18n/fr.ts` (bloc après les clés `detail.*` existantes) :

```ts
  // Lecture du contenu archivé (spec lecture §3) — chaque état porte SA
  // raison, jamais un « http 404 » nu (§5).
  "lecture.fermer": "Fermer la lecture",
  "lecture.rail": "Métadonnées",
  "lecture.badgeLocale": "archive locale",
  "lecture.badgeCopie": "copie permanente",
  "lecture.date": "Archive du {date}",
  "lecture.introuvable": "L'archive a disparu entre l'affichage de la fiche et votre clic.",
  "lecture.tropVolumineuse": "Cette archive dépasse la taille maximale lisible (64 Mo décompressés).",
  "lecture.illisible": "L'archive n'a pas pu être lue — elle est peut-être défectueuse.",
  "lecture.extractionVide": "Aucun texte n'a pu être extrait de cette archive.",
  // Le temps de lecture, CALCULÉ sur l'extraction (~220 mots/min) — jamais
  // deviné, jamais en dur.
  "lecture.temps": "≈ {n} min de lecture",
  // L'issue de secours des états d'échec (§5) — posée ICI car la vue la
  // rend dès cette tâche ; les autres gestes de la fiche viennent à la
  // tâche suivante.
  "detail.voirPage": "Voir la page",
```

- [ ] **Step 3: Écrire le test qui échoue**

```tsx
// src/components/LectureView.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { t } from "../i18n/fr";
import { raindrop, collections } from "../test/fixtures";
import { injecterRegles } from "../test/injectStyles";
import { LectureView } from "./LectureView";
import { AppStateProvider, useAppState, vueDeRetour, type View } from "../state/appState";
import { ApiError } from "../lib/api";

const { chargerMock, extraireMock, ouvrirMock, getApi } = vi.hoisted(() => ({
  chargerMock: vi.fn(),
  extraireMock: vi.fn(),
  ouvrirMock: vi.fn(),
  getApi: vi.fn(),
}));

vi.mock("../lib/lecture", () => ({ chargerContenu: chargerMock, extraireBlocs: extraireMock }));
vi.mock("../lib/pageWeb", () => ({ ouvrirPageWeb: ouvrirMock }));
vi.mock("../hooks/useStaticData", () => ({ useCollections: () => ({ data: collections }) }));
// `ApiError` reste RÉELLE : la vue la teste avec `instanceof`, et un mock
// ici testerait notre propre supposition. On n'écrase que `api.get` — le
// reste du module traverse via importOriginal (sinon `ApiError` serait
// `undefined` dans la vue et `instanceof` jetterait un TypeError).
vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  api: { get: getApi },
}));

beforeEach(() => {
  getApi.mockReset().mockImplementation((path: string) => {
    if (path === "/api/raindrops/1000")
      return Promise.resolve(
        // Un surlignage dans la fixture : le test prouve qu'il ne se
        // DUPRIQUE pas en lecture — une assertion d'absence ne vaut que si
        // l'objet devait être là.
        raindrop({
          id: 1000,
          highlights: [{ id: "h1", text: "Un passage", note: "", created: "2025-01-01T00:00:00Z" }],
        }),
      );
    return undefined;
  });
  chargerMock.mockReset().mockResolvedValue({
    html: "<html></html>",
    dateArchive: "2026-09-18T10:00:00.000Z",
  });
  extraireMock.mockReset().mockReturnValue([
    { balise: "h2", segments: [{ texte: "Un titre de lecture" }] },
    {
      balise: "p",
      segments: [{ texte: "Paragraphe un." }, { texte: " en gras", gras: true }],
    },
  ]);
  ouvrirMock.mockReset().mockResolvedValue(undefined);
});

// Le Harnais pose la vue comme App la posera : LectureView montée seulement
// en vue lecture, goBack = la VRAIE `vueDeRetour` (pas une copie de test).
const Harnais = () => {
  const { view, go } = useAppState();
  return (
    <>
      <span data-testid="vue">{view.kind}</span>
      <button type="button" onClick={() => go({ kind: "cleanup" })}>vers-nettoyage</button>
      <button
        type="button"
        onClick={() =>
          go({ kind: "lecture", raindropId: 1000, label: "T", returnView: { kind: "cleanup" } })
        }
      >
        ouvrir-lecture
      </button>
      {view.kind === "lecture" && <LectureView view={view} goBack={() => go(vueDeRetour(view))} />}
    </>
  );
};

const renderLecture = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppStateProvider>
        <Harnais />
      </AppStateProvider>
    </QueryClientProvider>,
  );

const ouvrir = async () => {
  await userEvent.click(screen.getByText("ouvrir-lecture"));
  expect(screen.getByTestId("vue").textContent).toBe("lecture");
};

describe("LectureView", () => {
  it("rend le texte en colonne serif, le rail, le badge et la date d'archive", async () => {
    injecterRegles(".lecture-corps");
    await ouvrir();
    const titre = await screen.findByText("Un titre de lecture");
    expect(titre.tagName).toBe("H2"); // la whitelist reconstruit de VRAIS éléments
    expect(screen.getByText("Paragraphe un.")).toBeInTheDocument();
    // Le segment gras rend un <strong> réel.
    const gras = screen.getByText("en gras").closest("strong");
    expect(gras).not.toBeNull();
    // DESIGN §12 (mode lecture) : la formule vit dans styles.css, lue dans le
    // VRAI css par injecterRegles — jamais recopiée dans le test.
    const article = document.querySelector(".lecture-corps");
    expect(article).not.toBeNull();
    expect(getComputedStyle(article!).fontFamily).toContain("serif");
    // Le rail : titre, domaine, badge, date — la fraîcheur de ce qu'on lit.
    expect(screen.getByText("Article exemple")).toBeInTheDocument();
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByText("archive locale")).toBeInTheDocument();
    expect(screen.getByText(/Archive du 18 septembre 2026/)).toBeInTheDocument();
    expect(screen.getByText(/≈ 1 min de lecture/)).toBeInTheDocument();
    // Les étiquettes du rail sont une ligne de TEXTE, pas des pilules
    // cliquables : une pilule inerte fait douter de l'autre, une pilule
    // cliquable NAVIGUERAIT hors de la lecture (comportement mesuré).
    expect(screen.getByText(/typescript/).tagName).toBe("P");
    // Les surlignages restent dans la fiche — le mode lecture ne les
    // duplique pas en v1 (spec §3). La fixture en a un : il n'est PAS ici.
    expect(screen.queryByText("Un passage")).not.toBeInTheDocument();
  });

  it("badge « copie permanente » quand le texte vient d'un téléchargement à la volée", async () => {
    // Poser la vue AVEC sourceCopie : le badge dit la PROVENANCE.
    const HarnaisCopie = () => {
      const { view, go } = useAppState();
      return view.kind === "lecture" ? (
        <LectureView view={view} goBack={() => go(vueDeRetour(view))} />
      ) : null;
    };
    const Poseur = () => {
      const { go } = useAppState();
      return (
        <button
          type="button"
          onClick={() =>
            go({ kind: "lecture", raindropId: 1000, label: "T", sourceCopie: true })
          }
        >
          ouvrir
        </button>
      );
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AppStateProvider>
          <Poseur />
          <HarnaisCopie />
        </AppStateProvider>
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByText("ouvrir"));
    expect(await screen.findByText("copie permanente")).toBeInTheDocument();
    expect(screen.queryByText("archive locale")).not.toBeInTheDocument();
  });

  // La règle du lot bascules : l'aller ne prouve rien sans le retour.
  it("« Fermer la lecture » ramène à la vue d'origine (retour, pas seulement l'aller)", async () => {
    await ouvrir();
    await screen.findByText("Article exemple");
    await userEvent.click(screen.getByRole("button", { name: "Fermer la lecture" }));
    expect(screen.getByTestId("vue").textContent).toBe("cleanup");
  });

  it("404 ARCHIVE_ABSENTE : état nommé + « Voir la page » en issue", async () => {
    chargerMock.mockRejectedValue(new ApiError("ARCHIVE_ABSENTE", 404, "aucune archive"));
    await ouvrir();
    expect(
      await screen.findByText("L'archive a disparu entre l'affichage de la fiche et votre clic."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Voir la page" })).toBeInTheDocument();
  });

  it("garde de 64 Mo : état nommé", async () => {
    chargerMock.mockRejectedValue(
      new ApiError("ARCHIVE_TROP_VOLUMINEUSE", 413, "dépasserait la garde de 64 Mo"),
    );
    await ouvrir();
    expect(
      await screen.findByText(/dépasse la taille maximale lisible/),
    ).toBeInTheDocument();
  });

  it("extraction vide : état nommé, jamais un blanc silencieux", async () => {
    extraireMock.mockReturnValue([]);
    await ouvrir();
    expect(
      await screen.findByText("Aucun texte n'a pu être extrait de cette archive."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Voir la page" })).toBeInTheDocument();
  });

  it("l'issue « Voir la page » frappe ouvrirPageWeb avec l'URL du signet", async () => {
    chargerMock.mockRejectedValue(new ApiError("ARCHIVE_ABSENTE", 404, "aucune archive"));
    await ouvrir();
    await userEvent.click(await screen.findByRole("button", { name: "Voir la page" }));
    expect(ouvrirMock).toHaveBeenCalledWith("https://example.com/a");
  });

  it("vueDeRetour : la règle partagée — origine notée, sinon « Tous »", () => {
    const tous: View = { kind: "list", collectionId: 0, label: t("nav.all") };
    expect(
      vueDeRetour({ kind: "lecture", raindropId: 1, label: "T", returnView: { kind: "cleanup" } }),
    ).toEqual({ kind: "cleanup" });
    expect(vueDeRetour({ kind: "lecture", raindropId: 1, label: "T" })).toEqual(tous);
  });
});
```

- [ ] **Step 4: Vérifier que le test échoue**

Run: `npx vitest run src/components/LectureView.test.tsx`
Expected: FAIL — « Cannot find module './LectureView' » (et le typecheck du kind `lecture` passe déjà, la Task précédente l'a posé).

- [ ] **Step 5: Écrire `LectureView.tsx`**

```tsx
// src/components/LectureView.tsx
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { t } from "../i18n/fr";
import { Icone } from "../design/icones";
import { api, ApiError } from "../lib/api";
import { createElement, type ReactNode } from "react";
import { chargerContenu, extraireBlocs, type Bloc } from "../lib/lecture";
import { ouvrirPageWeb } from "../lib/pageWeb";
import { useCollections } from "../hooks/useStaticData";
import type { RaindropItem } from "../../shared/types";
import type { View } from "../state/appState";

// DESIGN §12 (mode lecture) : colonne serif ~66 caractères sur la surface
// `app`, rail droit de métadonnées. Les formules (.lecture-corps,
// .rail-titre) vivent dans styles.css — pas recopiées ici, même raison que
// .titre-fiche.

/** La date de l'archive, lisible. Un ISO illisible se rend TEL QUEL plutôt
 *  que de devenir « Invalid Date » (même parti que formatterHorodatage). */
function dateArchive(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
}

/** Les états nommés de la lecture (spec lecture §5) : chaque échec a SA
 *  raison — jamais un « http 404 » nu. */
function nommerErreur(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === "ARCHIVE_ABSENTE") return t("lecture.introuvable");
    if (e.code === "ARCHIVE_TROP_VOLUMINEUSE") return t("lecture.tropVolumineuse");
    if (e.code === "ARCHIVE_ILLISIBLE") return t("lecture.illisible");
  }
  return t("state.error", { message: e instanceof Error ? e.message : String(e) });
}

/** L'issue de secours commune aux états d'échec : la page réelle reste
 *  ouverte à tout moment (spec lecture §5). */
function IssuePageWeb({ url }: { url?: string }) {
  if (!url) return null;
  return (
    <button type="button" className="btn" onClick={() => void ouvrirPageWeb(url).catch(() => undefined)}>
      {t("detail.voirPage")}
    </button>
  );
}

/** Le rendu d'un bloc : createElement sur l'union FERMÉE `Bloc.balise` —
 *  une balise hors whitelist ne peut pas exister (le type la refuse). Les
 *  segments deviennent texte, <strong>/<em>, et les liens s'ouvrent hors
 *  webview. Jamais d'innerHTML : la sécurité est dans l'arbre. */
function renduBloc(b: Bloc, cle: number): ReactNode {
  if (b.balise === "img") {
    return <img key={cle} src={b.src} alt={b.alt} className="lecture-img" loading="lazy" />;
  }
  return createElement(
    b.balise,
    { key: cle },
    b.segments.map((s, j) => {
      const texte = s.lien
        ? (
          <a key={j} href={s.lien} target="_blank" rel="noreferrer">
            {s.texte}
          </a>
        )
        : s.texte;
      return s.gras ? <strong key={j}>{texte}</strong> : s.italique ? <em key={j}>{texte}</em> : texte;
    }),
  );
}

export function LectureView({
  view,
  goBack,
}: {
  view: Extract<View, { kind: "lecture" }>;
  goBack: () => void;
}) {
  const { raindropId, sourceCopie } = view;
  // Les métadonnées du rail : la fiche a DÉJÀ chargé ["raindrop", id] — le
  // cache de react-query sert cette requête sans nouvelle requête réseau.
  const detail = useQuery<RaindropItem>({
    queryKey: ["raindrop", raindropId],
    queryFn: () => api.get<RaindropItem>(`/api/raindrops/${raindropId}`),
  });
  const contenu = useQuery({
    queryKey: ["archive-content", raindropId],
    queryFn: () => chargerContenu(raindropId),
  });
  const arbre = useCollections().data ?? [];
  const r = detail.data;
  // Le contenu extrait est AUSSI le compteur de mots du rail (temps de
  // lecture ≈ 220 mots/min — l'exemple de Karakeep, calculé jamais deviné).
  const blocs = contenu.data ? extraireBlocs(contenu.data.html) : [];
  const mots = blocs.reduce(
    (n, b) => n + (b.balise === "img" ? 0 : b.segments.reduce((m, s) => m + s.texte.split(/\s+/).filter(Boolean).length, 0)),
    0,
  );
  const minutes = Math.max(1, Math.round(mots / 220));
  const collection = r ? arbre.find((c) => c.id === r.collectionId) : undefined;
  const dateLue = contenu.data ? dateArchive(contenu.data.dateArchive) : null;

  let interieur: ReactNode;
  if (contenu.isPending) {
    interieur = <p>{t("state.loading")}</p>;
  } else if (contenu.isError) {
    interieur = (
      <div className="flex flex-col items-start gap-3">
        <p role="alert">{nommerErreur(contenu.error)}</p>
        <IssuePageWeb url={r?.url} />
      </div>
    );
  } else {
    interieur =
      blocs.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert">{t("lecture.extractionVide")}</p>
          <IssuePageWeb url={r?.url} />
        </div>
      ) : (
        // Rendu FILTRÉ (spec §3 amendée) : les blocs viennent de
        // extraireBlocs (whitelist, jamais d'innerHTML) et sont reconstruits
        // en arbre React — createElement sur l'union fermée `Bloc.balise`.
        <article className="lecture-corps">
          {blocs.map((b, i) => renduBloc(b, i))}
        </article>
      );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[66ch] flex-col gap-3 px-6 py-8">
          <button type="button" className="btn btn-icone self-end" aria-label={t("lecture.fermer")} onClick={goBack}>
            <Icone nom="croix" />
          </button>
          {interieur}
        </div>
      </div>
      {r && (
        <aside
          className="w-[260px] shrink-0 overflow-y-auto border-l border-app-border bg-app p-4"
          aria-label={t("lecture.rail")}
        >
          <h2 className="rail-titre">{r.title}</h2>
          <p className="url mt-2 truncate text-[11px]">{r.domain}</p>
          {collection && <p className="mt-1 text-xs text-app-muted">{collection.title}</p>}
          <p className="mt-3 text-xs text-app-muted">
            {sourceCopie ? t("lecture.badgeCopie") : t("lecture.badgeLocale")}
          </p>
          {dateLue && <p className="mt-1 text-xs text-app-muted">{t("lecture.date", { date: dateLue })}</p>}
          {contenu.data && blocs.length > 0 && (
            <p className="mt-1 text-xs text-app-muted">{t("lecture.temps", { n: minutes })}</p>
          )}
          {r.tags.length > 0 && (
            // Une ligne de TEXTE, pas des pilules : une pilule inerte ferait
            // douter de la fiche, une pilule cliquable naviguerait hors de la
            // lecture. Ici, l'étiquette se lit, elle ne se clique pas.
            <p className="mt-3 text-xs text-app-muted">{r.tags.join(" · ")}</p>
          )}
        </aside>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Brancher `App.tsx`**

Modifications exactes :

1. Imports :
```tsx
import { LectureView } from "./components/LectureView";
import { useAppState, vueDeRetour } from "./state/appState";
```
(l'import existant `import { useAppState } from "./state/appState";` est remplacé.)

2. Le retour et la fiche (remplacer les lignes 52-58 et 73) :
```tsx
  // R15P-3 : le retour revient à la vue d'origine portée par la vue (Revue
  // ET Lecture — même règle, une seule définition : vueDeRetour) ; sans
  // origine notée, repli sur « Tous ».
  const goBack = () => go(vueDeRetour(view));
```
```tsx
  // La fiche cède la place pendant la LECTURE (spec lecture §3 : vue pleine
  // largeur, le rail porte les métadonnées — fiche + rail dupliqueraient
  // tout). La sélection RESTE : en revenant de la lecture, la fiche est
  // encore là, exactement comme on l'avait laissée.
  const detailOuvert = selectedRaindropId !== null && view.kind !== "lecture";
```

3. La chaîne des vues (avant la branche `review`) :
```tsx
        {view.kind === "lecture" ? (
          // Lecture du contenu archivé (spec lecture §3) — vue pleine
          // largeur, le rail à droite, sortie par goBack.
          <LectureView view={view} goBack={goBack} />
        ) : view.kind === "review" ? (
```
(le reste de la chaîne inchangé ; `{detailOuvert && <DetailPane … />}` reste tel quel — c'est `detailOuvert` qui change de définition.)

- [ ] **Step 7: Ajouter les styles**

Dans `src/styles.css`, à la suite de `.titre-fiche` :

```css
/* §12 (mode lecture) : la colonne serif et le rail. Police système serif —
   zéro chargement, même parti que la police de l'interface (§7). La mesure
   ~66 caractères est celle du texte long ; le rail porte les métadonnées
   que la fiche porte quand elle est là. */
.lecture-corps {
  font-family: ui-serif, Georgia, serif;
  font-size: 17px;
  line-height: 1.6;
}

.rail-titre {
  font-size: 15px;
  font-weight: 590;
  letter-spacing: -0.015em;
}

.lecture-img {
  border-radius: 7px;
  max-width: 100%;
}
```

- [ ] **Step 8: Vérifier que le test passe**

Run: `npx vitest run src/components/LectureView.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 9: Le voisin ne casse pas**

Run: `npx vitest run && npm run typecheck && npm run typecheck:front`
Expected: PASS partout. En particulier `DetailPane.test` et `ListPane.test` : la fiche démontée pendant la lecture ne les touche pas (aucun de leurs tests ne pose une vue `lecture`).

- [ ] **Step 10: Commit**

```bash
git add src/state/appState.tsx src/components/LectureView.tsx src/components/LectureView.test.tsx src/App.tsx src/styles.css src/i18n/fr.ts
git commit -m "feat(front): la vue lecture — colonne serif, rail de métadonnées, retour à la vue d'origine

Co-Authored-By: GLM 5.3 <noreply@z.ai>"
```

---

### Task 7: Les gestes de la fiche — « Lire » (états et téléchargement) et « Voir la page »

**Files:**
- Create: `src/components/ActionsLecture.tsx`
- Modify: `src/components/DetailPane.tsx:198-239` (montage des actions, après la ligne d'actions existante)
- Modify: `src/i18n/fr.ts` (les clés des deux boutons et des raisons)
- Test: `src/components/ActionsLecture.test.tsx`
- Modify: `src/components/DetailPane.test.tsx:46-48` (une branche de mock en plus : `/api/jobs`)

**Interfaces:**
- Consumes: `useArchives`, `useJobsEnVol`, `useInvalidateSauvegarde`, `type ResultatArchivage` (`src/hooks/useBackup.ts`) ; `useAppState` ; `ArchiveJob` (`src/components/RevueArchive.tsx`, props `{ ids: number[]; onTermine: (r: ResultatArchivage) => void; onErreur: (message: string) => void }`) ; `ouvrirPageWeb` (Task 3) ; `type View` (Task 6).
- Produces: `<ActionsLecture r={RaindropItem} />` — les deux boutons de la fiche. `go({ kind: "lecture", … })` est le seul effet de bord sur la navigation.

- [ ] **Step 1: Ajouter les clés i18n**

Dans `src/i18n/fr.ts`, à la suite des clés `lecture.*` de la Task 6 :

```ts
  // Les gestes de la fiche (spec lecture §1 et §5) : « Lire » nomme ce qui
  // manque quand il est désactivé. « Voir la page » est DÉJÀ posé (Task 6 —
  // la vue lecture l'utilise comme issue de secours).
  "detail.lire": "Lire",
  "detail.lireSansCopie": "Ni archive locale ni copie permanente : rien à lire hors ligne.",
  "detail.lireCopieEchec": "Copie permanente en échec côté Raindrop ({raison}).",
  "detail.lireAttente": "Un archivage est déjà en cours — la lecture sera possible une fois terminé.",
  // Les six états de `cache.status`, TRADUITS (jamais un identifiant brut à
  // l'écran — même motif que LABELS_PROGRESSION).
  "copie.retry": "nouvel essai programmé",
  "copie.failed": "échec",
  "copie.invalidOrigin": "origine invalide",
  "copie.invalidTimeout": "délai dépassé",
  "copie.invalidSize": "taille invalide",
  "copie.inconnue": "état inconnu",
```

- [ ] **Step 2: Écrire le test qui échoue**

```tsx
// src/components/ActionsLecture.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { raindrop } from "../test/fixtures";
import { ActionsLecture } from "./ActionsLecture";
import { AppStateProvider, useAppState } from "../state/appState";
import type { RaindropItem } from "../../shared/types";

const { getApi, jobsMock, archivesMock, invalideMock, ouvrirMock } = vi.hoisted(() => ({
  getApi: vi.fn(),
  jobsMock: vi.fn(),
  archivesMock: vi.fn(),
  invalideMock: vi.fn(),
  ouvrirMock: vi.fn(),
}));

vi.mock("../hooks/useBackup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks/useBackup")>()),
  useJobsEnVol: jobsMock,
  useArchives: archivesMock,
  useInvalidateSauvegarde: () => invalideMock,
}));
vi.mock("../lib/pageWeb", () => ({ ouvrirPageWeb: ouvrirMock }));
vi.mock("../hooks/useStaticData", () => ({ useCollections: () => ({ data: [] }) }));

// ArchiveJob REMPLACÉ par un bouchon pilotable : le vol d'archivage (SSE,
// adoption) est déjà couvert par RevueArchive.test — ici on teste CE que la
// fiche en fait (quand elle le monte, et ce qu'elle fait au terme).
vi.mock("./RevueArchive", () => ({
  ArchiveJob: ({ ids, onTermine, onErreur }: {
    ids: number[];
    onTermine: (r: unknown) => void;
    onErreur: (m: string) => void;
  }) => (
    <>
      <span data-testid="job-ids">{ids.join(",")}</span>
      <button type="button" onClick={() => onTermine({ demandes: 1, faits: 1, echecs: [], annule: false, nonTentes: 0 })}>
        simuler-termine
      </button>
      <button
        type="button"
        onClick={() =>
          onTermine({
            demandes: 1, faits: 1,
            echecs: [{ id: ids[0]!, raison: "copie inaccessible (http 404)" }],
            annule: false, nonTentes: 0,
          })
        }
      >
        simuler-echec
      </button>
      <button type="button" onClick={() => onErreur("un archivage est déjà en cours")}>
        simuler-erreur
      </button>
    </>
  ),
}));

beforeEach(() => {
  jobsMock.mockReset().mockReturnValue({ data: [] });
  archivesMock.mockReset().mockReturnValue({ data: { set: new Set<number>(), octets: 0 } });
  invalideMock.mockReset();
  ouvrirMock.mockReset().mockResolvedValue(undefined);
});

const Harnais = ({ r }: { r: RaindropItem }) => {
  const { view, go } = useAppState();
  return (
    <>
      <span data-testid="vue">{JSON.stringify(view)}</span>
      <ActionsLecture r={r} />
    </>
  );
};

const renderActions = (r: RaindropItem) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppStateProvider>
        <Harnais r={r} />
      </AppStateProvider>
    </QueryClientProvider>,
  );

const vue = () => JSON.parse(screen.getByTestId("vue").textContent ?? "{}") as {
  kind: string; raindropId?: number; sourceCopie?: boolean;
};

describe("ActionsLecture", () => {
  it("archive locale : « Lire » activé, ouvre la vue lecture sans sourceCopie", async () => {
    archivesMock.mockReturnValue({ data: { set: new Set([1000]), octets: 10 } });
    renderActions(raindrop({ id: 1000 }));
    await userEvent.click(await screen.findByRole("button", { name: "Lire" }));
    expect(vue().kind).toBe("lecture");
    expect(vue().raindropId).toBe(1000);
    expect(vue().sourceCopie).toBeUndefined();
  });

  it("ni archive ni copie : « Lire » désactivé AVEC sa raison (spec §5)", async () => {
    renderActions(raindrop({ id: 1000, cache: null }));
    const lire = await screen.findByRole("button", { name: "Lire" });
    expect(lire).toBeDisabled();
    expect(
      screen.getByText("Ni archive locale ni copie permanente : rien à lire hors ligne."),
    ).toBeInTheDocument();
  });

  it("copie en échec : la raison DISTINGUE l'échec de l'absence, et traduit le statut", async () => {
    renderActions(raindrop({ id: 1000, cache: { status: "failed" } }));
    const lire = await screen.findByRole("button", { name: "Lire" });
    expect(lire).toBeDisabled();
    expect(screen.getByText("Copie permanente en échec côté Raindrop (échec).")).toBeInTheDocument();
    // « failed » ne s'affiche JAMAIS brut : c'est le libellé français qui porte.
    expect(screen.queryByText(/failed/)).not.toBeInTheDocument();
  });

  it("copie prête sans archive : « Lire » télécharge d'ABORD puis ouvre en sourceCopie", async () => {
    renderActions(raindrop({ id: 1000, cache: { status: "ready", size: 100 } }));
    await userEvent.click(await screen.findByRole("button", { name: "Lire" }));
    expect(screen.getByTestId("job-ids").textContent).toBe("1000");
    expect(vue().kind).not.toBe("lecture"); // rien ne bouge avant le terme
    await userEvent.click(screen.getByText("simuler-termine"));
    expect(invalideMock).toHaveBeenCalled(); // l'inventaire se rafraîchit
    expect(vue().kind).toBe("lecture");
    expect(vue().sourceCopie).toBe(true);
  });

  it("le téléchargement échoue pour NOTRE identifiant : raison nommée, vue inchangée", async () => {
    renderActions(raindrop({ id: 1000, cache: { status: "ready" } }));
    await userEvent.click(await screen.findByRole("button", { name: "Lire" }));
    await userEvent.click(screen.getByText("simuler-echec"));
    expect(await screen.findByRole("alert")).toHaveTextContent("copie inaccessible (http 404)");
    expect(vue().kind).not.toBe("lecture");
  });

  it("« Voir la page » reste le geste partout — même quand « Lire » est désactivé", async () => {
    renderActions(raindrop({ id: 1000, cache: null }));
    const voir = await screen.findByRole("button", { name: "Voir la page" });
    expect(voir).toBeEnabled();
    await userEvent.click(voir);
    expect(ouvrirMock).toHaveBeenCalledWith("https://example.com/a");
  });

  it("un archivage DÉJÀ en vol : la fiche ne monte pas un second job, elle nomme l'attente", async () => {
    jobsMock.mockReturnValue({
      data: [{ id: "j9", type: "archive", status: "running", progress: { done: 1, total: 5, label: null } }],
    });
    renderActions(raindrop({ id: 1000, cache: { status: "ready" } }));
    const lire = await screen.findByRole("button", { name: "Lire" });
    expect(lire).toBeDisabled();
    expect(screen.getByText(/Un archivage est déjà en cours/)).toBeInTheDocument();
    await userEvent.click(lire); // désactivé : rien ne part
    expect(screen.queryByTestId("job-ids")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Vérifier que le test échoue**

Run: `npx vitest run src/components/ActionsLecture.test.tsx`
Expected: FAIL — « Cannot find module './ActionsLecture' ».

- [ ] **Step 4: Écrire `ActionsLecture.tsx`**

```tsx
// src/components/ActionsLecture.tsx
import { useState } from "react";
import { t, type FrKey } from "../i18n/fr";
import { ouvrirPageWeb } from "../lib/pageWeb";
import {
  useArchives,
  useInvalidateSauvegarde,
  useJobsEnVol,
  type ResultatArchivage,
} from "../hooks/useBackup";
import { useAppState } from "../state/appState";
import { ArchiveJob } from "./RevueArchive";
import type { RaindropItem } from "../../shared/types";

// Les six états de `cache.status`, traduits — jamais un identifiant brut à
// l'écran (même motif que LABELS_PROGRESSION). `ready` n'y est pas : il
// N'ACTIVE pas une raison, il active le bouton.
const LIBELLES_COPIE: Record<string, FrKey> = {
  retry: "copie.retry",
  failed: "copie.failed",
  "invalid-origin": "copie.invalidOrigin",
  "invalid-timeout": "copie.invalidTimeout",
  "invalid-size": "copie.invalidSize",
};

/** Les deux gestes de la fiche (spec lecture §1) : « Lire » le contenu
 *  archivé — archive locale, ou copie permanente téléchargée d'abord — et
 *  « Voir la page » réelle, qui reste possible PARTOUT, même quand rien
 *  n'est lisible hors ligne (spec §5 : l'issue de secours). */
export function ActionsLecture({ r }: { r: RaindropItem }) {
  const { view, go } = useAppState();
  const archives = useArchives().data?.set;
  const jobs = useJobsEnVol();
  const invalider = useInvalidateSauvegarde();
  const [telecharge, setTelecharge] = useState(false);
  const [echec, setEchec] = useState<string | null>(null);

  const locale = archives?.has(r.id) === true;
  // La fiche ne monte JAMAIS un job d'archivage quand un AUTRE est en vol :
  // ArchiveJob adopterait ce job-là, et son terme ferait croire à un
  // téléchargement qui n'a pas eu lieu. On nomme l'attente à la place.
  const archivageEnVol = jobs.data?.some((j) => j.type === "archive") === true;
  const prete = r.cache?.status === "ready";

  const raison = locale
    ? null
    : archivageEnVol
      ? t("detail.lireAttente")
      : prete
        ? null
        : r.cache != null
          ? t("detail.lireCopieEchec", {
              raison: t(LIBELLES_COPIE[r.cache.status] ?? "copie.inconnue"),
            })
          : t("detail.lireSansCopie");

  const ouvrirLecture = (sourceCopie: boolean) =>
    go({ kind: "lecture", raindropId: r.id, label: r.title, sourceCopie, returnView: view });

  const lire = () => {
    setEchec(null);
    if (locale) {
      ouvrirLecture(false);
      return;
    }
    setTelecharge(true); // ArchiveJob se monte, poste, suit, puis rappelle
  };

  const auTerme = (res: ResultatArchivage) => {
    invalider();
    const notre = res.echecs.find((e) => e.id === r.id);
    setTelecharge(false);
    if (notre) {
      setEchec(notre.raison); // nommé inline, la vue ne bouge pas
      return;
    }
    ouvrirLecture(true);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" disabled={raison != null} onClick={lire}>
          {t("detail.lire")}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void ouvrirPageWeb(r.url).catch(() => undefined)}
        >
          {t("detail.voirPage")}
        </button>
      </div>
      {/* §10 : le bouton nomme ce qui manque — la raison est posée À L'ÉCRAN,
          pas seulement en title. */}
      {raison && <p className="text-xs text-app-muted">{raison}</p>}
      {telecharge && (
        <ArchiveJob ids={[r.id]} onTermine={auTerme} onErreur={(m) => { setTelecharge(false); setEchec(m); }} />
      )}
      {echec && <p role="alert" className="text-xs text-app-broken">{t("state.error", { message: echec })}</p>}
    </div>
  );
}
```

- [ ] **Step 5: Vérifier que le test passe**

Run: `npx vitest run src/components/ActionsLecture.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 6: Sabotage — prouver que l'attente mord**

Retirer la branche `archivageEnVol` de `raison` (tout passe à `null` quand `prete`).
Run: `npx vitest run src/components/ActionsLecture.test.tsx`
Expected: FAIL sur « un archivage DÉJÀ en vol ». Remettre, PASS. (Sans ce pas, le clic dans la fenêtre de course monterait un job qui s'adopterait le mauvais — exactement le défaut que la garde exclut.)

- [ ] **Step 7: Monter dans `DetailPane`**

Dans `src/components/DetailPane.tsx` :

1. Import : `import { ActionsLecture } from "./ActionsLecture";`
2. Après le bloc `<div className="flex flex-wrap gap-2">` des actions (fermeture ligne 239), insérer :

```tsx
      {/* Les deux gestes de contenu (spec lecture §1) : « Lire » l'archive,
          « Voir la page » la page réelle. Le marqueur ci-dessous dit l'ÉTAT
          (« Archivé » / copiable), ces boutons disent le GESTE. */}
      <ActionsLecture r={r} />
```

3. Dans `src/components/DetailPane.test.tsx`, la mock d'`getApi` gagne une branche (avant le `return undefined`) :

```ts
    // ActionsLecture sonde les jobs en vol — sans cette branche, le mock
    // rend undefined et la requête reste éternellement en attente (pas un
    // crash, mais un avertissement react-query à chaque test).
    if (path === "/api/jobs") return Promise.resolve([]);
```

- [ ] **Step 8: Vérifier que tout passe**

Run: `npx vitest run src/components/DetailPane.test.tsx && npx vitest run src/components/ActionsLecture.test.tsx`
Expected: PASS partout — les tests existants de `DetailPane` ne voient ni « Lire » ni « Voir la page » entrer en conflit avec leurs rôles.

Run: `npx tsc -p tsconfig.front.json --noEmit --noUnusedLocals`
Expected: PASS (aucun import mort laissé par le montage).

- [ ] **Step 9: Commit**

```bash
git add src/components/ActionsLecture.tsx src/components/ActionsLecture.test.tsx src/components/DetailPane.tsx src/components/DetailPane.test.tsx src/i18n/fr.ts
git commit -m "feat(front): « Lire » et « Voir la page » dans la fiche — états nommés, téléchargement à la demande

Co-Authored-By: GLM 5.3 <noreply@z.ai>"
```

---

### Task 8: Documentation et vérification d'ensemble

**Files:**
- Modify: `docs/DESIGN.md` (la section du mode lecture — la direction visuelle doit dire cette surface, spec lecture §7)
- Modify: `docs/superpowers/specs/2026-09-15-raindrop-gui-design.md` (§12 amendé : « tranché et livré », la fenêtre webview ajoutée comme geste distinct)
- Modify: `docs/ROADMAP.md` (l'entrée « Hors ligne » garde ce qui lui appartient ; la consultation hors ligne des archives EST ce lot, elle en sort)

**Interfaces:**
- Consumes: les Tasks 1-7, toutes fusionnées.
- Produces: la documentation fait foi ; les vérifications d'ensemble vertes.

- [ ] **Step 1: DESIGN.md — la section du mode lecture**

Ajouter à la fin de `docs/DESIGN.md` (après §11) :

```markdown
## 12. Le mode lecture

Le contenu archivé se lit DANS l'app, en texte extrait — pas le HTML de la
page : ses CSS manquent, la fidélité n'y rendrait qu'une page cassée.

- **Colonne serif** (`ui-serif, Georgia` — police système, zéro chargement,
  même parti que §7), 17 px, `line-height: 1.6`, largeur ~66 caractères
  (`max-w-[66ch]`), sur la surface `app`. Le texte est un TEXTE : ni images,
  ni liens, ni mise en forme d'origine (v1, assumé spec §8).
- **Rail droit** (260 px, filet `line`) : titre (15 px, 590, resserré — la
  fiche §7), domaine en chasse fixe 11 px, collection, **provenance** —
  badge « archive locale » ou « copie permanente » — et **date de
  l'archive** : lire sans montrer la fraîcheur de ce qu'on lit cacherait la
  moitié du diagnostic.
- **Les étiquettes du rail sont une ligne de texte**, pas des pilules : une
  pilule inerte ferait douter de celles de la fiche (§2), une pilule
  cliquable ferait quitter la lecture.
- **Les surlignages restent dans la fiche** — le mode lecture ne les
  duplique pas (v1).
- **La fiche cède la place** pendant la lecture : vue pleine largeur, le
  rail porte les métadonnées. La sélection reste — en revenant, la fiche
  est encore là.
- Chaque échec de lecture porte SA raison (archive disparue, garde de
  64 Mo, archive défectueuse, extraction vide), avec « Voir la page » en
  issue de secours — jamais un zéro, jamais un blanc (§5 des états).
```

- [ ] **Step 2: La spec principale §12 amendée**

Lire `docs/superpowers/specs/2026-09-15-raindrop-gui-design.md` §12 (le mode lecture, tenu pour Phase 2). Y ajouter à la suite de la mention `cache` (même motif) :

```markdown
   Le mode lecture lui-même est **tranché et livré le 2026-09-20** (spec
   `2026-09-19-lecture-et-page-web-design.md`) ; la fenêtre webview de la
   page réelle y est ajoutée comme geste DISTINCT du navigateur système —
   fenêtre du shell, zéro capability.
```

⚠️ Vérifier d'abord la forme exacte de l'amendement `cache` dans §12 et calquer la présentation (la consigne ci-dessus donne le CONTENU, le fichier donne la FORME).

- [ ] **Step 3: ROADMAP**

1. Lire `docs/ROADMAP.md` en entier. **Vérifier `git log` avant de croire une case « à faire »** (règle du dépôt — les notes de la ROADMAP ont déjà menti).
2. L'entrée « Hors ligne » (consultation des archives) : la consultation hors ligne des archives est CE lot — retirer ce qui en relève désormais, garder ce qui reste (les écritures refusées proprement, le thème system à chaud).
3. Noter en « fait » (avec la date du jour) : lecture du contenu archivé + fenêtre page web, avec renvoi à la spec et au plan.

- [ ] **Step 4: Vérification d'ensemble**

Run:
```bash
npm test > /tmp/lecture-tests.log 2>&1; rc=$?; tail -5 /tmp/lecture-tests.log; echo "rc=$rc"
```
Expected: `rc=0` — la suite entière au vert (les tests sensibles à la charge exigent le calme : vérifier `ps aux | sort -k3 -rn | head` AVANT, ne pas lancer `cargo test` en même temps).

Run: `npm run typecheck && npm run typecheck:front`
Expected: PASS.

Run:
```bash
wc -l sidecar/backup/contenuArchive.ts sidecar/api/routes/sauvegarde.ts src/lib/lecture.ts src/lib/pageWeb.ts src/components/LectureView.tsx src/components/ActionsLecture.tsx src/components/DetailPane.tsx src/App.tsx src/state/appState.tsx
```
Expected: chacun ≤ 300 (`DetailPane.tsx` ≈ 274 ; le plafond dur 400 n'est jamais en jeu).

Run: `cd src-tauri && cargo test`
Expected: PASS.

- [ ] **Step 5: Réel (à l'utilisateur, comme toujours)**

La spec §6 réserve au réel : la lecture sur de VRAIES archives (2-3, de tailles variées, dont une copie permanente téléchargée à la volée), la fenêtre sur de vrais sites (réouverture de la MÊME URL = concentration, pas multiplication), et la vérification explicite qu'aucun site ouvert dans la fenêtre page web ne peut rien invoquer (zéro capability). Ces vérifications passent avec l'utilisateur à la fin du lot — ne pas les simuler.

- [ ] **Step 6: Commit**

```bash
git add docs/DESIGN.md docs/superpowers/specs/2026-09-15-raindrop-gui-design.md docs/ROADMAP.md
git commit -m "docs: le mode lecture et la fenêtre page web — DESIGN §12, spec §12 amendée, ROADMAP

Co-Authored-By: GLM 5.3 <noreply@z.ai>"
```

---

## Auto-révision (faite à l'écriture du plan)

1. **Couverture de la spec** : §3 chaîne de lecture (priorités locale → copie → désactivé : Task 7 pour l'ordre, Task 1-2 pour le contenu) ✔ ; route en flux + garde 64 Mo + validation d'identifiant (Tasks 1-2) ✔ ; extraction côté front, priorités, jamais d'innerHTML (Task 5) ✔ ; rendu serif/rail/badge/date/`X-Archive-Date`/retour (Tasks 2, 6) ✔ ; §4 fenêtre webview : validation au bord, empreinte, ZÉRO capability vérifiée (Task 4, test + sabotage), helper unique (Task 3) ✔ ; §5 états nommés : introuvable, garde, illisible, extraction vide, pas de copie, copie en échec (raisons traduites), budget plein (`nonTentes`/`raisonArret` portés par `ArchiveJob` existant, repris tel quel — Task 7), attente d'archivage en vol ✔ ; §6 tests : sidecar sabotés (Tasks 1-2), front (Tasks 5-7), Rust (Task 4), réel (Task 8) ✔ ; §7 documentation (Task 8) + i18n (Tasks 6-7) ✔ ; §8 limites assumées : rien à implémenter, rien d'ajouté au-delà.
2. **Placeholders** : aucun « TBD » ; chaque pas de code est complet ; les seuls avertissements ⚠️ du plan sont des consignes de calque (forme de l'amendement spec §12) ou des pièges nommés pour l'exécuteur (fixtures de garde, mock d'`ApiError`), pas des contenus à compléter.
3. **Cohérence des types** : `lireContenu`/`ContenuArchive` (Task 1) = ce que la route consomme (Task 2) ✔ ; `chargerContenu`/`extraireBlocs` + `Bloc` (Task 5) = ce que `LectureView` consomme (Task 6) ✔ ; `ouvrirPageWeb` (Task 3) = l'invocation `ouvrir_page_web` de la commande Rust (Task 4), argument `{ url }` ✔ ; `vueDeRetour` et le kind `lecture` (Task 6) = ce que `ActionsLecture` pose (Task 7) ✔ ; `ArchiveJob` consommé avec les props exactes de `RevueArchive.tsx` ✔ ; `dossierArchives` posé sur l'interface `Archivage` (Task 2) ✔.
4. **Taille des fichiers** : le fichier nouveau le plus lourd est `LectureView.tsx` (~190) ; `sauvegarde.ts` monte à ~95 ; `appState.tsx` à ~190 ; `DetailPane.tsx` à ~274. Rien ne dépasse la cible de 300.

## Exécution

Plan complet et sauvegardé dans `docs/superpowers/plans/2026-09-20-lecture-et-page-web.md`. Deux options :

1. **Subagent-Driven (recommandé)** — un sous-agent frais par tâche, revue entre les tâches, itération rapide (`superpowers:subagent-driven-development`).
2. **Exécution en ligne** — exécuter les tâches dans cette session avec des points de contrôle (`superpowers:executing-plans`).
