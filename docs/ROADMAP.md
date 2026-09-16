# ROADMAP — Raindrop-GUI

⚠️ Les cases traînent derrière le code livré : vérifier `git log` avant de
traiter une tâche « à faire ».

*Dernier recalage : 2026-09-16.*

## Phase 1 — Bibliothèque + Nettoyage (spec validée)

- [x] **Plan 1/3 — sidecar** (pont MCP, API REST locale, moteur d'analyse) :
      **exécuté le 2026-09-16** (16/16 tasks, 108 tests, revue finale clean ;
      5 fix rounds en cours d'exécution + fix wave final).
- [ ] **Plan 2/3 — front React** — plan **écrit** (`cd7466b`, 17 tasks) et
      **en cours d'exécution** :
      - Task 0 livrée (`d61c7f0`) puis **INVALIDÉE** — son endpoint n'existe
        pas (voir dettes ci-dessous) ; remplacée par la **Task 0b**.
      - Task 1 livrée (`e55a167`) — scaffold Vite/React/Tailwind 4/Vitest+RTL.
      - **Reprend à la Task 2.** Task 0b à insérer avant la Task 8.
      - `docs/DESIGN.md` **fait foi sur l'apparence** depuis le 2026-09-16 ;
        jetons déjà posés dans `src/styles.css`.
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
- [ ] **`toCollection` perd `cover` et `color`** (`sidecar/api/mappers.ts`) :
      les icônes de collection ne sont pas affichables tant que le type
      partagé ne les expose pas.
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
