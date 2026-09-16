# ROADMAP — Raindrop-GUI

⚠️ Les cases traînent derrière le code livré : vérifier `git log` avant de
traiter une tâche « à faire ».

## Phase 1 — Bibliothèque + Nettoyage (spec validée)

- [x] **Plan 1/3 — sidecar** (pont MCP, API REST locale, moteur d'analyse) :
      **exécuté le 2026-09-16** (16/16 tasks, 108 tests, revue finale clean ;
      5 fix rounds en cours d'exécution + fix wave final).
- [ ] **Plan 2/3 — front React** (3 panneaux, palette ⌘K, nettoyage, Revue de
      l'action) : plan à écrire — il consommera l'API réelle du sidecar
      (`shared/types.ts` + endpoints). Notes d'exécution à porter :
      SSE `done` porte le result nu (autres events : enveloppe) ; pas de
      replay SSE → GET `/api/jobs/:id` avant/parallèle au SSE ; EventSource
      natif ne peut pas poser d'Authorization → SSE par fetch ; latence
      pire-cas lecture MCP 2×timeout+2 s (retry).
- [ ] **Plan 3/3 — shell Tauri** (fenêtre, spawn sidecar, trousseau macOS,
      écran premier lancement) : plan à écrire après le plan 2.

## Phase 2 (aperçu — spec §12, hors périmètre présent)

Agent IA avec plan validé via la Revue de l'action, moteur de règles,
exclusions d'audit, spike Stella, packaging du sidecar en binaire autonome,
E2E (Playwright), écriture des highlights. Spec séparée à venir.
