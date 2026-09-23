# ROADMAP — Raindrop-GUI

⚠️ Les cases traînent derrière le code livré : vérifier `git log` avant de
traiter une tâche « à faire ».

*Dernier recalage : 2026-09-22 (lot inversion fiche ↔ lecture). L'historique détaillé vit dans
`CHANGELOG.md` et `git log` — ici ne restent que les entrées ouvertes, avec
leur raisonnement, et un renvoi par lot livré.*

## Soldé (renvois)

- **Phase 1 — Bibliothèque + Nettoyage** (2026-09-16 → 18) : plan 1/3
  sidecar (16 tasks), plan 2/3 front React (23 tasks, 311 tests), plan 3/3
  shell Tauri (13 tasks), Réglages (⌘,), dette cliquet + 30 erreurs TS
  réparées (`tsconfig.check.json`), runtime Node géré, compilateur
  (`build_app.py`/`release.py`), icône définitive posée. Détail : CHANGELOG.
- **Lot sauvegarde et couche de données locale** (2026-09-18 → 19) : spec
  `2026-09-16-sauvegarde-donnees-locales-design.md` (§1bis contraignant),
  file à deux rangs, canal REST direct, budget d'archives (27,6 Go pour
  tout archiver, ~1 600 archives dans les 5 Go), reprise en vol après 429,
  vues de Nettoyage actionnables, `archiver()` câblé, dossiers orphelins,
  sémantique de progression, sélecteur du dossier + panneau + archivage
  (pre.2 → pre.8). Détail : CHANGELOG.
- **Polissage du plan 2** (2026-09-17 → 19) : vue collection parente,
  navigation clavier, drag & drop, épure §9, passe design, lot a11y, états
  d'erreur, Composer/Tags, hygiène tests, sidecar défensif, `FrKey`. Détail :
  CHANGELOG.
- **Points fermés** (2026-09-19) : lexique thématique élargi, signalétique
  d'état jointe à la liste principale.
- **Audit fichier par fichier** (2026-09-20) : 13 entrées, 10 soldées
  (SSE aborté, clé de cache `perPage`, `noUnusedLocals`,
  `refetchOnWindowFocus`, sémantique du « vide », ligne orpheline, garde
  400 scan, file.run imbriqué, compte front du cliquet, `trousseau.rs`) ;
  les 3 restantes vivent en « Ouvert » ci-dessous.
- **Lots d'usage et corrections** (2026-09-20 → 21) : corbeille des
  doublons réparée (bulk via source 0), journal dans Réglages, drag sans
  sélection de texte, clic-fiche dans les vues de Nettoyage, dépôt par
  sortes, restaurations (origine mémorisée ou destination), puces de
  nature filtrantes (`type:` + vol de focus WebKit), « Non classés » /
  « Non-taggés », version + changelog dans l'app (pre.9 → pre.16). Détail :
  CHANGELOG.
- **Lot lecture et page web** (livré le 2026-09-21, pre.17) : « Lire » dans
  la fiche, vue lecture pleine largeur (HTML filtré en blocs, jamais
  d'innerHTML), « Voir la page » (fenêtre du shell à zéro capability),
  états nommés. Spec
  `docs/superpowers/specs/2026-09-19-lecture-et-page-web-design.md`.
  Reste au réel : 2-3 lectures sur vraies archives, concentration de la
  fenêtre, impuissance IPC du site ouvert (spec lecture §6).
- **Inversion fiche ↔ lecture** (livré le 2026-09-22) : le clic de
  bibliothèque ouvre la lecture (lisibilité partagée clic/bouton,
  « lecture sinon fiche »), la fiche accompagne en colonne, la ligne de
  tête remplace le rail ; DetailPane découpé (bloc corbeillé). Spec
  `docs/superpowers/specs/2026-09-22-inversion-fiche-lecture-design.md`.
  Détail : CHANGELOG.
- **Vues sauvegardées (« smart lists »)** (2026-09-22) : une vue filtrée
  nommée dans la barre latérale, qui vit — dépôt JSON local, routes CRUD,
  `smartlistId` sur la vue (effacé au patch de filtre), section barre
  latérale, bouton TopBar. Aucune logique propre : `listQueryArgs` reste
  le seul parser. Spec
  `docs/superpowers/specs/2026-09-22-smart-lists-design.md`. Détail :
  CHANGELOG.

## Ouvert

### Audit du 2026-09-23 — ce qui reste (détail : `docs/audit-2026-09-23.md`)

- [ ] **À vérifier en réel (Mac)** : `cargo test` du shell après le passage
      du jeton de la sonde sur stdin (`curl -H @-`) ; l'opérateur de dates
      `created:>=` / `<=` (une requête de métadonnées) ; l'export CSV sous
      WKWebView (aucun gestionnaire de téléchargement) ; le `modified` de la
      réponse `PUT /raindrops/-99` (le compte de restaurés est `ids.length`).
- [ ] **Liens morts sur la foi du HEAD seul** — seuls 405/501 déclenchent
      le repli GET (spec §5.1 : « GET si 405/ambigu »). Mesurer d'abord :
      revérifier en GET 10-20 morts réels, puis trancher.
- [ ] **Écart de spécification : le 3e niveau de collections est
      invisible** (barre latérale et `CollectionView` : deux niveaux ; DESIGN
      §4 en compte trois). Chantier de design, pas un correctif local.
- [ ] **CSP désactivée** (`"csp": null`) — proposition dans le rapport
      d'audit, à éprouver en réel (port dynamique, GitHub, images `https:`).
- [ ] **Dette de taille** : `ReviewPage.tsx` 397 (à découper AVANT tout
      ajout — frontière : le pied d'exécution et `supprimerCollections`),
      `i18n/fr.ts` 395, `raindrops.test.ts` 394.

### Nettoyage / analyse

- [x] **Revérifier les indéterminés** (2026-09-22) — `POST /api/analysis/recheck`
      → job `recheck-indeterminate` : les URLs distinctes que la vue montre
      (reclassement transport compris), sans balayage ni TTL, garde commune
      avec le scan de liens, `markScanDone` non posé. Bouton dans la vue,
      progression et annulation comme un scan, adoption en vol.
- [ ] **Redirections en masse** — remplacement de l'URL finale par lot via
      une op de Revue (`replace-url`, boucle REST directe en job) ;
      différé volontairement : écritures multiples d'un coup.
- [ ] **Dette : découper `CleanupRows.tsx`** (310 lignes, cible 300) —
      `TrashRow` en est la frontière naturelle (`CleanupRows.corbeille.tsx`,
      son test suit) ; franchi par la ligne de redirection à trois lignes
      du 2026-09-22.
- [ ] **Reprise après REDÉMARRAGE du processus** — différée, et pour une
      raison plutôt que par oubli (spec §1ter n°1b). `ouvrirJsonl` tronque
      toujours. Reprendre à la page N suppose une pagination inchangée depuis :
      dans une même exécution la fenêtre est de 2 min 20 et les trois signaux
      de réconciliation la couvrent, mais à travers un redémarrage l'écart est
      **non borné**, ce qui rend la « LIMITE ADMISE » (suppression + création
      dans le même intervalle → saut invisible) d'autant plus probable. La
      rendre saine demanderait de la conditionner à un écart court ET à un
      `count` inchangé — pour économiser 2 min 20 de travail de fond. Si
      quelqu'un la reprend : le point de reprise sûr est
      `floor(lignes / PAR_PAGE)`, et il faut **tronquer** la page partielle
      avant d'ajouter, jamais se contenter d'ouvrir en ajout — sinon ses items
      sont écrits deux fois, `ids` (un Set) masque le doublon, `lignes` le
      compte, et le balayage se plaint « des lignes ont été écrites sans
      identifiant numérique ». Un bug de reprise se dénoncerait comme une
      anomalie de données.

### UX / interface

- [ ] **Hors ligne** (consultation + file d'opérations simples) : après le
      plan 2, sur le socle posé par le lot sauvegarde. Inclut : écritures
      refusées proprement hors ligne (aujourd'hui les échecs remontent en
      `fetch failed` brut — jeton `broken` mal employé pour l'interruption
      MCP, voir polissage).
- [ ] **La Revue hérite de la colonne détail (320 px) si une fiche est
      ouverte** — depuis l'inversion (2026-09-22), `detailOuvert =
      selectedRaindropId !== null` : la fiche accompagne TOUTES les vues,
      la Revue comprise — DESIGN §9 en fait « le seul écran aéré ». À
      arbitrer : fermer la fiche à l'entrée en Revue, au coût de rouvrir
      au retour.
- [ ] **Mosaïque : non virtualisée** (`ListPane.tsx:141`) — qui traverse
      « Tous » en mosaïque finit à 12 210 tuiles DOM. **Patch immédiat
      posé le 2026-09-20** (`loading="lazy"` + `decoding="async"` sur le
      `<img>` — les vignettes ne partent plus hors champ) ; le vrai fix,
      le fenêtrage de la grille, reste ouvert.
- [ ] **Divergence des deux étoiles** — la fix wave a livré `Etoile`
      partagé (la divergence de fond est réglée) ; reste à vérifier
      visuellement la grille 13 px héritée. Micro-tâche.
- [ ] **Drag & drop de fusion d'étiquettes** dans la vue Tags — le geste
      attendu là où notre fusion est un formulaire.

### Perf / dette

- [ ] **Compteur doublons = payload complet** (dette « à surveiller »
      déjà notée) : remède = compteur dédié côté sidecar — chantier, pas
      patch ; coût actuel borné (414 groupes / 1 032 signets). **Moitié
      soldée le 2026-09-20** : dashboard et vue partagent UNE clé
      (`CLE_GROUPES`) — un exemplaire de cache au lieu de deux ; le
      payload complet reste.
- [ ] **Classifieur de qualité d'extraction** du lecteur (bonne/mauvaise avec
      raisons, à la Karakeep — leur `readerViewAssessment.ts` montre que le
      frais existe) — au-delà du binaire « vide / pas vide » de notre spec
      lecture §3.
- [ ] **Restes des revues du lot inversion + lecture (2026-09-22)** —
      ~~amendements de specs~~, ~~tests retour-de-lecture~~,
      ~~course au chargement du clic~~ (décision asynchrone : appel direct
      à `chargerInventaire` au clic, repli sûr), ~~garde Nettoyage
      élargie~~ (corbeille + Non-taggés), ~~cosmétiques~~ — **soldé le
      2026-09-22**. Reste : warning React `act` préexistant
      (`ListPane.test`, bruit de sortie à solder un jour).

## Veille

`python3 tools/check_sources.py` — 7 sources, aucune n'a bougé au 2026-09-16.
Le pont MCP épinglé reste **archivé en amont** ; son candidat de reprise
(`adeze/raindrop-mcp`) est évalué en spec §10.1, sans migration décidée.

## Phase 2 (aperçu — spec §12, hors périmètre présent)

Agent IA avec plan validé via la Revue de l'action, moteur de règles,
exclusions d'audit, spike Stella, packaging du sidecar en binaire autonome,
E2E (Playwright), écriture des highlights, OAuth2 à la place du token collé,
formats d'export élargis. Spec séparée à venir.
