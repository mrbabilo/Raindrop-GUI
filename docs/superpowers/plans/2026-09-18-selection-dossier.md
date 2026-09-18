# Sélecteur du dossier de sauvegarde, panneau et archivage — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le lot sauvegarde atteignable depuis l'application — le dossier choisi au dialogue natif, un panneau Sauvegarde dans les Réglages, et l'archivage des copies permanentes déclenchable sur sélection via la Revue.

**Architecture:** Approche A de la spec — Rust possède le chemin (`reglages.json` + `tauri-plugin-dialog`), le sidecar reçoit `BACKUP_DIR` au spawn et ignore d'où il vient ; le webview ne nomme jamais un chemin. Le changement de dossier relance le sidecar par le chemin éprouvé d'`enregistrer_jeton`. Côté front, une section des Réglages consomme `/api/backup/status` + `/api/backup/archives` + `/api/jobs`, et l'action d'archivage passe par la Revue (« la Revue propose, l'utilisateur dispose »).

**Tech Stack:** Tauri 2 + tauri-plugin-dialog (Rust uniquement), Hono/zod (sidecar), React + @tanstack/react-query + Vitest (front).

**Spec:** `docs/superpowers/specs/2026-09-18-selection-dossier-design.md` — le plan argue de la spec ; les deux voyagent ensemble. La spec porte une §10 « Relecture critique » dont les corrections C1-C6 sont déjà répercutées ici.

## Global Constraints

- Interface **en français** ; tout texte passe par `src/i18n/fr.ts` (fichier unique, clé typée `FrKey`). Aucune chaîne littérale d'interface dans un composant.
- **≤ 300 lignes** par fichier (cible), **400** plafond dur. Tout fichier dépassé se découpe ou se signale — il ne grossit pas.
- Sidecar : imports relatifs **avec extension `.js`** (moduleResolution nodenext). Le front ne connaît que l'API REST locale ; aucun code MCP côté front.
- `npm run typecheck` est **aveugle** sur les tests et `sidecar/testing/` : chaque task qui touche un `*.test.ts` ou `apiServer.ts` ajoute un `npx tsc --noEmit` explicite sur les fichiers touchés.
- La règle du lot : **une assertion d'absence ne vaut que si l'on a montré que l'objet devait être là** ; les tests des comportements critiques (déjà-archivés écartés, borne 500) sont **sabordés** (réintroduire le défaut, voir le test tomber, revenir).
- Toute suppression passe par la corbeille Raindrop ; l'archivage n'écrit que sous le dossier de sauvegarde ; le webview ne reçoit jamais le pouvoir de nommer un chemin d'écriture.
- Commits sur `main`, jamais de push. Message en français, trailer `Co-Authored-By:` nommant le **modèle réellement actif** (CLAUDE.md §Git — vérifier avant de signer).
- Le dialogue natif vit **côté Rust** : `@tauri-apps/plugin-dialog` côté npm n'est PAS nécessaire (correction au §2 de la spec, Task 7).

## Carte des fichiers

| Couche | Créé | Modifié |
|---|---|---|
| Sidecar | — | `decision.ts` (+test), `archives.ts` (+test), `archivage.ts` (+test), `api/routes/sauvegarde.ts` (+test), `api/routes/jobs.ts` (+test), `backup/sauvegarde.ts` (+tests), spec sauvegarde §4.4 |
| Rust | `src-tauri/src/reglages.rs`, `src-tauri/capabilities/default.json` | `Cargo.toml`, `sidecar.rs`, `demarrage.rs`, `commandes.rs`, `lib.rs` |
| Front | `src/hooks/useBackup.ts` (+test), `src/components/SectionSauvegarde.tsx` (+test), `src/components/ArchiveJob.tsx` (+test) | `shared/types.ts`, `api/mappers.ts`, `state/appState.tsx`, `lib/amorce.ts` (+test), `components/Reglages.tsx` (+test), `components/BulkBar.tsx` (+test), `components/ReviewPage.tsx` (+test), `components/CleanupView.tsx` (+test), `components/CleanupRows.tsx`, `components/RaindropRow.tsx` (+test), `components/DetailPane.tsx` (+test), `ListPane.tsx`, `i18n/fr.ts`, spec sélection §4.2/§10 |

---

### Task 1: Première sauvegarde explicite (sidecar, decision.ts)

**Files:**
- Modify: `sidecar/backup/decision.ts:38-46`
- Modify: `sidecar/backup/decision.test.ts` (voisin)
- Modify: `sidecar/index.ts:138-143` (commentaire seulement)
- Modify: `docs/superpowers/specs/2026-09-16-sauvegarde-donnees-locales-design.md` (§4.4)

**Interfaces:**
- Produces: `doitSauvegarderAuDemarrage(m: Manifeste, maintenant: Date): boolean` — **false** sur manifeste vide (changement de contrat), sinon inchangé.

- [ ] **Step 1: Retourner le test existant et écrire le nouveau**

Dans `decision.test.ts`, le test « manifeste vide → true » existe (sinon le créer d'après la forme des tests voisins). Le remplacer par :

```ts
it("manifeste vide → false : la première sauvegarde est explicite (spec sélection §0.2)", () => {
  expect(doitSauvegarderAuDemarrage({ instantanes: [] }, new Date())).toBe(false);
});

it("dernière tentative < 24 h → false (inchangé)", () => {
  const m = { instantanes: [{ horodatage: new Date(Date.now() - 3600e3).toISOString(), complet: true, count: 1 }] } as never;
  expect(doitSauvegarderAuDemarrage(m, new Date())).toBe(false);
});

it("dernière tentative > 24 h → true (inchangé)", () => {
  const m = { instantanes: [{ horodatage: new Date(Date.now() - 25 * 3600e3).toISOString(), complet: true, count: 1 }] } as never;
  expect(doitSauvegarderAuDemarrage(m, new Date())).toBe(true);
});
```

Adapter les formes exactes aux fabriques déjà présentes dans le fichier (un `EntreeInstantane` minimal : `{ horodatage, complet, count }`).

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run sidecar/backup/decision.test.ts`
Expected: le premier test FAIL (`true` reçu au lieu de `false`).

- [ ] **Step 3: Implémenter**

Dans `decision.ts`, remplacer le corps de `doitSauvegarderAuDemarrage` et son commentaire :

```ts
/**
 * Au démarrage (§4.4, amendé — spec sélection §0.2) : plus de 24 h depuis la
 * dernière TENTATIVE, valide ou non. Se fonder sur `dernierValide` ici
 * relancerait une sauvegarde à chaque lancement tant qu'une seule échouerait.
 * Un manifeste VIDE ne déclenche plus rien : choisir un dossier ne doit pas
 * partir en 2 min 19 et ~245 requêtes non demandées — la première sauvegarde
 * est un geste explicite (panneau), ensuite le §4.4 s'applique normalement.
 */
export function doitSauvegarderAuDemarrage(m: Manifeste, maintenant: Date): boolean {
  const dernier = [...m.instantanes].sort((a, b) => a.horodatage.localeCompare(b.horodatage)).at(-1);
  if (dernier === undefined) return false;
  return depuis(dernier.horodatage, maintenant) > HEURES_DEMARRAGE * 36e5;
}
```

Dans `sidecar/index.ts` (bloc « Déclenchement au démarrage (§4.4) »), compléter le commentaire : « Manifeste vide → rien : la première sauvegarde est explicite (spec sélection §0.2). »

- [ ] **Step 4: Vérifier le vert**

Run: `npx vitest run sidecar/backup/decision.test.ts`
Expected: PASS.

- [ ] **Step 5: Amender la spec sauvegarde §4.4**

Dans `2026-09-16-sauvegarde-donnees-locales-design.md`, sous la règle des 24 h du §4.4, insérer :

> ⚠️ **Amendé le 2026-09-18 (spec sélection §0.2)** : un manifeste vide ne
> déclenche plus rien au démarrage — la première sauvegarde est explicite,
> lancée depuis le panneau. Le §4.4 ne s'applique qu'à partir de la première
> tentative enregistrée.

- [ ] **Step 6: Commit**

```bash
git add sidecar/backup/decision.ts sidecar/backup/decision.test.ts sidecar/index.ts docs/superpowers/specs/2026-09-16-sauvegarde-donnees-locales-design.md
git commit -m "feat(backup): la première sauvegarde est explicite, pas déclenchée au boot"
```

---

### Task 2: Inventaire des archives (sidecar)

**Files:**
- Modify: `sidecar/backup/archives.ts` (ajout, ~25 lignes)
- Modify: `sidecar/backup/archives.test.ts`
- Modify: `sidecar/backup/archivage.ts` (interface + makeArchivage)
- Modify: `sidecar/backup/archivage.test.ts`
- Modify: `sidecar/api/routes/sauvegarde.ts` (route GET /archives)
- Modify: `sidecar/api/routes/sauvegarde.test.ts`

**Interfaces:**
- Produces: `inventorier(dossierArchives: string): Promise<{ ids: number[]; octets: number }>` (ids triés croissants, noms non conformes ignorés).
- Produces: `Archivage.inventaire(): Promise<{ ids: number[]; octets: number }>`.
- Produces: `GET /api/backup/archives` → 200 `{ ids: number[], octets: number }` | 400 `{error:{code:"INVALID_INPUT", message: <INACTIVE>}}` sans dossier.

- [ ] **Step 1: Tests d'`inventorier` (dans archives.test.ts)**

```ts
import { inventorier } from "./archives.js"; // ajouter aux imports existants

describe("inventorier", () => {
  it("répertoire absent → inventaire vide", async () => {
    expect(await inventorier(join(dir(), "inexistant"))).toEqual({ ids: [], octets: 0 });
  });

  it("compte les <id>.html.gz, ignore le reste, somme les octets", async () => {
    const dossier = join(dir(), "inv");
    await mkdir(dossier, { recursive: true });
    await writeFile(join(dossier, "7.html.gz"), Buffer.alloc(30));
    await writeFile(join(dossier, "2.html.gz"), Buffer.alloc(10));
    await writeFile(join(dossier, "manifest.json"), "{}"); // ignoré
    await writeFile(join(dossier, "notes.txt"), "x"); // ignoré
    const inv = await inventorier(dossier);
    expect(inv.ids).toEqual([2, 7]); // tri croissant, déterministe
    expect(inv.octets).toBe(40);
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — `npx vitest run sidecar/backup/archives.test.ts` → FAIL (inventorier non exporté).

- [ ] **Step 3: Implémenter inventorier (archives.ts)**

```ts
/**
 * Ce qui est archivé, lisible par l'interface (spec sélection §4.1) : un
 * readdir, les noms déjà parsés par ID_DE, les tailles au stat. Les noms non
 * conformes sont ignorés (ils ne sont pas des archives) ; le répertoire
 * absent est l'état normal d'un dossier neuf, pas une erreur.
 */
export async function inventorier(dossierArchives: string): Promise<{ ids: number[]; octets: number }> {
  let noms: string[];
  try {
    noms = await readdir(dossierArchives);
  } catch {
    return { ids: [], octets: 0 };
  }
  const fichiers: { id: number; octets: number }[] = [];
  for (const nom of noms) {
    const id = ID_DE(nom);
    if (id === undefined) continue;
    const s = await stat(join(dossierArchives, nom));
    fichiers.push({ id, octets: s.size });
  }
  fichiers.sort((a, b) => a.id - b.id);
  return { ids: fichiers.map((f) => f.id), octets: fichiers.reduce((n, f) => n + f.octets, 0) };
}
```

- [ ] **Step 4: Route + interface Archivage**

Dans `archivage.ts` : étendre l'interface —
```ts
export interface Archivage {
  archiver(ids: number[], job?: JobHandle): Promise<ResultatArchivage>;
  enCours(): boolean;
  /** Ce qui est archivé, pour le panneau et les marqueurs (spec sélection §4.1). */
  inventaire(): Promise<{ ids: number[]; octets: number }>;
}
```
et dans le `return { ... }` de `makeArchivage` : `inventaire: () => inventorier(dossierArchives),` (importer `inventorier` de `./archives.js`).

Dans `sauvegarde.ts` (routes), après la route `/archive` :

```ts
  // Ce qui est déjà archivé (spec sélection §4.1) — même condition
  // d'activation que les deux autres routes : sans dossier, pas d'archives.
  app.get("/archives", async (c) => {
    const archivage = deps.archivage;
    if (!archivage) return apiError(c, "INVALID_INPUT", INACTIVE);
    return c.json(await archivage.inventaire());
  });
```

- [ ] **Step 5: Tests de route (sauvegarde.test.ts)** — suivre le pattern `deps(...)` du fichier :

```ts
it("sans dossier, GET /api/backup/archives refuse lisiblement", async () => {
  const app = createApp(deps(new JobStore()), { localToken: TOKEN });
  const res = await req(app, "/api/backup/archives");
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/BACKUP_DIR/);
});

it("avec archivage, GET /api/backup/archives rend l'inventaire", async () => {
  const archivage = {
    archiver: async () => { throw new Error("sans objet"); },
    enCours: () => false,
    inventaire: async () => ({ ids: [2, 7], octets: 40 }),
  } as Archivage;
  const app = createApp(deps(new JobStore(), undefined, archivage), { localToken: TOKEN });
  const res = await req(app, "/api/backup/archives");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ids: [2, 7], octets: 40 });
});
```

Mettre à jour les fakes `Archivage` déjà présents dans ce fichier de test : ils doivent porter `inventaire` (le compilateur le dira).

- [ ] **Step 6: Vert + typecheck explicite**

Run: `npx vitest run sidecar/backup/archives.test.ts sidecar/backup/archivage.test.ts sidecar/api/routes/sauvegarde.test.ts && npx tsc --noEmit sidecar/api/routes/sauvegarde.test.ts sidecar/backup/archives.test.ts`
Expected: PASS, aucune erreur.

- [ ] **Step 7: Commit**

```bash
git add sidecar/backup/archives.ts sidecar/backup/archives.test.ts sidecar/backup/archivage.ts sidecar/backup/archivage.test.ts sidecar/api/routes/sauvegarde.ts sidecar/api/routes/sauvegarde.test.ts
git commit -m "feat(backup): l'inventaire des archives est lisible par l'interface"
```

---

### Task 3: GET /api/jobs — les jobs en vol (sidecar)

**Files:**
- Modify: `sidecar/api/routes/jobs.ts`
- Modify: `sidecar/api/routes/jobs.test.ts` (existe — sinon créer d'après le pattern de sauvegarde.test.ts)

**Interfaces:**
- Produces: `GET /api/jobs` → 200 `JobSnapshot[]` filtré à `status === "running"` (peut être `[]`).

- [ ] **Step 1: Test**

```ts
it("GET /api/jobs liste les jobs EN VOL seulement", async () => {
  const jobs = new JobStore();
  jobs.create("backup", 10); // running
  const fini = jobs.create("scan", 1);
  fini.finish(); // done → absent
  const app = createApp(deps(jobs), { localToken: TOKEN });
  const res = await req(app, "/api/jobs");
  expect(res.status).toBe(200);
  const corps = (await res.json()) as { type: string; status: string }[];
  expect(corps.map((j) => j.type)).toEqual(["backup"]);
});
```

(`deps` et `req` : mêmes fabriques que sauvegarde.test.ts ; adapter si jobs.test.ts possède déjà les siennes.)

- [ ] **Step 2: Échec** — `npx vitest run sidecar/api/routes/jobs.test.ts` → FAIL (404 : `/` tombe dans `/:id` avec id=""… en réalité Hono rend « job inconnu » ; le test le constate).

- [ ] **Step 3: Implémenter** — dans jobs.ts, AVANT la route `/:id` (l'ordre compte chez Hono) :

```ts
  // Les jobs EN VOL (spec sélection §3 : un job qu'on n'a pas lancé doit se
  // voir — le boot (§4.4) ou une Revue quittée peuvent en porter un). Le
  // terminé se lit par /:id ; la liste ne montre que ce qui peut être suivi.
  app.get("/", (c) => c.json(deps.jobs.list().filter((j) => j.status === "running")));
```

- [ ] **Step 4: Vert** — `npx vitest run sidecar/api/routes/jobs.test.ts` → PASS. Typecheck explicite : `npx tsc --noEmit sidecar/api/routes/jobs.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add sidecar/api/routes/jobs.ts sidecar/api/routes/jobs.test.ts
git commit -m "feat(jobs): GET /api/jobs expose les jobs en vol"
```

---

### Task 4: Labels de progression en clés stables (sidecar)

**Files:**
- Modify: `sidecar/backup/sauvegarde.ts` (labels + `job?.progress` manquants)
- Modify: tests voisins touchés par les libellés (grep d'abord)

**Interfaces:**
- Produces: labels de progression = clés stables `bookmarks | modifies | corbeille | collections | surlignages | profil` — le front les traduit (Task 11) selon le pattern `ETAT_MCP` de Reglages.tsx.

- [ ] **Step 1: Repérer les assertions existantes**

Run: `grep -rn "bookmarks\|éléments modifiés" sidecar/backup/*.test.ts`
Chaque assertion sur un libellé est mise à jour dans ce task (clé `bookmarks` inchangée, `éléments modifiés` → `modifies`).

- [ ] **Step 2: Renommer les deux labels existants**

`sauvegarde.ts:108` : `job?.progress(faits, total, "bookmarks")` — **inchangé** (déjà une clé).
`sauvegarde.ts:160` : `job?.progress(modifies.length, modifies.length, "éléments modifiés")` → `... "modifies")`.

- [ ] **Step 3: Ajouter les progress manquants (corbeille + auxiliaires)**

Dans la branche balayage de `executer` (sauvegarde.ts), après l'écriture de la corbeille et après chaque pièce auxiliaire, émettre une progression finale nommée — la forme :

```ts
// n = le volume de la pièce venant d'être écrite (count/ids.size disponible
// sur place) ; la clé est stable, le front la traduit (spec sélection §3).
job?.progress(n, n, "corbeille");
```

Pièces auxiliaires : même appel avec `"collections"`, `"surlignages"`, `"profil"` (l'ordre du tableau `aux` existant donne la correspondance ; lire le fichier avant d'insérer). Objectif mesuré par les tests : **aucun segment de la sauvegarde ne reste sans progression** — une barre ne gèle plus faute de label, même si le front n'affiche pas de barre.

- [ ] **Step 4: Tests**

Dans le(s) test(s) de sauvegarde qui suivent un job (sauvegarde.test.ts / sauvegarde-degrade.test.ts), ajouter :

```ts
it("chaque pièce émet une progression nommée (clé stable)", async () => {
  // harnais existant du fichier : exécuter une sauvegarde complète sur le
  // faux serveur, puis inspecter les événements 'progress' du job :
  const cles = evenements.filter((e) => e.kind === "progress").map((e) => e.progress.label);
  expect(cles.filter(Boolean)).toEqual(
    expect.arrayContaining(["bookmarks", "corbeille", "collections", "surlignages", "profil"]),
  );
});
```

Adapter au harnais réel du fichier (le moyen d'observer les événements : s'abonner au handle avant `runJob`, ou lire le snapshot final — le fichier en possède déjà un, le réutiliser).

- [ ] **Step 5: Vert + typecheck explicite**

Run: `npx vitest run sidecar/backup/ && npx tsc --noEmit sidecar/backup/sauvegarde.test.ts sidecar/backup/sauvegarde-degrade.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add sidecar/backup/sauvegarde.ts sidecar/backup/*.test.ts
git commit -m "feat(backup): chaque pièce de sauvegarde émet une progression nommée"
```

---

### Task 5: reglages.rs — persistance du dossier (Rust)

**Files:**
- Create: `src-tauri/src/reglages.rs`
- Modify: `src-tauri/src/lib.rs` (`mod reglages;`)

**Interfaces:**
- Produces: `reglages::lire(dossier: &Path) -> Option<String>`, `reglages::ecrire(dossier: &Path, valeur: Option<String>) -> Result<(), String>`, `reglages::introuvable(dossier: &Path) -> bool` (consommés par Task 6 et 7).

- [ ] **Step 1: Écrire reglages.rs avec ses tests**

```rust
//! Le dossier de sauvegarde choisi par l'utilisateur (spec sélection §2).
//!
//! Un `reglages.json` à côté de `sidecar.json` — ce n'est PAS un secret
//! (pas le trousseau) : un chemin de dossier, rien d'autre. Illisible ou
//! corrompu = « aucun dossier », l'état normal du premier lancement, jamais
//! une panne.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize)]
struct Contenu {
    #[serde(rename = "dossierSauvegarde")]
    dossier_sauvegarde: String,
}

pub fn chemin(dossier: &Path) -> PathBuf {
    dossier.join("reglages.json")
}

/// `None` = aucun dossier configuré (absent, illisible, corrompu — un seul
/// et même état, et c'est voulu : le panneau ne distingue pas, il n'a pas à).
pub fn lire(dossier: &Path) -> Option<String> {
    let texte = std::fs::read_to_string(chemin(dossier)).ok()?;
    let contenu: Contenu = serde_json::from_str(&texte).ok()?;
    let vide = contenu.dossier_sauvegarde.trim().is_empty();
    (!vide).then_some(contenu.dossier_sauvegarde)
}

pub fn ecrire(dossier: &Path, valeur: Option<String>) -> Result<(), String> {
    let fichier = chemin(dossier);
    match valeur {
        // Retrait : le fichier disparaît, le sidecar relancé naîtra sans
        // BACKUP_DIR. Un fichier déjà absent n'est pas une erreur.
        None => match std::fs::remove_file(&fichier) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        },
        Some(v) if v.trim().is_empty() => Err("chemin vide".into()),
        Some(v) => {
            let contenu = Contenu { dossier_sauvegarde: v };
            serde_json::to_string(&contenu)
                .map_err(|e| e.to_string())
                .and_then(|json| std::fs::write(&fichier, json).map_err(|e| e.to_string()))
        }
    }
}

/// Configuré MAIS disparu depuis le dernier lancement (déménagé, volume
/// monté plus) — état distinct que le panneau dit (spec §2).
pub fn introuvable(dossier: &Path) -> bool {
    lire(dossier).is_some_and(|c| !Path::new(&c).is_dir())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dossier_temporaire(nom: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("reglages-{}-{nom}", std::process::id()));
        std::fs::create_dir_all(&d).expect("création");
        d
    }

    #[test]
    fn absent_vaut_aucun_dossier() {
        let d = dossier_temporaire("absent");
        assert_eq!(lire(&d), None);
        assert!(!introuvable(&d));
        assert!(ecrire(&d, None).is_ok()); // retirer ce qui n'est pas là
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn corrompu_vaut_aucun_dossier() {
        let d = dossier_temporaire("corrompu");
        std::fs::write(chemin(&d), "{pas du json").ok();
        assert_eq!(lire(&d), None);
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn ecrit_lit_et_retire() {
        let d = dossier_temporaire("rondtrip");
        ecrire(&d, Some("/Volumes/Sauvegardes".into())).expect("écriture");
        assert_eq!(lire(&d).as_deref(), Some("/Volumes/Sauvegardes"));
        // introuvable : le chemin configuré n'existe pas sur cette machine
        assert!(introuvable(&d));
        // cette fois il existe
        std::fs::create_dir_all("/Volumes/Sauvegardes").ok(); // peut échouer (droits) : le test suivant le couvre autrement
        ecrire(&d, Some(d.display().to_string())).expect("écriture 2");
        assert!(!introuvable(&d)); // le dossier de test existe
        ecrire(&d, None).expect("retrait");
        assert_eq!(lire(&d), None);
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn chemin_vide_est_refuse() {
        let d = dossier_temporaire("vide");
        assert!(ecrire(&d, Some("   ".into())).is_err());
        std::fs::remove_dir_all(&d).ok();
    }
}
```

Dans `lib.rs`, avec les autres `mod` : `mod reglages;`.

- [ ] **Step 2: Vérifier**

Run: `cargo test reglages`
Expected: 4 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/reglages.rs src-tauri/src/lib.rs
git commit -m "feat(tauri): reglages.json porte le dossier de sauvegarde"
```

---

### Task 6: BACKUP_DIR jusqu'au sidecar (Rust)

**Files:**
- Modify: `src-tauri/Cargo.toml` (dépendance, utilisée par Task 7 — posée ici pour un seul build)
- Modify: `src-tauri/src/sidecar.rs` (struct Reglages + env)
- Modify: `src-tauri/src/demarrage.rs` (lancer_sidecar lit reglages)

**Interfaces:**
- Consumes: `reglages::lire` (Task 5).
- Produces: le sidecar reçoit `BACKUP_DIR` (absent = non configuré) ; `Reglages { dossier_sauvegarde: Option<PathBuf>, … }`.

- [ ] **Step 1: Cargo.toml** — sous `[dependencies]` :

```toml
# Dialogue natif de choix de dossier (spec sélection §2) — utilisé côté Rust
# uniquement (Task 7) ; le webview n'appelle jamais le plugin.
tauri-plugin-dialog = "2"
```

- [ ] **Step 2: Test d'abord — env_args (sidecar.rs, mod tests existant ou créé)**

Le spawn réel n'est pas testable sans lancer Node ; extraire la partie pure :

```rust
/// Les variables d'environnement du sidecar, en un seul endroit — pur,
/// donc testable sans lancer de processus (spec sélection §2 : BACKUP_DIR
/// n'est passé QUE si un dossier est configuré).
fn env_args(r: &Reglages) -> Vec<(String, String)> {
    let mut v = vec![
        ("MCP_RAINDROPIO_TOKEN".into(), r.token_raindrop.clone()),
        ("LOCAL_API_TOKEN".into(), r.token_local.clone()),
        ("RAINDROP_MCP_ENTRY".into(), entree_mcp(&r.base).display().to_string()),
        ("APPDATA_DIR".into(), r.dossier_donnees.display().to_string()),
    ];
    if let Some(d) = &r.dossier_sauvegarde {
        v.push(("BACKUP_DIR".into(), d.display().to_string()));
    }
    v
}
```

Test (dans le même fichier) :

```rust
#[test]
fn backup_dir_n_est_passe_que_si_configure() {
    let base = Reglages {
        node: PathBuf::from("node"), base: PathBuf::from("/b"),
        token_raindrop: "r".into(), token_local: "l".into(),
        dossier_donnees: PathBuf::from("/d"), dossier_sauvegarde: None,
    };
    assert!(!env_args(&base).iter().any(|(k, _)| k == "BACKUP_DIR"));
    let avec = Reglages { dossier_sauvegarde: Some(PathBuf::from("/sauv")), ..base };
    assert!(env_args(&avec).iter().any(|(k, v)| k == "BACKUP_DIR" && v == "/sauv"));
}
```

`cargo test backup_dir` → FAIL (champ inexistant).

- [ ] **Step 3: Implémenter** — `Reglages` gagne `pub dossier_sauvegarde: Option<PathBuf>,` ; `lancer()` remplace ses quatre `.env(...)` par :

```rust
    let mut cmd = Command::new(&r.node);
    cmd.arg(entree(&r.base));
    for (cle, valeur) in env_args(r) {
        cmd.env(cle, valeur);
    }
    let enfant = cmd.stdin(Stdio::null()).stdout(Stdio::from(sortie)).stderr(Stdio::from(erreurs)).spawn()?;
```

- [ ] **Step 4: lancer_sidecar lit reglages (demarrage.rs)** — dans `lancer_sidecar`, à la construction de `sidecar::Reglages` :

```rust
    // Le dossier de sauvegarde (spec sélection §2) : lu ICI, unique point de
    // lecture, pour que toute relance (boot, jeton, dossier) porte le même
    // réglage. Configuré mais introuvable → NON passé : le moteur naît
    // inactif et le panneau dit pourquoi (etat_sauvegarde, Task 7) —
    // mkdir-récursif sous un volume démonté écrirait au mauvais endroit.
    let dossier_sauvegarde = crate::reglages::lire(&etat.dossier)
        .filter(|c| std::path::Path::new(c).is_dir())
        .map(std::path::PathBuf::from);
    let reglages = sidecar::Reglages {
        node: chemin_node,
        base: etat.base.clone(),
        token_raindrop: token_raindrop.to_string(),
        token_local: etat.token_local.clone(),
        dossier_donnees: etat.dossier.clone(),
        dossier_sauvegarde,
    };
```

- [ ] **Step 5: Vérifier**

Run: `cargo test`
Expected: toute la suite Rust PASS (les constructions de `Reglages` hors demarrage — il n'y en a pas d'autres en prod — sont à jour ; le compilateur pointera tout restant).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/sidecar.rs src-tauri/src/demarrage.rs
git commit -m "feat(tauri): le sidecar reçoit BACKUP_DIR au spawn, et seulement lui"
```

---

### Task 7: Le dialogue natif et les commandes (Rust)

**Files:**
- Create: `src-tauri/capabilities/default.json`
- Modify: `src-tauri/src/commandes.rs`
- Modify: `src-tauri/src/lib.rs` (plugin + handlers)
- Modify: `docs/superpowers/specs/2026-09-18-selection-dossier-design.md` (§2 : « côté npm » retiré)

**Interfaces:**
- Produces: commandes Tauri `etat_sauvegarde` → `{ dossier: string | null, introuvable: boolean }`, `choisir_dossier_sauvegarde` → `EtatConnexion`, `retirer_dossier_sauvegarde` → `EtatConnexion` (sérialisation snake_case, miroir front en Task 8).

- [ ] **Step 1: capabilities/default.json**

```json
{
  "$schema": "../node_modules/@tauri-apps/cli/config.schema.json",
  "identifier": "default",
  "windows": ["main"],
  "permissions": ["core:default", "dialog:default"]
}
```

- [ ] **Step 2: Commandes (commandes.rs)** — imports en tête : `use std::time::Duration; use tauri_plugin_dialog::DialogExt; use crate::reglages;`

```rust
/// L'état du dossier de sauvegarde CÔTÉ RUST (spec sélection §2) : ce que le
/// webview ne peut ni lire ni vérifier lui-même — un chemin de disque. Le
/// moteur, lui, répond par /api/backup/status ; le panneau combine les deux.
#[derive(serde::Serialize)]
pub struct EtatSauvegarde {
    pub dossier: Option<String>,
    pub introuvable: bool,
}

#[tauri::command]
pub async fn etat_sauvegarde(app: AppHandle) -> EtatSauvegarde {
    tauri::async_runtime::spawn_blocking(move || {
        let etat = app.state::<Etat>();
        let dossier = reglages::lire(&etat.dossier);
        EtatSauvegarde {
            introuvable: dossier.as_ref().is_some_and(|d| !std::path::Path::new(d).is_dir()),
            dossier,
        }
    })
    .await
    .unwrap_or(EtatSauvegarde { dossier: None, introuvable: false })
}

/// Écrit le réglage PUIS relance par le chemin d'enregistrer_jeton (C1 :
/// jeton lu au trousseau, jeton local CONSERVÉ — c'est le port qui change).
/// L'écriture AVANT la relance : un échec de relance laisse le réglage posé,
/// l'écran de panne porte les issues, et « Réessayer » rejoue avec CE réglage.
fn relancer_avec_dossier(etat: &Etat, chemin: Option<String>) -> Result<EtatConnexion, String> {
    reglages::ecrire(&etat.dossier, chemin)?;
    let token_raindrop = match trousseau::lire() {
        Ok(Some(t)) => t,
        Ok(None) => return Ok(EtatConnexion::JetonRequis),
        Err(detail) => return Ok(EtatConnexion::Panne { detail }),
    };
    let chemin_node = match node::resoudre() {
        node::Verdict::Trouve { chemin, .. } => chemin,
        autre => return Ok(verdict_en_etat(autre)),
    };
    Ok(crate::demarrage::lancer_sidecar(etat, chemin_node, &token_raindrop))
}

#[tauri::command]
pub async fn choisir_dossier_sauvegarde(app: AppHandle) -> EtatConnexion {
    tauri::async_runtime::spawn_blocking(move || {
        let etat = app.state::<Etat>();
        let (tx, rx) = std::sync::mpsc::channel::<Option<String>>();
        // Le panel macOS tourne sur le thread principal : le plugin y bascule
        // tout seul, ce fil (spawn_blocking) attend par canal. Annulé ou
        // fermé → l'état courant, inchangé : annuler n'est pas un geste.
        app.dialog().file().pick_folder(move |choix| {
            let _ = tx.send(choix.and_then(|p| p.into_path().ok()).map(|p| p.display().to_string()));
        });
        let choisi = rx
            .recv_timeout(Duration::from_secs(600))
            .ok()
            .flatten();
        match choisi {
            None => etat.attendre(),
            Some(c) => {
                relancer_avec_dossier(&etat, Some(c))
                    .unwrap_or_else(|detail| EtatConnexion::Panne { detail })
            }
        }
    })
    .await
    .unwrap_or_else(|e| EtatConnexion::Panne { detail: format!("tâche choisir_dossier_sauvegarde interrompue : {e}") })
}

#[tauri::command]
pub async fn retirer_dossier_sauvegarde(app: AppHandle) -> EtatConnexion {
    tauri::async_runtime::spawn_blocking(move || {
        let etat = app.state::<Etat>();
        relancer_avec_dossier(&etat, None)
            .unwrap_or_else(|detail| EtatConnexion::Panne { detail })
    })
    .await
    .unwrap_or_else(|e| EtatConnexion::Panne { detail: format!("tâche retirer_dossier_sauvegarde interrompue : {e}") })
}
```

⚠️ `p.into_path()` : API `FilePath` de tauri-plugin-dialog v2 — si la signature diffère dans la version vendue (`cargo build` le dira), ajuster la conversion ici uniquement. Rien d'autre ne touche ce type.

- [ ] **Step 3: lib.rs** — `mod reglages;` (déjà en Task 5) ; dans `tauri::Builder::default()` :

```rust
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commandes::deconnecter,
            commandes::etat_connexion,
            commandes::enregistrer_jeton,
            commandes::relancer,
            commandes::installer_runtime,
            commandes::progression_installation,
            commandes::etat_sauvegarde,
            commandes::choisir_dossier_sauvegarde,
            commandes::retirer_dossier_sauvegarde
        ])
```

(`lancer_sidecar` est déjà `pub(crate)` — Task 6 le consomme depuis commandes.rs : vérifier la visibilité, sinon `pub(crate)`.)

- [ ] **Step 4: Amender la spec §2** — remplacer « dépendance nouvelle, côté Rust et côté npm » par : « dépendance nouvelle **côté Rust uniquement** — le webview ne fait qu'invoquer nos commandes, jamais le plugin (amendement Task 7 du plan) ».

- [ ] **Step 5: Vérifier**

Run: `cargo test && cargo build`
Expected: tests PASS, build OK (la présence de `capabilities/default.json` est validée au build ; `tauri dev` en Task 15 la validera au runtime).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/capabilities/default.json src-tauri/src/commandes.rs src-tauri/src/lib.rs src-tauri/src/demarrage.rs docs/superpowers/specs/2026-09-18-selection-dossier-design.md
git commit -m "feat(tauri): choisir et retirer le dossier de sauvegarde au dialogue natif"
```

---

### Task 8: Types et amorce côté front

**Files:**
- Modify: `shared/types.ts` (`RaindropItem.cache`, ~ligne 18)
- Modify: `sidecar/api/mappers.ts:27` (type brut, commentaire)
- Modify: `src/state/appState.tsx` (items de Revue + action `archive`)
- Modify: `src/lib/amorce.ts` (+test)

**Interfaces:**
- Produces: `RaindropItem.cache: { status: string; size?: number } | null` ; items de Revue : `cache?: { status: string } | null` (absent = vue sans cette information — liens morts) ; action `| { op: "archive" }` dans l'union de Revue.
- Produces: `etatSauvegarde(): Promise<{ dossier: string | null; introuvable: boolean }>`, `choisirDossierSauvegarde(): Promise<Amorce>`, `retirerDossierSauvegarde(): Promise<Amorce>` (lib/amorce).

- [ ] **Step 1: Types**

`shared/types.ts` :
```ts
  // `size` = taille compressée stockée (spec sauvegarde §5.4) — transite
  // depuis le début (MCP verbatim, C3), déclaré seulement maintenant.
  cache: { status: string; size?: number } | null;
```
`mappers.ts:27` : `cache?: { status: string; size?: number } | null;` + commentaire « C3 : le MCP réémet verbatim, la taille transite ».

`appState.tsx` (union Revue) :
```ts
      items: { id: number; url: string; title: string; collectionId: number; cache?: { status: string } | null }[];
      action:
        | { op: "trash" }
        | { op: "move"; toCollectionId: number }
        | { op: "tag"; tags: string[] }
        | { op: "archive" } // copies permanentes → /api/backup/archive (spec sélection §4.2)
        | { op: "empty-trash" }
        | { op: "delete-empty-collections" };
```

- [ ] **Step 2: amorce.ts** — étendre l'union de `demander` avec `"etat_sauvegarde" | "choisir_dossier_sauvegarde" | "retirer_dossier_sauvegarde"`, puis :

```ts
export interface EtatSauvegarde {
  dossier: string | null;
  introuvable: boolean;
}

/** L'état du dossier CÔTÉ RUST (chemin + introuvable) — le moteur, lui,
 *  répond par /api/backup/status ; le panneau combine les deux. */
export async function etatSauvegarde(): Promise<EtatSauvegarde> {
  if (!isTauri()) return { dossier: null, introuvable: false };
  try {
    return await invoke<EtatSauvegarde>("etat_sauvegarde");
  } catch {
    return { dossier: null, introuvable: false };
  }
}

/** Ouvre le dialogue natif (Rust), écrit reglages.json, relance le sidecar —
 *  l'Amorce rendue re-câble port et jeton via `appliquer`. */
export const choisirDossierSauvegarde = (): Promise<Amorce> => demander("choisir_dossier_sauvegarde");

/** Retire le réglage et relance : la sauvegarde redevient inactive. Rien
 *  n'est touché sur disque (spec §2). */
export const retirerDossierSauvegarde = (): Promise<Amorce> => demander("retirer_dossier_sauvegarde");
```

- [ ] **Step 3: Tests** — dans `amorce.test.ts`, suivre le pattern existant (invokeMock) :

```ts
it("etat_sauvegarde lit l'état du dossier côté Rust", async () => {
  invokeMock.mockResolvedValue({ dossier: "/sauv", introuvable: true });
  const etat = await etatSauvegarde();
  expect(invokeMock).toHaveBeenCalledWith("etat_sauvegarde");
  expect(etat).toEqual({ dossier: "/sauv", introuvable: true });
});

it("choisir_dossier_sauvegarde applique l'état rendu (Pret → app)", async () => {
  invokeMock.mockResolvedValue({ kind: "pret", port: 4321, token: "t" });
  const amorce = await choisirDossierSauvegarde();
  expect(invokeMock).toHaveBeenCalledWith("choisir_dossier_sauvegarde");
  expect(amorce).toEqual({ ecran: "app" });
  expect(window.RAINDROP_GUI).toEqual({ port: 4321, token: "t" });
});
```

- [ ] **Step 4: Vert + typechecks**

Run: `npx vitest run src/lib/amorce.test.ts && npm run typecheck && npm run typecheck:front`
Expected: PASS. (Le compilateur pointera les fakes de tests existants dont les `items` de Revue ou `RaindropItem` doivent rester valides — les champs ajoutés sont optionnels, rien ne devrait casser.)

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts sidecar/api/mappers.ts src/state/appState.tsx src/lib/amorce.ts src/lib/amorce.test.ts
git commit -m "feat(front): le contrat s'élargit — cache.size, action archive, état du dossier"
```

---

### Task 9: Hooks de sauvegarde (front)

**Files:**
- Create: `src/hooks/useBackup.ts` + `src/hooks/useBackup.test.ts`

**Interfaces:**
- Consumes: routes des Tasks 2-3 ; `api` (lib/api).
- Produces: `useBackupStatus()`, `useArchives()` → `{ octets: number; set: Set<number> } | undefined`, `useJobsEnVol()` → `JobEnVol[] | undefined`, `useInvalidateSauvegarde()` (invalide `["backup","status"]` + `["backup","archives"]`), `formatterOctets(n: number): string`, `dureeEstimee(n: number): string`.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useArchives, useBackupStatus, useJobsEnVol, formatterOctets, dureeEstimee } from "./useBackup";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("../lib/api", () => ({ api: { get: getMock, send: vi.fn() } }));

const harnais = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper, client };
};

beforeEach(() => getMock.mockReset());

describe("hooks de sauvegarde", () => {
  it("useBackupStatus lit /api/backup/status", async () => {
    getMock.mockResolvedValue({ actif: false, raison: "aucun dossier" });
    const { wrapper } = harnais();
    const { result } = renderHook(() => useBackupStatus(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ actif: false, raison: "aucun dossier" }));
    expect(getMock).toHaveBeenCalledWith("/api/backup/status");
  });

  it("useArchives convertit la liste d'ids en Set", async () => {
    getMock.mockResolvedValue({ ids: [2, 7], octets: 40 });
    const { wrapper } = harnais();
    const { result } = renderHook(() => useArchives(), { wrapper });
    await waitFor(() => expect(result.current.data?.set).toEqual(new Set([2, 7])));
    expect(result.current.data?.octets).toBe(40);
  });

  it("useJobsEnVol lit /api/jobs", async () => {
    getMock.mockResolvedValue([{ id: "j1", type: "backup", status: "running", progress: { done: 1, total: 2, label: "bookmarks" } }]);
    const { wrapper } = harnais();
    const { result } = renderHook(() => useJobsEnVol(), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(getMock).toHaveBeenCalledWith("/api/jobs");
  });
});

describe("formatage", () => {
  it("octets → unité lisible", () => {
    expect(formatterOctets(0)).toBe("0 o");
    expect(formatterOctets(40)).toBe("40 o");
    expect(formatterOctets(430 * 2 ** 20)).toMatch(/Mo/);
    expect(formatterOctets(3.4 * 2 ** 30)).toMatch(/Go/);
  });
  it("durée : 2 requêtes par copie à 550 ms, minutes au-delà de 2 min", () => {
    expect(dureeEstimee(10)).toMatch(/12 s/);
    expect(dureeEstimee(1000)).toMatch(/min/);
  });
});
```

- [ ] **Step 2: Échec** — `npx vitest run src/hooks/useBackup.test.ts` → FAIL (module absent).

- [ ] **Step 3: Implémenter useBackup.ts**

```ts
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { t, type FrKey } from "../i18n/fr";
import { api } from "../lib/api";

// Formes de /api/backup/status, /api/backup/archives et /api/jobs — les
// DTOs du sidecar, miroirs des interfaces de backup/ (spec sélection §3-§4).
export interface StatutSauvegarde {
  actif: boolean;
  dossier?: string;
  raison?: string;
  dernier?: { horodatage: string; complet: boolean; count: number } | null;
  instantanes?: number;
}
export interface InventaireArchives { ids: number[]; octets: number }
export interface JobEnVol {
  id: string;
  type: string; // "backup" | "archive"
  status: string;
  progress: { done: number; total: number; label: string | null };
}
export interface ResultatArchivage {
  demandes: number; faits: number; echecs: { id: number; raison: string }[]; annule: boolean;
}
export interface ResultatSauvegarde {
  horodatage: string; complet: boolean; count: number;
  bascule?: string; // la raison d'escalade, portée jusqu'à l'interface (§6)
}

export const useBackupStatus = () =>
  useQuery({
    queryKey: ["backup", "status"],
    queryFn: () => api.get<StatutSauvegarde>("/api/backup/status"),
    refetchInterval: 15_000,
  });

export const useArchives = () =>
  useQuery({
    queryKey: ["backup", "archives"],
    queryFn: async () => {
      const inv = await api.get<InventaireArchives>("/api/backup/archives");
      return { octets: inv.octets, set: new Set(inv.ids) };
    },
    staleTime: 60_000,
  });

export const useJobsEnVol = () =>
  useQuery({
    queryKey: ["jobs"],
    queryFn: () => api.get<JobEnVol[]>("/api/jobs"),
    refetchInterval: 5_000,
  });

/** Après un job d'archivage ET après chaque sauvegarde — purgerOrphelins
 *  peut avoir réduit l'inventaire en silence (spec sélection §4.1). */
export const useInvalidateSauvegarde = () => {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ["backup"] });
  };
};

// ─── Formatage (testé ci-dessus) ────────────────────────────────────────────

export function formatterOctets(n: number): string {
  if (n < 2 ** 10) return `${n} o`;
  if (n < 2 ** 20) return `${(n / 2 ** 10).toFixed(0)} Ko`;
  if (n < 2 ** 30) return `${(n / 2 ** 20).toFixed(0)} Mo`;
  return `${(n / 2 ** 30).toFixed(1)} Go`;
}

/** Deux requêtes par copie, file à 550 ms (spec sélection §4.2). */
export function dureeEstimee(n: number): string {
  const s = Math.ceil(n * 1.1);
  if (s < 120) return t("sauvegarde.duree.s", { n: s });
  return t("sauvegarde.duree.min", { n: Math.ceil(s / 60) });
}

/** Les clés de progression émises par le sidecar (Task 4), traduites — le
 *  même pattern que ETAT_MCP de Reglages : `satisfies` garantit que chaque
 *  clé a sa traduction ; le contrôle `in` rattrape une clé inconnue. */
export const LABELS_PROGRESSION = {
  bookmarks: "sauvegarde.progress.bookmarks",
  modifies: "sauvegarde.progress.modifies",
  corbeille: "sauvegarde.progress.corbeille",
  collections: "sauvegarde.progress.collections",
  surlignages: "sauvegarde.progress.surlignages",
  profil: "sauvegarde.progress.profil",
} as const satisfies Record<string, FrKey>;

export function libelleProgression(label: string | null): string {
  if (label === null) return t("sauvegarde.progress.neutre");
  return label in LABELS_PROGRESSION
    ? t(LABELS_PROGRESSION[label as keyof typeof LABELS_PROGRESSION])
    : label;
}
```

Ajouter les clés `fr.ts` utilisées ici (cf. Step 4).

- [ ] **Step 4: Clés fr.ts** — dans `src/i18n/fr.ts` :

```ts
  "sauvegarde.progress.bookmarks": "signets",
  "sauvegarde.progress.modifies": "éléments modifiés",
  "sauvegarde.progress.corbeille": "corbeille",
  "sauvegarde.progress.collections": "collections",
  "sauvegarde.progress.surlignages": "surlignages",
  "sauvegarde.progress.profil": "profil",
  "sauvegarde.progress.neutre": "sauvegarde en cours…",
  "sauvegarde.duree.s": "environ {n} s",
  "sauvegarde.duree.min": "environ {n} min",
```

(Vérifier la syntaxe d'interpolation exacte du fichier : les clés existantes comme `bulk.selected` montrent le mécanisme — l'imiter.)

- [ ] **Step 5: Vert + typecheck explicite**

Run: `npx vitest run src/hooks/useBackup.test.ts && npx tsc --noEmit src/hooks/useBackup.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useBackup.ts src/hooks/useBackup.test.ts src/i18n/fr.ts
git commit -m "feat(front): les hooks de sauvegarde — statut, inventaire, jobs en vol"
```

---

### Task 10: SectionSauvegarde — dossier, statut, archives (front)

**Files:**
- Create: `src/components/SectionSauvegarde.tsx` + `SectionSauvegarde.test.tsx`
- Modify: `src/components/Reglages.tsx` (montage) + `Reglages.test.tsx` (mock du module)
- Modify: `src/i18n/fr.ts`

**Interfaces:**
- Consumes: `etatSauvegarde/choisirDossierSauvegarde/retirerDossierSauvegarde` (Task 8), `useBackupStatus/useArchives` (Task 9).
- Produces: `SectionSauvegarde({ onEtat }: { onEtat: (a: Amorce) => void })` — le composant de job (Task 11) s'ajoute DANS ce fichier ou en Task 11 en composant voisin.

- [ ] **Step 1: Composant**

```tsx
import { useEffect, useState } from "react";
import { t } from "../i18n/fr";
import { api } from "../lib/api";
import {
  choisirDossierSauvegarde,
  etatSauvegarde,
  retirerDossierSauvegarde,
  type Amorce,
  type EtatSauvegarde,
} from "../lib/amorce";
import { formatterOctets, useArchives, useBackupStatus, type ResultatSauvegarde } from "../hooks/useBackup";
import { suivreSauvegarde, type SauvegardeEnVol } from "../lib/suiviSauvegarde";

// Section Sauvegarde des Réglages (spec sélection §3) : le dossier (côté
// Rust), le statut du moteur (côté sidecar), l'inventaire des archives, et
// le vol (Task 11). L'inactif n'est pas une panne : « Aucun dossier choisi ».
export function SectionSauvegarde({ onEtat }: { onEtat: (a: Amorce) => void }) {
  const [dossier, setDossier] = useState<EtatSauvegarde | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const status = useBackupStatus();
  const archives = useArchives();
  const vol = suivreSauvegarde(); // Task 11 — porté par ce composant dès maintenant

  useEffect(() => {
    void etatSauvegarde().then(setDossier);
  }, []);

  const geste = async (action: () => Promise<Amorce>) => {
    if (occupe) return;
    setOccupe(true);
    setErreur(null);
    const amorce = await action();
    setOccupe(false);
    void etatSauvegarde().then(setDossier); // le réglage a pu bouger
    if (amorce.ecran !== "app") onEtat(amorce); // panne de relance : les écrans d'amorçage portent les issues
  };

  const dernier = status.data?.dernier ?? null;

  return (
    <div className="mb-4 border-t border-app-border pt-4">
      <p className="mb-1 text-xs uppercase tracking-wide text-app-muted">{t("sauvegarde.titre")}</p>

      {dossier?.introuvable ? (
        <p className="mb-2 text-sm">
          {t("sauvegarde.introuvable", { chemin: dossier.dossier ?? "" })}
        </p>
      ) : dossier?.dossier ? (
        <p className="mb-2 flex flex-col text-sm">
          <span>{t("sauvegarde.dossier")}</span>
          <span className="url break-all text-xs text-app-muted">{status.data?.dossier ?? dossier.dossier}</span>
        </p>
      ) : (
        <p className="mb-2 text-sm text-app-muted">{t("sauvegarde.aucun")}</p>
      )}

      {status.data?.actif === false && status.data.raison && (
        <p className="mb-2 text-xs text-app-muted">{status.data.raison}</p>
      )}

      {status.data?.actif && (
        <div className="mb-2 flex flex-col gap-0.5 text-sm">
          {dernier ? (
            <span>
              {t("sauvegarde.dernier", {
                date: new Date(dernier.horodatage.replace("T", " ").slice(0, 16)).toLocaleString("fr-FR"),
                mode: dernier.complet ? t("sauvegarde.complet") : t("sauvegarde.incremental"),
              })}
            </span>
          ) : (
            <span className="text-app-muted">{t("sauvegarde.jamais")}</span>
          )}
          {status.data.instantanes !== undefined && (
            <span>{t("sauvegarde.instantanes", { n: status.data.instantanes })}</span>
          )}
          {archives.data && archives.data.set.size > 0 && (
            <span>
              {t("sauvegarde.archives", { n: archives.data.set.size, volume: formatterOctets(archives.data.octets) })}
            </span>
          )}
          {(status.data.instantanes ?? 0) === 0 && (
            <span className="text-xs text-app-muted">{t("sauvegarde.premiere")}</span>
          )}
        </div>
      )}

      <SauvegardeEnVol vol={vol} /> {/* Task 11 — rien tant que null */}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" disabled={occupe}
          onClick={() => void geste(choisirDossierSauvegarde)}>
          {dossier?.dossier ? t("sauvegarde.changer") : t("sauvegarde.choisir")}
        </button>
        {dossier?.dossier && (
          <button type="button" className="btn" disabled={occupe}
            onClick={() => void geste(retirerDossierSauvegarde)}>
            {t("sauvegarde.retirer")}
          </button>
        )}
        {status.data?.actif && (
          <button type="button" className="btn ml-auto" disabled={occupe || vol !== null}
            onClick={() => void lancer()}>{t("sauvegarde.lancer")}</button>
        )}
      </div>
      {erreur !== null && <p role="alert" className="mt-2 text-xs text-app-broken">{erreur}</p>}
    </div>
  );

  async function lancer() {
    if (occupe) return;
    setOccupe(true);
    setErreur(null);
    try {
      await api.send<{ jobId: string }>("POST", "/api/backup/run", { mode: "incremental" });
      // le vol est suivi par suivreSauvegarde via /api/jobs — rien d'autre ici
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setOccupe(false);
    }
  }
}
```

⚠️ `suivreSauvegarde` (Task 11) n'existe pas encore : créer dans ce task un **stub** minimal `src/lib/suiviSauvegarde.ts` exportant `suivreSauvegarde(): SauvegardeEnVol | null` rendant `null` et `type SauvegardeEnVol = { kind: "vol"; jobId: string; done: number; total: number; label: string | null; bascule?: string; annule?: boolean; echec?: string }` — remplacé en Task 11. Le composant `SauvegardeEnVol` (jsx) de ce task : `return vol === null ? null : null;` en attendant. (Le plan ne laisse aucun appel vers un symbole non défini.)

- [ ] **Step 2: Montage dans Reglages.tsx** — sous le bloc connexion (`<p className="mb-4 …">{t("reglages.note")}</p>` et avant les boutons), insérer `<SectionSauvegarde onEtat={onEtat} />` + import. Dans `Reglages.test.tsx`, ajouter au `vi.mock` existant : `vi.mock("./SectionSauvegarde", () => ({ SectionSauvegarde: () => <div data-testid="section-sauvegarde" /> }));` — les tests existants de Reglages restent verts.

- [ ] **Step 3: Clés fr.ts**

```ts
  "sauvegarde.titre": "Sauvegarde locale",
  "sauvegarde.aucun": "Aucun dossier choisi.",
  "sauvegarde.dossier": "Dossier de sauvegarde :",
  "sauvegarde.introuvable": "Dossier configuré mais introuvable : {chemin} — vérifiez le volume, ou choisissez un autre dossier.",
  "sauvegarde.dernier": "Dernière sauvegarde : {date} ({mode})",
  "sauvegarde.complet": "balayage complet",
  "sauvegarde.incremental": "incrémental",
  "sauvegarde.jamais": "Aucune sauvegarde encore.",
  "sauvegarde.instantanes": "{n} instantanés conservés",
  "sauvegarde.archives": "{n} copies archivées ({volume})",
  // ⚠️ CALCULÉ, jamais en dur (correction de l'utilisateur) : voir
  // `coutBalayage` dans useBackup.ts, dérivé du bookmarksCount réel.
  "sauvegarde.premiere": "La première sauvegarde est un balayage complet : {duree} et {requetes} requêtes pour {signets} signets.",
  "sauvegarde.premiere.sansCompte": "La première sauvegarde est un balayage complet : elle lit toute la bibliothèque.",
  "sauvegarde.choisir": "Choisir un dossier…",
  "sauvegarde.changer": "Changer de dossier…",
  "sauvegarde.retirer": "Retirer",
  "sauvegarde.lancer": "Sauvegarder maintenant",
```

- [ ] **Step 4: Tests (SectionSauvegarde.test.tsx)** — mocks : `../lib/amorce`, `../hooks/useBackup`, `../lib/suiviSauvegarde` (stub → null).

```tsx
const { statusMock, archivesMock, etatMock, choisirMock, retirerMock, volMock } = vi.hoisted(() => ({
  statusMock: vi.fn(), archivesMock: vi.fn(), etatMock: vi.fn(),
  choisirMock: vi.fn(), retirerMock: vi.fn(), volMock: vi.fn(),
}));
vi.mock("../hooks/useBackup", () => ({
  useBackupStatus: statusMock, useArchives: archivesMock,
  formatterOctets: (n: number) => `${n} o`,
}));
vi.mock("../lib/suiviSauvegarde", () => ({ suivreSauvegarde: volMock }));
vi.mock("../lib/api", () => ({ api: { get: vi.fn(), send: vi.fn() } }));
vi.mock("../lib/amorce", () => ({
  etatSauvegarde: etatMock, choisirDossierSauvegarde: choisirMock, retirerDossierSauvegarde: retirerMock,
}));

beforeEach(() => {
  volMock.mockReset().mockReturnValue(null);
  etatMock.mockReset().mockResolvedValue({ dossier: null, introuvable: false });
  archivesMock.mockReset().mockReturnValue({ data: undefined });
});

it("sans dossier : un état, pas une panne", () => {
  statusMock.mockReturnValue({ data: { actif: false, raison: "aucun dossier de sauvegarde configuré" } });
  render(<SectionSauvegarde onEtat={vi.fn()} />);
  expect(screen.getByText("Aucun dossier choisi.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Choisir un dossier…" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Sauvegarder maintenant" })).not.toBeInTheDocument();
});

it("actif : chemin final, dernier instantané, archives, avertissement de première sauvegarde", () => {
  etatMock.mockResolvedValue({ dossier: "/sauv", introuvable: false });
  statusMock.mockReturnValue({ data: { actif: true, dossier: "/sauv/Raindrop-GUI", instantanes: 0, dernier: null } });
  archivesMock.mockReturnValue({ data: { octets: 40, set: new Set([2, 7]) } });
  render(<SectionSauvegarde onEtat={vi.fn()} />);
  expect(screen.getByText("/sauv/Raindrop-GUI")).toBeInTheDocument(); // le chemin FINAL, pas le parent
  expect(screen.getByText("Aucune sauvegarde encore.")).toBeInTheDocument();
  expect(screen.getByText("2 copies archivées (40 o)")).toBeInTheDocument();
  expect(screen.getByText(/balayage complet/)).toBeInTheDocument(); // l'avertissement, avant le geste
});

it("configuré mais disparu : l'état distinct, pas le silence", async () => {
  etatMock.mockResolvedValue({ dossier: "/Volumes/USB/Sauv", introuvable: true });
  statusMock.mockReturnValue({ data: { actif: false } });
  render(<SectionSauvegarde onEtat={vi.fn()} />);
  await screen.findByText(/introuvable/);
});

it("une panne de relance sort vers l'écran d'amorçage (issues portées)", async () => {
  etatMock.mockResolvedValue({ dossier: null, introuvable: false });
  statusMock.mockReturnValue({ data: { actif: false } });
  choisirMock.mockResolvedValue({ ecran: "panne", detail: "sidecar sans port" });
  const onEtat = vi.fn();
  const user = userEvent.setup();
  render(<SectionSauvegarde onEtat={onEtat} />);
  await user.click(screen.getByRole("button", { name: "Choisir un dossier…" }));
  await waitFor(() => expect(onEtat).toHaveBeenCalledWith({ ecran: "panne", detail: "sidecar sans port" }));
});
```

- [ ] **Step 5: Vert + typecheck explicite**

Run: `npx vitest run src/components/SectionSauvegarde.test.tsx src/components/Reglages.test.tsx && npx tsc --noEmit src/components/SectionSauvegarde.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/SectionSauvegarde.tsx src/components/SectionSauvegarde.test.tsx src/components/Reglages.tsx src/components/Reglages.test.tsx src/lib/suiviSauvegarde.ts src/i18n/fr.ts
git commit -m "feat(front): le panneau Sauvegarde des Réglages — dossier, statut, archives"
```

---

### Task 11: SectionSauvegarde — le vol : compteur nommé, annulation, réattachement (front)

**Files:**
- Modify: `src/lib/suiviSauvegarde.ts` (le stub devient réel)
- Create: `src/lib/suiviSauvegarde.test.ts`
- Modify: `src/components/SectionSauvegarde.tsx` (composant `SauvegardeEnVol` réel) + test
- Modify: `src/i18n/fr.ts`

**Interfaces:**
- Consumes: `jobEvents` (lib/sse), `useJobsEnVol`, `LABELS_PROGRESSION/libelleProgression` (Task 9), route `POST /api/jobs/:id/cancel` (plan 1).
- Produces: `suivreSauvegarde(): SauvegardeEnVol | null` — hook unique de suivi d'un vol de type backup **ou** archive : POST déjà émis ailleurs OU job trouvé en vol (`/api/jobs`) → abonnement SSE ; `null` = rien en vol. `SauvegardeEnVol = { jobId, type, done, total, label, bascule?, annule?, echec? }`.

- [ ] **Step 1: suiviSauvegarde.ts**

```ts
import { useEffect, useState } from "react";
import { jobEvents } from "./sse";
import { api } from "./api";
import { useJobsEnVol, type ResultatArchivage, type ResultatSauvegarde } from "../hooks/useBackup";

export type SauvegardeEnVol = {
  jobId: string;
  type: "backup" | "archive";
  done: number;
  total: number;
  label: string | null;
  bascule?: string;    // backup : la raison d'escalade (§6 « et le dit »)
  annule?: boolean;    // le vol s'est terminé par une annulation
  echec?: string;      // le vol s'est terminé en erreur
  resultat?: ResultatSauvegarde | ResultatArchivage; // done → porté jusqu'à l'UI
};

const TERMINAISON = new Set(["done", "error", "cancelled"]);

/**
 * Un SEUL vol suivi à la fois — il n'y a qu'une file. Au montage (et à chaque
 * listing /api/jobs) : un job backup|archive EN VOL qu'on n'a pas lancé
 * (boot §4.4, Revue quittée) est adopté : règle de ré-attachement (spec
 * sélection §3). Le `jobIdLocal` (émetteur d'un POST) prime sur l'adoption.
 */
export function suivreSauvegarde(jobIdLocal?: string): SauvegardeEnVol | null {
  const jobs = useJobsEnVol();
  const [vol, setVol] = useState<SauvegardeEnVol | null>(null);

  const candidat = jobIdLocal ?? jobs.data?.find((j) => j.type === "backup" || j.type === "archive");

  useEffect(() => {
    if (!candidat) { setVol(null); return; }
    const controle = new AbortController();
    let vivant = true;
    setVol({ jobId: candidat.id, type: candidat.type as "backup" | "archive", done: candidat.progress.done, total: candidat.progress.total, label: candidat.progress.label });
    void jobEvents(candidat.id, {
      onEvent: (evt) => {
        if (!vivant) return;
        setVol((precedent) => {
          const base: SauvegardeEnVol = {
            jobId: candidat.id,
            type: candidat.type as "backup" | "archive",
            done: typeof evt.done === "number" ? evt.done : precedent?.done ?? 0,
            total: typeof evt.total === "number" ? evt.total : precedent?.total ?? 0,
            label: typeof evt.label === "string" ? evt.label : precedent?.label ?? null,
          };
          if (evt.kind === "done") return { ...base, resultat: evt.result as ResultatSauvegarde | ResultatArchivage };
          if (evt.kind === "cancelled") return { ...base, annule: true };
          if (evt.kind === "error") return { ...base, echec: String(evt.message ?? "erreur") };
          return base;
        });
      },
      onDone: () => { /* la terminaison arrive par l'événement lui-même */ },
    }, controle.signal).catch(() => vivant && setVol(null)); // flux mort : pas de vol visible plutôt qu'un vol menteur
    return () => { vivant = false; controle.abort(); };
  }, [candidat?.id]);

  return vol;
}

/** Annule le vol courant. Rend l'erreur éventuelle à l'appelant. */
export async function annuler(jobId: string): Promise<void> {
  await api.send("POST", `/api/jobs/${jobId}/cancel`);
}

export { TERMINAISON };
```

(Le `TERMINAISON` exporté n'est probablement pas nécessaire — le supprimer si le test final ne l'utilise pas ; ne pas garder un export mort.)

- [ ] **Step 2: Tests (suiviSauvegarde.test.ts)** — mock `../lib/sse` (jobEvents piloté à la main), `../lib/api`, `../hooks/useBackup` (useJobsEnVol) :

```ts
const { jobEventsMock, getMock, sendMock, jobsMock } = vi.hoisted(() => ({
  jobEventsMock: vi.fn(), getMock: vi.fn(), sendMock: vi.fn(), jobsMock: vi.fn(),
}));
vi.mock("./sse", () => ({ jobEvents: jobEventsMock }));
vi.mock("./api", () => ({ api: { get: getMock, send: sendMock } }));
vi.mock("../hooks/useBackup", () => ({
  useJobsEnVol: jobsMock,
}));

// Capturer les handlers passés à jobEvents pour les piloter :
let handlers: { onEvent: (e: Record<string, unknown>) => void; onDone: () => void };
beforeEach(() => {
  handlers = { onEvent: () => {}, onDone: () => {} };
  jobEventsMock.mockReset().mockImplementation(async (_id: string, h: typeof handlers) => {
    Object.assign(handlers, h);
    await new Promise(() => {}); // flux ouvert jusqu'à l'abort
  });
  jobsMock.mockReset().mockReturnValue({ data: [] });
});

it("adopte un job en vol qu'il n'a pas lancé (ré-attachement)", async () => {
  jobsMock.mockReturnValue({ data: [{ id: "j9", type: "backup", status: "running", progress: { done: 5, total: 10, label: "bookmarks" } }] });
  const { result } = renderHook(() => suivreSauvegarde(), { wrapper: harnais() });
  await waitFor(() => expect(result.current?.jobId).toBe("j9"));
  expect(result.current?.done).toBe(5);
});

it("suit la progression, porte la bascule à done", async () => {
  jobsMock.mockReturnValue({ data: [{ id: "j1", type: "backup", status: "running", progress: { done: 0, total: 0, label: null } }] });
  const { result } = renderHook(() => suivreSauvegarde(), { wrapper: harnais() });
  await waitFor(() => expect(handlers.onEvent).toBeDefined());
  act(() => handlers.onEvent({ kind: "progress", done: 300, total: 12210, label: "bookmarks" }));
  expect(result.current?.done).toBe(300);
  act(() => handlers.onEvent({ kind: "progress", done: 0, total: 12210, label: "bookmarks" })); // rejeu → le numérateur recule, l'UI dira « reprise »
  expect(result.current?.done).toBe(0);
  act(() => handlers.onEvent({ kind: "done", result: { horodatage: "x", complet: true, count: 12210, bascule: "7 jours — balayage complet" } }));
  expect(result.current?.resultat).toMatchObject({ bascule: "7 jours — balayage complet" });
});

it("annulation et échec sont portés", async () => {
  jobsMock.mockReturnValue({ data: [{ id: "j2", type: "archive", status: "running", progress: { done: 1, total: 3, label: null } }] });
  const { result } = renderHook(() => suivreSauvegarde(), { wrapper: harnais() });
  await waitFor(() => expect(result.current?.jobId).toBe("j2"));
  act(() => handlers.onEvent({ kind: "cancelled" }));
  expect(result.current?.annule).toBe(true);
});

it("annuler() appelle la route de cancel", async () => {
  sendMock.mockResolvedValue({});
  await annuler("j2");
  expect(sendMock).toHaveBeenCalledWith("POST", "/api/jobs/j2/cancel");
});
```

(`harnais` : QueryClientProvider comme en Task 9 ; `act` importé de @testing-library/react.)

- [ ] **Step 3: Le composant de vol dans SectionSauvegarde.tsx** — remplacer le stub :

```tsx
function SauvegardeEnVolVue({ vol }: { vol: SauvegardeEnVol }) {
  const [precedent, setPrecedent] = useState<number | null>(null);
  const reprise = precedent !== null && vol.done < precedent;
  useEffect(() => setPrecedent(vol.done), [vol.done]);

  if (vol.resultat) {
    const bascule = "bascule" in vol.resultat ? vol.resultat.bascule : undefined;
    return <p className="mb-2 text-xs text-app-muted">{t("sauvegarde.termine")}</p> /* + bascule affichée */;
  }
  const compte = `${vol.done.toLocaleString("fr-FR")} / ${vol.total.toLocaleString("fr-FR")}`;
  return (
    <p className="mb-2 text-sm" aria-live="polite">
      {reprise
        ? t("sauvegarde.reprise")
        : vol.label === null
          ? t("sauvegarde.progress.neutre")
          : `${compte} ${libelleProgression(vol.label)}`}
      <button type="button" className="btn ml-2" onClick={() => void annuler(vol.jobId)}>
        {t("sauvegarde.annuler")}
      </button>
    </p>
  );
}
```

Compléter proprement (bascule rendue quand présente : `<>{t("sauvegarde.termine")}{bascule && <span> — {t("sauvegarde.bascule", { raison: bascule })}</span>}</>` ; `annule` → `t("sauvegarde.annulee")` ; `echec` → ligne `role="alert"`). Brancher dans `SectionSauvegarde` : `<SauvegardeEnVolVue vol={vol} />` où le stub était. Le bouton « Sauvegarder maintenant » garde `disabled={vol !== null}`.

- [ ] **Step 4: Clés fr.ts** : `"sauvegarde.reprise": "Reprise du balayage…"`, `"sauvegarde.annuler": "Annuler"`, `"sauvegarde.termine": "Sauvegarde terminée."`, `"sauvegarde.bascule": "Balayage complet : {raison}"`, `"sauvegarde.annulee": "Sauvegarde annulée — elle n'est pas comptée comme valide."`, `"sauvegarde.archive.envol": "Archivage en cours : {done} / {total} copies"`.

- [ ] **Step 5: Vert + typecheck explicite + suite du panneau**

Run: `npx vitest run src/lib/suiviSauvegarde.test.ts src/components/SectionSauvegarde.test.tsx && npx tsc --noEmit src/lib/suiviSauvegarde.test.ts src/components/SectionSauvegarde.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/suiviSauvegarde.ts src/lib/suiviSauvegarde.test.ts src/components/SectionSauvegarde.tsx src/components/SectionSauvegarde.test.tsx src/i18n/fr.ts
git commit -m "feat(front): le vol de sauvegarde se voit — compteur nommé, annulation, ré-attachement"
```

---

### Task 12: La Revue exécute l'archivage (front)

**Files:**
- Modify: `src/components/BulkBar.tsx` + test
- Create: `src/components/ArchiveJob.tsx` + `ArchiveJob.test.tsx`
- Modify: `src/components/ReviewPage.tsx` + test
- Modify: `src/i18n/fr.ts`

**Interfaces:**
- Consumes: action `{ op: "archive" }` (Task 8), `useArchives`, `formatterOctets`, `dureeEstimee`, `ResultatArchivage` (Task 9), `suivreSauvegarde/annuler` (Task 11), route `POST /api/backup/archive` (bornée 500, sidecar).
- Produces: `ArchiveJob({ ids, onTermine, onErreur }: { ids: number[]; onTermine(r: ResultatArchivage): void; onErreur(m: string): void })`.

- [ ] **Step 1: BulkBar — le bouton** (après Tagger) :

```tsx
      <button type="button" className="rounded border border-app-border px-2 py-1" onClick={() => build({ op: "archive" })}>
        {t("bulk.archive")}
      </button>
```

et `build` embarque le cache (la Revue en a besoin pour compter les copiables — spec sélection §4.2) :

```tsx
        items: selected.map((i) => ({ id: i.id, url: i.url, title: i.title, collectionId: i.collectionId, cache: i.cache })),
```

Test (BulkBar.test.tsx, pattern existant) :

```ts
it("propose « Archiver la copie » et construit une Revue archive avec le cache", async () => {
  // items : deux RaindropItem dont un cache:{status:"ready",size:100}
  await user.click(screen.getByRole("button", { name: "Archiver la copie" }));
  expect(goMock).toHaveBeenCalledWith(expect.objectContaining({
    kind: "review",
    action: { op: "archive" },
    items: expect.arrayContaining([expect.objectContaining({ cache: { status: "ready", size: 100 } })]),
  }));
});
```

(fr.ts : `"bulk.archive": "Archiver la copie"`.)

- [ ] **Step 2: ArchiveJob.tsx**

```tsx
import { useEffect, useRef, useState } from "react";
import { t } from "../i18n/fr";
import { api } from "../lib/api";
import { suivreSauvegarde, annuler } from "../lib/suiviSauvegarde";
import { useJobsEnVol, type ResultatArchivage } from "../hooks/useBackup";

/**
 * Le vol d'archivage DANS la Revue (spec sélection §4.2) : l'archivage est
 * un job (202 + SSE), pas une mutation. Ré-attachement au montage : un
 * archivage déjà en vol est adopté au lieu d'en lancer un second — la route
 * refuserait, autant lui donner le suivi. Quitter la Revue n'arrête rien :
 * le job continue, visible au panneau (même règle §3).
 */
export function ArchiveJob({ ids, onTermine, onErreur }: {
  ids: number[];
  onTermine(r: ResultatArchivage): void;
  onErreur(m: string): void;
}) {
  const jobs = useJobsEnVol();
  const [jobIdLocal, setJobIdLocal] = useState<string | null>(null);
  const demarre = useRef(false);
  const vol = suivreSauvegarde(jobIdLocal ?? undefined);

  useEffect(() => {
    if (demarre.current) return;
    // déjà en vol → on l'adopte (suivreSauvegarde le trouvera) ; sinon POST
    const existant = jobs.data?.find((j) => j.type === "archive");
    if (existant) { demarre.current = true; return; }
    demarre.current = true;
    api.send<{ jobId: string }>("POST", "/api/backup/archive", { ids })
      .then((r) => setJobIdLocal(r.jobId))
      .catch((e: unknown) => onErreur(e instanceof Error ? e.message : String(e)));
  }, [jobs.data, ids, onErreur]);

  useEffect(() => {
    const r = vol?.resultat;
    if (vol && !vol.annule && !vol.echec && r && "echecs" in r) onTermine(r as ResultatArchivage);
  }, [vol, onTermine]);

  if (!vol) return <p className="text-sm">{t("review.archive.lancement")}</p>;

  const terminaison = vol.annule
    ? t("review.archive.annule")
    : vol.echec
      ? t("state.error", { message: vol.echec })
      : null;

  if (terminaison !== null) return <p role="alert" className="text-sm">{terminaison}</p>;

  const resultat = vol.resultat && "echecs" in vol.resultat ? vol.resultat : null;
  if (resultat) {
    const reussis = resultat.faits - resultat.echecs.length;
    return (
      <p className="text-sm">
        {t("review.archive.termine", { reussis, echoues: resultat.echecs.length })}
        {resultat.echecs.length > 0 && (
          <span className="block text-xs text-app-muted">
            {resultat.echecs.slice(0, 3).map((e) => e.raison).join(" · ")}
            {resultat.echecs.length > 3 ? " …" : ""}
          </span>
        )}
      </p>
    );
  }

  return (
    <p className="text-sm" aria-live="polite">
      {t("review.archive.envol", { done: vol.done.toLocaleString("fr-FR"), total: vol.total.toLocaleString("fr-FR") })}
      <button type="button" className="btn ml-2" onClick={() => void annuler(vol.jobId)}>{t("sauvegarde.annuler")}</button>
    </p>
  );
}
```

- [ ] **Step 3: ReviewPage — la branche archive.** Dans `ReviewPage` :

```tsx
  const archivesSet = useArchives().data?.set ?? new Set<number>();
  const estArchive = review.action.op === "archive";
  // Les déjà-archivés sont ÉCARTÉS du job et COMPTÉS (spec §4.2) ; sans copie
  // permanente connue (cache absent — liens morts) on envoie : le serveur
  // échoue ces ids individuellement et les compte ; avec cache connu et non
  // ready : ignorés ici, comptés ici.
  const restants = remaining.filter((i) => !archivesSet.has(i.id));
  const dejaArchive = remaining.length - restants.length;
  const cacheConnu = review.items.filter((i) => i.cache !== undefined);
  const sansCopie = estArchive && cacheConnu.length > 0
    ? restants.filter((i) => i.cache !== undefined && i.cache?.status !== "ready").length
    : 0;
  const aArchiver = restants.filter((i) => i.cache === undefined || i.cache?.status === "ready").map((i) => i.id);
  const volume = restants.reduce((n, i) => n + (i.cache?.status === "ready" ? i.cache.size ?? 0 : 0), 0);
  const borneDepassee = estArchive && aArchiver.length > 500;
  const [archiveLancee, setArchiveLancee] = useState(false);
```

`canRun` : `(estArchive ? confirmed && aArchiver.length > 0 && !borneDepassee : …formule existante…)` — fusionner sans casser les branches L2. `execute()` : en tête de fonction,

```tsx
    if (review.action.op === "archive") { setArchiveLancee(true); return; }
```

Rendu : quand `estArchive && archiveLancee`, remplacer le footer par `<ArchiveJob ids={aArchiver} onTermine={(r) => { invalidate("raindrops"); clearSelection(); goBack(); }} onErreur={setErreur} />` (l'inventaire s'invalide aussi : `useInvalidateSauvegarde()` — Task 9 — appelé dans `onTermine`). Au-dessus du footer, quand `estArchive`, une ligne d'annonce :

```tsx
      {estArchive && !archiveLancee && (
        <p className="px-4 text-xs text-app-muted">
          {t("review.archive.annonce", { n: aArchiver.length, deja: dejaArchive, sans: sansCopie })}
          {volume > 0 && <> — {t("review.archive.volume", { volume: formatterOctets(volume), duree: dureeEstimee(aArchiver.length) })}</>}
          {cacheConnu.length === 0 && <> {t("review.archive.sansInfo")}</>}
          {borneDepassee && <span role="alert" className="block text-app-broken">{t("review.archive.borne", { n: aArchiver.length })}</span>}
        </p>
      )}
```

`actionLabel` : ajouter la branche `review.action.op === "archive" ? t("bulk.archive") :` en tête de l'expression.

- [ ] **Step 4: Clés fr.ts**

```ts
  "review.archive.annonce": "{n} copie(s) à archiver, {deja} déjà archivée(s) et ignorée(s), {sans} sans copie permanente.",
  "review.archive.volume": "environ {volume}, {duree}",
  "review.archive.sansInfo": "Copies non connues pour cette vue : les signets sans copie échoueront individuellement et seront comptés.",
  "review.archive.borne": "{n} sélectionnés : la borne est de 500 par archivage.",
  "review.archive.lancement": "Lancement de l'archivage…",
  "review.archive.envol": "Archivage : {done} / {total} copies",
  "review.archive.termine": "Terminé : {reussis} archivée(s), {echoues} en échec.",
  "review.archive.annule": "Archivage annulé — ce qui est écrit reste.",
```

- [ ] **Step 5: Tests ReviewPage** — le mock du module useBackup existe à créer ; les items du test PROUVENT d'abord la présence (règle du lot) :

```ts
it("archive : les déjà-archivés sont écartés ET comptés", async () => {
  // items : id 1 (cache ready), id 2 (déjà archivé — dans archivesSet), id 3 (cache null)
  archivesMock.mockReturnValue({ data: { set: new Set([2]), octets: 0 } });
  …render(<ReviewPage review={{ kind: "review", items: [/* 1,2,3 avec cache */, ], action: { op: "archive" }, sourceLabel: "sélection" }} goBack={vi.fn()} /> …
  expect(screen.getByText(/3 copie\(s\) à archiver|2 copie\(s\) à archiver/)).toBeVisible(); // précisé ci-dessous
  expect(screen.getByText(/1 déjà archivée/)).toBeInTheDocument();
  // exécuter → le POST ne porte QUE [1,3] :
  await user.click(screen.getByRole("button", { name: /Confirmer|Exécuter/ })); // libellé réel du bouton
  expect(sendMock).toHaveBeenCalledWith("POST", "/api/backup/archive", { ids: [1, 3] });
});

it("archive : la borne 500 est un refus affiché, le bouton est mort", async () => {
  archivesMock.mockReturnValue({ data: undefined });
  // 501 items générés (cache ready) → aArchiver = 501
  …
  expect(screen.getByText(/la borne est de 500/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Exécuter/ })).toBeDisabled();
  expect(sendMock).not.toHaveBeenCalled();
});
```

**Sabotage obligatoire (règle du lot)** : sur le premier test, retirer le filtre `!archivesSet.has(i.id)` du calcul de `restants`, relancer — le test doit TOMBER (le POST porterait 3 ids). Rétablir.

- [ ] **Step 6: Tests ArchiveJob** — mocks `../lib/api` (send), `../lib/suiviSauvegarde` (suivreSauvegarde piloté, annuler), `../hooks/useBackup` (useJobsEnVol) :

```ts
it("POST puis suit ; termine via onTermine", async () => {
  sendMock.mockResolvedValue({ jobId: "j1" });
  // volMock piloté par re-render : commencer null, puis { jobId:"j1", type:"archive", done:1, total:2, label:null, resultat:{demandes:2,faits:2,echecs:[],annule:false} }
  const onTermine = vi.fn();
  …
  expect(sendMock).toHaveBeenCalledWith("POST", "/api/backup/archive", { ids: [1] });
  await waitFor(() => expect(onTermine).toHaveBeenCalledWith(expect.objectContaining({ faits: 2 })));
});

it("adopte un archivage déjà en vol au lieu d'un second POST", async () => {
  jobsMock.mockReturnValue({ data: [{ id: "j9", type: "archive", status: "running", progress: { done: 1, total: 2, label: null } }] });
  volMock.mockReturnValue({ jobId: "j9", type: "archive", done: 1, total: 2, label: null });
  render(<ArchiveJob ids={[1]} onTermine={vi.fn()} onErreur={vi.fn()} />);
  expect(sendMock).not.toHaveBeenCalled();
  expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument();
});
```

- [ ] **Step 7: Vert + typecheck explicite**

Run: `npx vitest run src/components/ArchiveJob.test.tsx src/components/ReviewPage.test.tsx src/components/BulkBar.test.tsx && npx tsc --noEmit src/components/ArchiveJob.test.tsx src/components/ReviewPage.test.tsx`
Expected: PASS (sabotage fait et rétabli au passage).

- [ ] **Step 8: Commit**

```bash
git add src/components/BulkBar.tsx src/components/BulkBar.test.tsx src/components/ArchiveJob.tsx src/components/ArchiveJob.test.tsx src/components/ReviewPage.tsx src/components/ReviewPage.test.tsx src/i18n/fr.ts
git commit -m "feat(revue): l'archivage des copies permanentes passe par la Revue"
```

---

### Task 13: La vue Liens morts sélectionne et archive (front)

**Files:**
- Modify: `src/components/CleanupView.tsx` (ResultatsLiens type "dead") + `CleanupView.test.tsx`
- Modify: `src/components/CleanupRows.tsx` (DeadRow gagne sélection)
- Modify: `docs/superpowers/specs/2026-09-18-selection-dossier-design.md` (§4.2 amendé)

**Interfaces:**
- Consumes: action `archive` (Task 8), `toggleSelect/selectedIds/clearSelection` (appState, existants).
- Produces: la sélection de la vue Liens morts construit une Revue `archive` (items **sans** `cache` — la vue ne porte pas cette information, spec §4.2).

- [ ] **Step 1: Sélection sur les lignes mortes** — `DeadRow` gagne deux props optionnelles `selected?: boolean; onToggle?: () => void` ; quand `onToggle` est fourni, la ligne rend la case (même anatomie que la ligne de Revue : la case `tabIndex={-1}`, la LIGNE reste l'arrêt) :

```tsx
export function DeadRow({ r, collectionRacine, selected, onToggle }: {
  r: LinkResultEnrichi; collectionRacine?: string;
  selected?: boolean; onToggle?: () => void;
}) {
  return (
    <div className={...existing + (selected ? " bg-app-sel" : "")} onClick={onToggle} role={onToggle ? "row" : undefined}>
      {onToggle && <input type="checkbox" tabIndex={-1} aria-label={r.title} checked={selected} onChange={onToggle} className="mr-2" />}
      …corps existant…
    </div>
  );
}
```

(Le type exact du prop `r` est celui du fichier — `LinkCheckResult & { title: number|… }` enrichi ; réutiliser la déclaration existante de CleanupRows.)

- [ ] **Step 2: ResultatsLiens — brancher la sélection pour type "dead"**

```tsx
function ResultatsLiens({ type }: { type: "dead" | "redirect" }) {
  const { selectedIds, toggleSelect, clearSelection, go } = useAppState();
  …
  const estDead = type === "dead";
  const selectionnes = items.filter((r) => selectedIds.has(r.raindropId));
  const archiver = () => {
    go({
      kind: "review",
      items: selectionnes.map((r) => ({ id: r.raindropId, url: r.url, title: r.title, collectionId: r.collectionId })),
      action: { op: "archive" },
      sourceLabel: t("cleanup.dead"),
      returnView: { kind: "cleanupView", type: "dead" },
    });
    clearSelection(); // R15P-3 : le clear appartient à l'action
  };
  …
  <Entete label={LABELS[type]} count={q.data?.total}
    action={estDead ? (
      <button type="button" className="btn" disabled={selectionnes.length === 0} onClick={archiver}>
        {t("cleanup.archiver", { n: selectionnes.length })}
      </button>
    ) : undefined} />
  …
  <DeadRow key={r.raindropId} r={r} collectionRacine={titreRacine(r.collectionId)}
    selected={estDead && selectedIds.has(r.raindropId)}
    onToggle={estDead ? () => toggleSelect(r.raindropId) : undefined} />
```

fr.ts : `"cleanup.archiver": "Archiver la copie ({n})"`.

⚠️ Déviation assumée vis-à-vis de la spec §4.2 (« BulkBar gagne un paramètre ») : `CleanupView` ne monte pas `BulkBar` et ne le montera pas — le pattern de la vue est « Entete action → Revue » (Corbeille, Collections vides le font déjà). Le paramètre de `BulkBar` devient inutile. **Amender la spec** (Step 4).

- [ ] **Step 3: Tests (CleanupView.test.tsx)** — suivre les mocks existants du fichier (useAnalysisResults etc.) :

```ts
it("liens morts : cocher deux lignes active le bouton, la Revue porte l'action archive sans cache", async () => {
  …render avec 3 résultats d'analyse…
  await user.click(screen.getAllByRole("row")[0]); // ligne = arrêt, le clic coche
  await user.click(screen.getAllByRole("row")[1]);
  const bouton = screen.getByRole("button", { name: "Archiver la copie (2)" });
  await user.click(bouton);
  expect(goMock).toHaveBeenCalledWith(expect.objectContaining({
    kind: "review",
    action: { op: "archive" },
    items: expect.arrayContaining([expect.not.objectContaining({ cache: expect.anything() })]),
  }));
});

it("zéro sélection : le bouton est là mais mort", () => {
  …
  expect(screen.getByRole("button", { name: "Archiver la copie (0)" })).toBeDisabled();
});
```

- [ ] **Step 4: Amender la spec §4.2** — remplacer le point « `BulkBar` gagne un paramètre… » par :

> **Les points d'entrée construisent la Revue à leur façon** (amendé à
> l'implémentation, Task 13) : `BulkBar` gagne le bouton « Archiver la copie »
> (avec le `cache` des items — la liste le connaît) ; la vue Liens morts suit
> son propre pattern « Entete action → Revue » (corbeille, collections vides)
> et porte des items SANS `cache` — la Revue le dit et le serveur compte les
> échecs individuels. Le paramètre d'actions de `BulkBar` prévu ici est
> abandonné : aucune vue ne monte `BulkBar` avec un sous-ensemble d'actions.
> (C4 resté vrai : `CleanupView` ne monte pas `BulkBar`.)

- [ ] **Step 5: Vert + typecheck explicite**

Run: `npx vitest run src/components/CleanupView.test.tsx src/components/CleanupRows.test.tsx 2>/dev/null || npx vitest run src/components/CleanupView.test.tsx && npx tsc --noEmit src/components/CleanupView.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/CleanupView.tsx src/components/CleanupView.test.tsx src/components/CleanupRows.tsx docs/superpowers/specs/2026-09-18-selection-dossier-design.md src/i18n/fr.ts
git commit -m "feat(cleanup): les liens morts sélectionnables partent en Revue d'archivage"
```

---

### Task 14: Le marqueur « Archivé » (front)

**Files:**
- Modify: `src/components/RaindropRow.tsx` + test
- Modify: `src/components/DetailPane.tsx` + test
- Modify: `src/components/ListPane.tsx` (branchement)
- Modify: `src/i18n/fr.ts`

**Interfaces:**
- Consumes: `useArchives` (Task 9).
- Produces: `RaindropRow({ …, archive?: boolean })` ; même prop sur le détail. Trois états lecture : archivé / copiable non archivé (`r.cache?.status === "ready"`, déjà dans le DTO) / rien.

- [ ] **Step 1: RaindropRow** — prop `archive?: boolean` ; à côté du titre :

```tsx
      {archive && (
        <span className="shrink-0 rounded border border-app-border px-1 text-[10px] uppercase tracking-wide text-app-muted">
          {t("marque.archive")}
        </span>
      )}
```

Branchement dans `ListPane.tsx` : `const archives = useArchives().data?.set;` puis `<RaindropRow … archive={archives?.has(r.id)} …/>`. `DetailPane.tsx` : même prop, même chip + si `!archive && r.cache?.status === "ready"` une mention `{t("marque.copiable")}` (texte discret `text-app-muted`) — l'utilisateur sait qu'elle est archivable. fr.ts : `"marque.archive": "Archivé"`, `"marque.copiable": "Copie permanente disponible (non archivée ici)"`.

- [ ] **Step 2: Tests** — RaindropRow.test.tsx :

```ts
it("le marqueur « Archivé » n'apparaît que demandé", () => {
  render(<RaindropRow r={item()} selected={false} isDetail={false} archive />);  // adapté aux props réelles
  expect(screen.getByText("Archivé")).toBeInTheDocument();
  rerender(<RaindropRow r={item()} selected={false} isDetail={false} />);
  expect(screen.queryByText("Archivé")).not.toBeInTheDocument();
});
```

Et **la règle du lot** : une assertion de présence doit montrer que le moteur peut la produire — le test du branchement dans DetailPane.test (ou ListPane si le pattern de test s'y prête) vérifie `useArchives` → `set.has(id)` → marqueur visible pour un id MEMBRE et invisible pour un id HORS jeu posé exprès dans le mock.

- [ ] **Step 3: Vert + typecheck explicite**

Run: `npx vitest run src/components/RaindropRow.test.tsx src/components/DetailPane.test.tsx && npx tsc --noEmit src/components/RaindropRow.test.tsx src/components/DetailPane.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/RaindropRow.tsx src/components/RaindropRow.test.tsx src/components/DetailPane.tsx src/components/DetailPane.test.tsx src/components/ListPane.tsx src/i18n/fr.ts
git commit -m "feat(front): le marqueur « Archivé » sur la ligne et le détail"
```

---

### Task 15: Revue de lot — cliquet, suites complètes, ROADMAP

**Files:**
- Modify: `docs/ROADMAP.md`
- Vérification: tous les fichiers touchés

- [ ] **Step 1: Cliquet de taille** — `wc -l` sur chaque fichier modifié/créé : aucun > 400, cible 300. `ReviewPage.tsx` est le risque : s'il dépasse 300, extraire le bloc d'annonce + branchement archive dans un composant voisin (`RevueArchive.tsx`) — frontière naturelle : la ligne d'annonce + le rendu d'`ArchiveJob`.
- [ ] **Step 2: Suites complètes** — `npm test` (rediriger vers un fichier, le test instable du lot précédent : capturer le nom si ça resurgit), `npm run typecheck`, `npm run typecheck:front`, `npx tsc --noEmit` sur CHAQUE `*.test.ts(x)` et fichier `sidecar/testing/` touché, `cargo test`.
- [ ] **Step 3: Un vrai parcours dev** — `./scripts/dev-sidecar.sh` avec `BACKUP_DIR` jetable : `GET /api/backup/status` actif ; via l'app (`npm run tauri:dev`) : Réglages → Choisir un dossier → la sauvegarde se lance depuis le panneau, le compteur nommé tourne, l'annulation répond ; un archivage de 2 ids depuis une sélection s'affiche et se termine. (Pas de stress : la porte §4.4 a déjà validé le moteur en réel.)
- [ ] **Step 4: ROADMAP** — cocher l'entrée « Sélecteur du dossier de sauvegarde + panneau + archivage » avec le résumé de ce qui est livré et ce qui reste (sémantique de progression : le compteur nommé la tranche — le noter ; marqueur sur mosaïque volontairement non fait).
- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs(roadmap): sélecteur, panneau et archivage livrés — le lot sauvegarde est joignable"
```

---

## Self-review (fait à l'écriture)

- **Couverture spec** : §2 → Tasks 5-7 ; §3 → Tasks 10-11 (+2, 3, 4 pour la matière) ; §4.1 → Tasks 2, 9, 14 ; §4.2 → Tasks 12-13 ; §5 → Tasks 1-4 ; §6 → Tasks 5-7 ; §7 → Tasks 8-14 ; §8 → chaque task + sabotages en 12 ; §9 exclusions respectées (aucune reprise, aucun budget, pas de re-archivage forcé, mosaïque non marquée — noté en Task 15). C1 (jeton conservé) respecté en Task 7 ; C2 (GET /api/jobs + ré-attachement) en Tasks 3, 11, 12 ; C3 consigné en Task 8 ; C4/C5 en Tasks 13 et 10.
- **Placeholders** : aucun « TBD » ; les deux endroits où l'exécuteur doit LIRE le fichier avant d'insérer (Task 4 auxiliaires, Task 13 type de `DeadRow`) nomment les symboles exacts et la forme du code à poser.
- **Types** : `SauvegardeEnVol` (Task 11) consommé tel quel en 12 ; `ResultatArchivage`/`ResultatSauvegarde` définis en Task 9 et importés en 11-12 ; `inventaire()` défini en Task 2, consommé en 9 ; les commandes Rust de Task 7 ont leur miroir exact en Task 8.
