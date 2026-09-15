# ROADMAP — Raindrop-GUI

⚠️ Les cases traînent derrière le code livré : vérifier `git log` avant de
traiter une tâche « à faire ».

## Phase 1 — Bibliothèque + Nettoyage (spec validée)

- [ ] **Plan 1/3 — sidecar** (pont MCP, API REST locale, moteur d'analyse) :
      plan écrit (`docs/superpowers/plans/2026-09-15-phase1-1-sidecar.md`,
      16 tasks), exécution non commencée.
- [ ] **Plan 2/3 — front React** (3 panneaux, palette ⌘K, nettoyage, Revue de
      l'action) : plan à écrire après l'exécution du plan 1 — il consommera
      l'API réelle du sidecar (`shared/types.ts` + endpoints).
- [ ] **Plan 3/3 — shell Tauri** (fenêtre, spawn sidecar, trousseau macOS,
      écran premier lancement) : plan à écrire après le plan 2.

## Phase 2 (aperçu — spec §12, hors périmètre présent)

Agent IA avec plan validé via la Revue de l'action, moteur de règles,
exclusions d'audit, spike Stella, packaging du sidecar en binaire autonome,
E2E (Playwright), écriture des highlights. Spec séparée à venir.
