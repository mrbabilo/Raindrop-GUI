# ROADMAP — Raindrop-GUI

⚠️ Les cases traînent derrière le code livré : vérifier `git log` avant de
traiter une tâche « à faire ».

*Dernier recalage : 2026-09-16.*

## Phase 1 — Bibliothèque + Nettoyage (spec validée)

- [x] **Plan 1/3 — sidecar** (pont MCP, API REST locale, moteur d'analyse) :
      **exécuté le 2026-09-16** (16/16 tasks, 108 tests, revue finale clean ;
      5 fix rounds en cours d'exécution + fix wave final).
- [ ] **Plan 2/3 — front React** — plan **écrit** (`cd7466b`) et **en cours
      d'exécution** ; **20 sections de task** depuis l'amendement du 2026-09-16
      (ajout des Tasks 6b et 7b), dont la Task 0 invalidée — **19 à exécuter** :
      - Task 0 livrée (`d61c7f0`) puis **INVALIDÉE** — son endpoint n'existe
        pas (voir dettes ci-dessous) ; remplacée par la **Task 0b**.
      - Tasks 1 → 7 livrées : scaffold (`e55a167`), i18n/thème/shell
        (`ac5f17b`…`941e9cf`), client API (`b70b7f6`), hooks Query (`f4b35df`),
        panneau gauche (`6f35ef7`), TopBar (`9e181d9`), liste virtualisée
        (`d03612f`).
      - **Reprend à la Task 6b**, puis 7b, puis 8. Task 0b avant la Task 8.
      - ⚠️ `docs/DESIGN.md` **fait foi sur l'apparence** depuis le 2026-09-16
        ~16h18 — soit **après** l'écriture du plan (9h49). Les blocs de code du
        plan antérieurs à cette heure portent des jetons inexistants
        (`app-accent`, `app-danger`) : directive globale posée en tête de plan,
        occurrences corrigées. Les signaux eux-mêmes (§2) ne sont **rendus nulle
        part** — c'est l'objet de la Task 7b.
- [ ] **Plan 3/3 — shell Tauri** (fenêtre, spawn sidecar, trousseau macOS,
      écran premier lancement) : à écrire après le plan 2. Porte aussi le
      **sélecteur du dossier de sauvegarde** (spec sauvegarde §4.3).

## Lot sauvegarde et couche de données locale

- [x] **Spec écrite** : `docs/superpowers/specs/2026-09-16-sauvegarde-donnees-locales-design.md`
      (`454a5fc` → `cc78e45`, 8 défauts corrigés après relecture critique).
      Amende le §11 de la spec principale : la réplication locale n'est plus
      exclue, l'invariant devient « source de vérité **en écriture** ».
- [ ] **En attente de relecture utilisateur** → ensuite `writing-plans`.
- [ ] **Hors ligne** (consultation + file d'opérations simples) : après le
      plan 2, sur le socle posé par le lot sauvegarde.

## Dettes et points ouverts

- [ ] **`POST /raindrops/unrestore` n'existe pas** — 404 vérifié en réel. Le
      code de la Task 0 ne peut pas fonctionner. Correctif = **Task 0b**
      (`PUT /raindrops/-99` + mémoire des origines de corbeille) ; prérequis
      des Tasks 8/13/15 seulement.
- [ ] **Le throttle 550 ms ne couvre pas `raindropRest.ts`** — la limite de
      120 req/min est globale par utilisateur. Corrigé par la spec sauvegarde
      §4.4 (file commune, priorité à l'interactif), pas encore dans le code.
- [ ] **Les mappers perdent quatre champs gratuits** (`sidecar/api/mappers.ts`,
      **aucun `mappers.test.ts` n'existe** — ils ne sont testés qu'à travers les
      routes) : `toCollection` laisse tomber `cover` et `color` (icônes de
      collection inaffichables, DESIGN.md §4) ; `toRaindropItem` laisse tomber
      `cache` et `broken`, qui **arrivent gratuitement dans la réponse de
      liste** (vérifié le 2026-09-16). Une petite task sidecar les expose et
      débloque d'un coup l'icône de collection, le mode lecture et le quick win
      « copie archivée » (spec §12). Consommateurs à suivre :
      `sidecar/analysis/snapshot.ts`, les deux routes, `src/lib/api.test.ts`.
- [ ] **Trois filtres inertes** : `ListPane` ne transmet pas `domain`,
      `createdStart`, `createdEnd` à `useRaindrops`, qui les accepte pourtant —
      ces trois contrôles de la TopBar (Task 6) ne filtrent rien. Le quatrième,
      `media`, a été câblé par la **Task 6b** (`fab257c`) : sans lui les puces
      de nature n'auraient rien filtré, ce que DESIGN.md §11 exige. Les trois
      restants passent par `listQueryArgs` (`src/hooks/listQuery.ts`, partagé
      avec `NatureChips` pour que les `queryKey` ne dérivent pas) — **Task 7b**,
      step 4.
- [ ] **Lexique thématique à élargir** (`docs/DESIGN.md` §3) à partir des
      étiquettes réelles : ce qu'il ne reconnaît pas s'affiche en gris.

## Veille

`python3 tools/check_sources.py` — 7 sources, aucune n'a bougé au 2026-09-16.
Le pont MCP épinglé reste **archivé en amont** ; son candidat de reprise
(`adeze/raindrop-mcp`) est évalué en spec §10.1, sans migration décidée.

## Phase 2 (aperçu — spec §12, hors périmètre présent)

Agent IA avec plan validé via la Revue de l'action, moteur de règles,
exclusions d'audit, spike Stella, packaging du sidecar en binaire autonome,
E2E (Playwright), écriture des highlights, OAuth2 à la place du token collé,
formats d'export élargis. Spec séparée à venir.
