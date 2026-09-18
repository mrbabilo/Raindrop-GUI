# ROADMAP — Raindrop-GUI

⚠️ Les cases traînent derrière le code livré : vérifier `git log` avant de
traiter une tâche « à faire ».

*Dernier recalage : 2026-09-17 (fin du plan 3 — shell Tauri livré, les
13 tasks closes ; après revue finale de branche)
finale de branche).*

## Phase 1 — Bibliothèque + Nettoyage (spec validée)

- [x] **Plan 1/3 — sidecar** (pont MCP, API REST locale, moteur d'analyse) :
      **exécuté le 2026-09-16** (16/16 tasks, revue finale clean ; fix wave
      final).
- [x] **Plan 2/3 — front React** : **exécuté le 2026-09-16/17** — 23 tasks
      (0, 0b, 0c, 1-16 + 6b, 7b, 7c, 8b), 20 revues de task toutes closes
      (13 fix rounds), revue finale de branche « Ready to merge: With
      fixes » → fix wave unique de 11 chantiers re-revue **11/11 clean**
      (`dc9a7be` + `504823b`). 311 tests verts + 2 skip, typechecks ×2 et
      build Vite verts. Contrôle navigateur final : console zéro erreur,
      palette ⌘K et vue tags vivantes sur données réelles.
      Points livrés notables : contrat MCP réel réparé (tableaux nus, `_id`,
      cover, `PUT /raindrops/-99` + mémoire des origines), restauration
      hybride §4.2 complète (origines du bulk + destination demandée),
      Revue à deux niveaux virtualisée, signalétique DESIGN.md jointe à la
      liste et au détail.
- [x] **Plan 3/3 — shell Tauri** — fait le 2026-09-17, 13 tasks
      (`docs/superpowers/plans/2026-09-17-phase1-3-tauri.md`) : squelette,
      jeton local éphémère, résolution de Node, lockfile, trousseau,
      cycle de vie du sidecar, commandes du webview, amorçage front,
      premier lancement, écrans de diagnostic/panne, bannière à froid,
      empaquetage. Hors plan mais livré : le **compilateur**
      (`scripts/build_app.py` + `release.py`, inspiré de StarHubTH) et le
      **runtime Node géré** (Task 13, décision utilisateur — voir son
      entrée). Détails de vérification dans
      `.superpowers/sdd/2026-09-17-phase1-3-tauri/progress.md` (registre
      d'exécution, non commité). Le **sélecteur du dossier de
      sauvegarde** reste hors plan : spec sauvegarde non validée. Les
      finitions parkées (revue finale) : « Réessayer » désactivé pendant
      une installation ; extraire runtime.rs et node.rs à la première
      retouche de chacun (400/400 — `commandes.rs` l'a été avec les
      Réglages) ; aligner DELAI_SEQUENCE si les délais de boot venaient
      à croître.
- [x] **Réglages (spec §6)** — fait le 2026-09-18 : overlay ⌘, +
      engrenage, état du pont traduit en français (un état inconnu
      tombe sur « — » plutôt que d'afficher son identifiant interne),
      remplacement du jeton avec contrôle `/api/user`, déconnexion
      (`trousseau::effacer` obtient enfin son appelant — le
      `#[allow(dead_code)]` devient du code vivant). `commandes.rs`
      extrait en `demarrage.rs` au passage (331 → 125 + 216), comme le
      voulait la règle « extraire à la première retouche ».
      **Préférences d'affichage volontairement absentes** : le thème vit
      dans l'en-tête, le dupliquer contredirait DESIGN.md §9.
- [ ] **Dette cliquet** : `sidecar/api/routes/raindrops.test.ts` porte
      **430 lignes** — au-dessus du plafond dur de 400, préexistant au
      plan 3 et exclu du cliquet avec les tests (choix documenté dans
      `scripts/build_app.py`). À découper selon ses frontières naturelles
      à la première retouche.
      **Vérifié avant d'écrire** : `tauri build` produit `.app` **et**
      `.dmg` avec les seuls Command Line Tools (1 min 31 s), signature
      ad-hoc ; et `node` est **absent** du PATH minimal d'une app lancée du
      Finder (`/usr/gnu/bin:/usr/local/bin:/bin:/usr/bin:.` contre
      `/opt/homebrew/bin/node`) — d'où une task de résolution explicite.
      **Task 1 exécutée** le 2026-09-17 : squelette du shell (`src-tauri/`),
      `cargo test` vert. **Icône provisoire** : aucune source carrée
      ≥ 1024 px trouvée dans `design/` — `src-tauri/icons/` porte un carré
      uni `#2F6FEB` généré, à remplacer par l'icône définitive (relève de
      `docs/DESIGN.md`, hors périmètre de ce plan). Icônes iOS/Android/
      Windows Store générées par `tauri icon` puis supprimées (app
      macOS uniquement, périmètre Phase 1).

## Lot sauvegarde et couche de données locale

- [x] **Spec écrite** : `docs/superpowers/specs/2026-09-16-sauvegarde-donnees-locales-design.md`
      (`454a5fc` → `cc78e45`, 8 défauts corrigés après relecture critique).
      Amende le §11 de la spec principale : la réplication locale n'est plus
      exclue, l'invariant devient « source de vérité **en écriture** ».
- [x] **Relecture critique de la spec** (2026-09-18) : 8 corrections
      contraignantes ajoutées en **§1bis**, qui priment sur le reste de la spec.
- [x] **Plan écrit** : `docs/superpowers/plans/2026-09-18-sauvegarde.md`
      (8 tasks).
- [x] **Les 8 tasks livrées** (2026-09-18, `4557736` → ronde de clôture) :
      file à deux rangs avec plancher, canal de lecture REST direct,
      instantané JSONL relu après écriture, balayage complet avec
      réconciliation par identifiants, rafraîchissement incrémental à
      watermark, manifeste atomique avec rotation, archives (303 suivi à la
      main, orphelins, budget), orchestration + route + job SSE.
      Chaque task relue indépendamment ; suite passée de 509 à 578 tests.
      **Deux corrections du plan lui-même** en cours d'exécution : la
      réconciliation par cardinalité était aveugle au défaut qu'elle
      prétendait attraper (Ruling R4), et la comparaison de compteurs du
      §5.3 est meilleure **après** la fusion qu'avant (Ruling R8b).

### Première exécution réelle — 2026-09-18

Le lot n'avait jamais vu autre chose que le faux MCP. Balayage complet lancé
avec `BACKUP_DIR` sur un dossier jetable : **12 210 / 12 210 en 2 min 19**,
`complet: true`, aucun 429, l'instantané fait 12 Mo et ses 12 210 lignes JSONL
sont toutes parsables, pour 12 210 `_id` distincts et **zéro** item sans `_id`
numérique. `collections.json` porte bien **214 collections — 13 racines et 201
enfants**, donc l'appel `/collections/childrens` est fait. Corbeille vide côté
compte (`count: 0`), `trash.jsonl` à 0 ligne : juste, et non un trou. Le
déclenchement au démarrage (§4.4) part tout seul au premier lancement et se
tait au second, manifeste à l'appui.

**Un défaut trouvé par cette exécution, corrigé dans la foulée** : les archives
`<id>.html.gz` contenaient du **HTML en clair**. `fetch` déplie
`Content-Encoding: gzip` tout seul ; le faux serveur, lui, servait des octets
gzippés **sans cet en-tête**, donc le test voyait la magie `1f 8b` et passait
au vert sur un comportement que la production n'a jamais eu. Faux serveur rendu
fidèle, recompression quand la signature manque, test sabordé pour le prouver.

- [ ] **Recalibrer le budget d'archives (§5.4)** — la spec raisonne à
      « 2,1 Mo pièce » pour 5 Go, et le §1 estimait 18,7 Go pour la
      bibliothèque entière. **Distribution réelle mesurée le 2026-09-18** sur
      les 8 875 copies permanentes de l'instantané (les `cache.size` y sont,
      gratuits) : médiane **1,17 Mo**, moyenne **3,18 Mo**, p90 **7,52 Mo**,
      p99 **31,46 Mo**, **max 160,67 Mo** — soit **27,6 Go** si tout était
      archivé, et **~1 600 archives** seulement dans les 5 Go du budget (18 %
      de la bibliothèque). Trois conséquences, aucune théorique :
      (1) l'éviction par ancienneté est appelée **depuis le balayage complet**
      (`enregistrement.ts:53-54`), donc elle se déclenchera **en silence**,
      pendant une sauvegarde que l'utilisateur n'a pas demandée — la §5.4
      l'assume (« une archive évincée se recrée à la demande »), mais pas à
      cette fréquence-là ;
      (2) `POST /api/backup/archive` accepte **500** identifiants, soit ~1,6 Go
      en une passe à la moyenne — un tiers du budget d'un seul geste ;
      (3) `archives.ts` lit le corps par `arrayBuffer()`, donc une copie de
      160 Mo passe **entière en mémoire**, puis y est recomprimée. Un seuil
      par fichier, ou une écriture en flux, est à trancher avec le budget.

### Reste à faire sur le lot sauvegarde

- [ ] **Reprise après coupure** — la spec la promet en §4.2, §5.1, §6 et §7 ;
      le code ne la tient pas et ne la tente pas. `ouvrirJsonl` **tronque**
      (verrouillé par un test) et `ErreurHttpRaindrop.status` — le code HTTP
      structuré, ajouté précisément pour cela — n'est lu par personne. Un 429
      ou un timeout à la page 40 sur 245 avorte le job entier. La spec a été
      amendée pour dire que la reprise est **différée** ; l'implémenter
      suppose une pause bornée sur le 429 et un retry réseau **sur les
      lectures seulement, jamais les écritures** (trap CLAUDE.md).
- [x] **`archiver()` câblé** (2026-09-18, `0ceb810` → `e553038`) : le trou de
      périmètre §2 est fermé. `sidecar/backup/archivage.ts` boucle sur les
      identifiants — un échec n'interrompt jamais les suivants, y compris si
      `archiver()` **lève** (garde propre, pour ne pas dépendre du `try/catch`
      d'`archives.ts`) — avec annulation, progression et garde de réentrance.
      Route `POST /api/backup/archive`, bornée à **500** identifiants (au-delà
      c'est un balayage déguisé : ~1 000 requêtes, plus de 9 min). Reste au
      plan 2 : **appeler** cette route depuis le front (sur une collection, ou
      sur les liens classés morts — §5.4). Noter pour le front que `faits`
      compte les **tentés**, succès et échecs confondus.
- [x] **Le test instable est IDENTIFIÉ** (2026-09-18) — ce n'est pas un test,
      c'en est quatre, et ce n'est pas de l'instabilité mais de la **sensibilité
      à la charge**. Capturés en redirigeant la sortie, comme la note
      précédente le demandait : `linkchecker.test.ts` (« 200 → ok », « 301 →
      redirect permanent ») et `lifecycle.test.ts` (« redémarre après un crash »,
      « restart() répare un état crashed »). Les quatre échouent quand la suite
      tourne **en même temps** qu'un `cargo test` — la suite passe alors de 20 s
      à 191 s, et les délais de 15-20 s de `lifecycle` expirent. Seule, la suite
      rend **663 tests / 2 ignorés / 0 échec**.
      **Affiné le soir même** : une seconde occurrence a fait tomber DEUX
      AUTRES tests (`CleanupDashboard`, `CollectionView`), cette fois sous un
      scan antivirus à 51 % de CPU — le montage d'environnement passe de 25 s
      à 614 s. Ce n'est donc pas un jeu fixe de tests fragiles, mais
      **n'importe quel test à délai** quand la machine sature : avant de
      soupçonner le code, regarder `ps aux | sort -k3 -rn | head`. Rien à corriger dans le code
      testé ; à garder en tête : **ne pas lancer `npm test` et `cargo test`
      concurremment**, ou desserrer les délais de ces quatre tests si le besoin
      s'en fait sentir en CI.
- [x] **Dossiers orphelins : fuite ET historique invisible — les deux réglés
      par la même réconciliation** (2026-09-19, `sidecar/backup/reconciliation.ts`).
      C'était un seul problème vu par deux bouts : la rotation n'itère que sur
      les horodatages du manifeste, donc un dossier qu'il ne cite pas lui est
      invisible — qu'il vienne d'un balayage mort en route (~11 Mo perdus,
      hors de tout budget) ou d'un manifeste corrompu (inventaire vide, puis
      réécrit sans les entrées antérieures).
      **`meta.json` tranche entre les deux** : il s'écrit EN DERNIER, et son
      rôle était déjà écrit dans `enregistrement.ts` — « le manifeste peut
      être perdu, le dossier lu seul, l'instantané reste capable de dire s'il
      ment ». Présent → l'instantané est **ré-adopté** ; absent ou illisible →
      le dossier est **ramassé**, et on le dit (effacer des mégaoctets en
      silence vaudrait la fuite).
      L'entrée adoptée est **sans empreinte**, volontairement : on ne peut
      rien garantir d'un dossier oublié, et recalculer les empreintes depuis
      les fichiers ne prouverait rien (elles coïncideraient par construction).
      `raisonDeBasculer` repart donc en balayage complet plutôt que de bâtir
      dessus. Appelé à l'enregistrement, avant la rotation — pas au démarrage
      comme la piste le suggérait : c'est là que le manifeste est réécrit et
      que la rotation suit.
- [x] **Un item sans `_id` numérique — perte silencieuse corrigée** (2026-09-19).
      Le défaut était **plus large que décrit ici** : `incremental.ts` avançait
      le watermark puis jetait l'item (donc jamais relu — perte définitive),
      mais `fusionner` (`collecte.ts`) le jetait **aussi**, si bien que
      corriger l'incrémental seul n'aurait rien changé. Les deux conservent
      désormais l'objet (§3.4, « on ne jette jamais une donnée brute ») :
      faute de clé il ne remplace rien, il s'ajoute — dédoublonné par son
      CONTENU, puisque c'est sa seule identité disponible. Un contenu qui a
      changé s'ajoute **en plus**, jamais à la place : sans identifiant, rien
      ne prouve que les deux objets sont le même. `collecte.ts` gagne au
      passage le fichier de test qui lui manquait. Trois sabordages.
      Reste : `balayage.ts` écrit toujours ces lignes en les excluant du
      décompte — l'instantané se marque alors incomplet **pour toujours**.
      Bruyant, donc pas une perte ; à trancher séparément (soit les compter,
      soit dire pourquoi l'instantané reste incomplet).
- [x] **Sémantique de progression — tranchée** (2026-09-18, lot sélection du
      dossier) : un **compteur nommé** plutôt qu'une barre. Corbeille et
      auxiliaires émettent enfin un label, et un numérateur qui recule au rejeu
      s'écrit « reprise du balayage » au lieu de se traduire en recul
      inexplicable.
- [ ] **Petites dettes du lot** : factoriser `interface File` (déclarée trois
      fois) et la constante `50` (encodée cinq fois) ; le mot `complet`
      désigne deux choses (le mode et la fidélité), avec un troisième nom
      (`Piece.fidele`) pour la seconde ; la page de recouvrement de
      l'incrémental n'a aucun test ; pas de test sur les chemins d'erreur
      d'`archiver`.
- [x] **Sélecteur du dossier de sauvegarde + panneau + archivage** — fait le
      2026-09-18, 15 tasks
      (`docs/superpowers/plans/2026-09-18-selection-dossier.md`, spec
      `2026-09-18-selection-dossier-design.md`). **Le lot sauvegarde est
      joignable depuis l'application.** Livré : `reglages.json` + dialogue
      natif (`tauri-plugin-dialog`, premier `capabilities/default.json` du
      dépôt) et `BACKUP_DIR` passé au spawn ; panneau `SectionSauvegarde`
      dans les Réglages (chemin final, dernière sauvegarde, instantanés,
      archives, compteur nommé, annulation) ; inventaire
      `GET /api/backup/archives` + marqueur « Archivé » à trois états ;
      archivage sur sélection via la Revue, depuis la liste et depuis les
      liens morts. **663 tests / 2 ignorés** (589 avant), typechecks et
      `cargo test` verts.
      **Trois items ROADMAP tranchés au passage** : la sémantique de
      progression (compteur nommé plutôt qu'une barre qui gèle ou recule —
      corbeille et auxiliaires émettent enfin un label), la première
      sauvegarde explicite (§4.4 amendé), et le test instable identifié.
      **Vérifié en réel** : dossier neuf → aucune sauvegarde au démarrage
      (c'était tout l'objet du §0.2) ; job lancé, listé par `/api/jobs` avec
      son compteur (« 350 / 12 210 signets »), annulé ; labels de progression
      observés jusqu'à « profil ».
      **Trois écarts assumés, amendés dans la spec** : pas de paquet npm pour
      le dialogue (il vit côté Rust) ; le paramètre d'actions de `BulkBar` est
      abandonné (la vue Liens morts suit son propre motif « action d'entête →
      Revue ») ; et l'avertissement de première sauvegarde est **calculé** sur
      la bibliothèque réelle, jamais écrit en dur — correction de
      l'utilisateur en cours de lot.
      **Reste au fil de l'eau** : le marqueur d'archive n'est pas posé sur la
      mosaïque (`MosaicTile`), seulement sur la liste et le détail.
- [ ] **Hors ligne** (consultation + file d'opérations simples) : après le
      plan 2, sur le socle posé par le lot sauvegarde. Inclut : écritures
      refusées proprement hors ligne (aujourd'hui les échecs remontent en
      `fetch failed` brut — jeton `broken` mal employé pour l'interruption
      MCP, voir polissage) ; écoute `change` de matchMedia pour le thème
      `system` à chaud.

## Polissage du plan 2 (issu du triage de la revue finale, 2026-09-17)

Six familles, ~45 items condensés — aucun ne bloque le merge. S'y
ajoutent deux designs validés par l'utilisateur après comparaison avec
app.raindrop.io (captures dans `.playwright-mcp/raindrop-ref-*.png`).

- [x] **Vue collection parente** — fait le 2026-09-17 en trois lots :
      (1) tri **alphanumérique naturel** à la source (`lib/ordre.ts`,
      consommé par `useCollections` — un seul endroit range l'arbre pour
      la sidebar, la palette ⌘K et les destinations de déplacement) ;
      (2) **pliage de la sidebar** (`GroupeCollection.tsx`) : dépliage au
      survol, repli différé de 250 ms, chevron `aria-expanded` comme
      équivalent clavier du survol, parent de la vue courante maintenu
      ouvert, et **500 ms pendant un déplacement** — ce que le design du
      drag & drop demandait et qui était sans objet faute de pliage ;
      (3) **vue composite** (`kind: "collection"`, `CollectionView.tsx` +
      `SectionCollection.tsx`) : signets directs puis une section par
      sous-collection, intertitre 28 px collant sur surface `work`,
      contrôles globaux uniques.
      **Écart assumé, arbitré avec l'utilisateur** : chaque section ne
      charge que sa première page et propose « Voir les N » — « tout
      déplié » au sens plein tenait des milliers de lignes hors
      virtualiseur. Mesuré en réel sur MIGRATION (10 enfants) : 401
      lignes, peinture complète en **~10 s** — onze requêtes que la file
      550 ms sérialise. C'est le plancher de cette vue tant que la file
      reste séquentielle ; si l'attente gêne à l'usage, la piste est de
      ne charger une section qu'à son entrée dans le champ de vision.
      Reste non fait : les sous-collections de niveau 2+ (la sidebar
      comme la vue ne connaissent qu'un niveau d'enfants).
- [x] **Navigation clavier fluide** — fait le 2026-09-17. Deux hooks,
      selon que la zone est virtualisée ou non :
      `hooks/useRovingFocus.ts` suit l'ordre du DOM (barre latérale, vue
      collection, mosaïque en GRILLE — ↑↓ sautent une rangée, ←→ une
      case, colonnes comptées sur la mise en page réelle car `auto-fill`
      en pose autant que la largeur le permet) ;
      `hooks/useIndexClavier.ts` suit un INDEX (liste principale, Revue)
      parce que la ligne active se démonte en défilant — on déplace
      l'index, on défile, on ne focalise qu'après.
      Une zone = UN arrêt de tabulation : **compté au navigateur, 9 en
      tout contre 134**. ↑↓, Début/Fin, →/← sur l'arbre, Entrée, Échap,
      espace qui coche et fait avancer d'une ligne, ligne active liée au
      survol (sans voler le focus ni défiler). `:focus-visible` seul, et
      l'anneau est passé en `quiet` après mesure — `sel` tenait 1,10:1
      contre un seuil de 3:1 (DESIGN.md §9).
      **Les vues de traitement, d'abord à dessein, sont faites depuis**
      (2026-09-17) : motif « ligne activée » — la LIGNE est l'arrêt
      (`role="row"`, roving de la vue), Enter/F2 y entrent et tabulent ses
      contrôles (`ActionLigne`), Échap rend la ligne, quitter la ligne les
      referme. Vérifié au navigateur sur « Collections vides » : 13 lignes,
      1 arrêt, 13 contrôles hors Tab au repos.
- [x] **Drag & drop d'un signet vers les collections** — fait le
      2026-09-17 (`state/drag.tsx`, `hooks/useDragBookmark.ts`,
      `components/FantomeDrag.tsx`). Pointer events et non le drag & drop
      HTML5, qui n'est pas pilotable sous jsdom : chaque règle du geste
      garde un contrat testé. Seuil 5 px, fantôme sous le curseur
      (« N signets » pour un lot), sélection liée, cible allumée en
      `bg-app-sel`, dépôt refusé sur la corbeille, « Tous » et les
      marqueurs d'état, clic de fin neutralisé, échec inline (R8P-1).
      Vérifié en réel : aller-retour d'un signet entre NAS et
      « 10 - SERVEURS », compteurs de la sidebar suivis, données rendues
      à l'identique.
      **Reste de ce design, non fait** : l'auto-scroll des bords pendant
      le glissement (pur comportement navigateur, sans test possible en
      jsdom) et le flash du jeton `moved` sur la ligne déplacée — qui
      suppose de devenir le premier appelant de `RaindropRow.etat`, encore
      sans appelant. Le **dépliage automatique d'un parent au survol
      prolongé est sans objet** tant que la sidebar n'a pas de pliage :
      elle affiche aujourd'hui tout l'arbre déplié. Il viendra avec la
      vue collection parente ci-dessus, pas avant.
- [x] **Épure (principe §9 de DESIGN.md, amendé le 2026-09-17 — « l'écran
      ne surcharge jamais »)** — fait le 2026-09-17 : compteurs masqués à 0
      (sidebar, section Surlignages) ; puces de nature absentes retirées
      (§11 réécrit, la puce active survit à zéro) ; favori en étoile seule
      et « Ouvrir » supprimé (la ligne d'URL était déjà le lien) ; verbes
      dédoublés du BulkBar et de CleanupRows ; tri en bouton-état
      (`.etat`, `<select>` natif conservé pour le clavier) ; bascule
      liste/mosaïque en une icône nommée par sa destination ; domaine et
      dates repliés dans `PanneauFiltres`. Icônes d'interface dans
      `src/design/icones.tsx`. Chaque icône seule porte son `aria-label`.
      Exception écrite en §9 : le tableau de bord du Nettoyage garde ses
      six compteurs à zéro.
      **Poussée plus loin le 2026-09-19** (« le texte est l'exception ») :
      pagination en chevrons, éditer/enregistrer/annuler du détail en
      crayon/coche/croix, renommer une étiquette en crayon, effacer les
      filtres et fermer les Réglages en croix, exporter en flèche, choisir le
      dossier de sauvegarde en dossier, annuler un job en croix. Chaque
      `aria-label` reprend EXACTEMENT le texte qu'il remplace : les 249 tests
      de composants passent sans retouche, et le nom accessible est conservé.
      **Gardent leurs mots**, par la règle §9 (« sauf les verbes qui
      détruisent ou exécutent ») : Corbeille, Mettre à la corbeille,
      Supprimer, Exécuter, Sauvegarder maintenant, Lancer/Relancer un scan,
      Valider, Ouvrir la bibliothèque, Déconnecter, Réessayer. Et ce qui
      porte un COMPTE (« Voir les N », « Archiver la copie (N) ») reste du
      texte : un nombre ne se dessine pas.
- [ ] **Passe design** : « Tout désélectionner » testé ; étiquettes
      évanouies par `shrink` (plancher min-w) ; `leading-tight` tuile ;
      `.wash` vs `.coll-icon` à fusionner ; `filetEtat` demi-paire ;
      `racine()` à déplacer ; moyenne d'icônes §8 ; sélection persistante
      collections/tags ; media select retiré (7b) — rester cohérent.
- [ ] **Lot a11y** : la **navigation clavier** ci-dessus (par zone) ;
      aria-label recherche ; chaîne ARIA palette
      (`aria-controls`/`aria-activedescendant`, ownership listbox→option) ;
      input de renommage de tag sans nom accessible ; désarmement au clic
      extérieur du confirm inline ; double `role="alert"` imbriqué
      (Banners) ; désélection d'arbre RTL.
- [x] **États d'erreur de chargement** — fait le 2026-09-17
      (`components/EtatListe.tsx`, partagé par ListPane, TagsView et les six
      vues de CleanupView) : l'échec prime sur le vide, puisque c'est lui
      qui l'explique, et un bouton « Réessayer » relance la requête — sans
      quoi il ne restait qu'à recharger la page. Vérifié en coupant le
      sidecar en marche : « Erreur : http 500 » au lieu de « Rien ici ».
- [x] **La bannière de crash ne couvrait pas le sidecar mort** — fait le
      2026-09-17 : `isError` de `useHealth` est désormais un diagnostic
      propre (« Sidecar local injoignable », bouton Réessayer), distinct du
      crash MCP (sidecar vivant, pont cassé, bouton Redémarrer).
- [x] **Lot Composer/Tags** — fait le 2026-09-17, les cinq points : garde
      `^https?://` rendue insensible à la casse (une URL collée en
      « HTTPS:// » n'était simplement jamais analysée) ; `soumettre` et le
      renommage gardés par `isPending` — deux Entrée rapides créaient deux
      bookmarks, ou lançaient deux renommages dont le second portait sur un
      nom disparu ; renommage vers le nom identique traité en no-op ; et le
      garde anti-course `seq`, qui n'avait aucun test, en a un qui retient
      une réponse lente jusqu'après le changement d'URL.
- [x] **Hygiène tests** — fait le 2026-09-17 : les neuf hooks de
      `useMutations` ont leur test unitaire (route, corps, conversions DTO,
      et surtout les invalidations — une invalidation manquante ne lève
      rien, elle laisse l'écran mentir après une écriture réussie, dont
      celle de T8-5) ; `notag` éprouvé à `true` comme à `false` ; « Tout
      désélectionner » testé, portée ET désarmement de l'exécution ; les
      stubs `URL` de ReviewPage.test sont rendus ; la factory `item()` de
      duplicates.test rend un vrai `RaindropItem`.
      **Les répertoires temporaires fuyaient depuis HUIT fichiers**, pas un
      (le triage n'en voyait qu'un) : `sidecar/testing/tmp.ts` les rend
      désormais, et la fuite est mesurée à zéro sur la suite entière —
      plusieurs milliers s'étaient accumulés dans le dossier temporaire du
      système. Purge manuelle des anciens, si besoin :
      `ls -d /var/folders/*/*/T/{lock,logs,cache,origins,scan,lifecycle}-*`
      puis `rm -rf`.
      `broken: true` était en fait DÉJÀ couvert (mappers.test.ts) — le
      triage se trompait sur ce point.
- [x] **Sidecar défensif** — fait le 2026-09-17 :
      `?? id!` silencieux → `ShapeError` (une collection sans `_id` ni
      `id` rendait 200 avec `id: undefined`, elle rend 502) ; **purge**
      des origines après un empty-trash RÉUSSI (toute origine pointe alors
      vers un id disparu) ; échec d'écriture du store **loggé** (injecté
      en option, avalé pour l'appelant — contrat §11 inchangé) ; `?from=`
      vide ne mémorise plus 0 ; SSE tient le CRLF et les lignes `data:`
      multi-lignes (le parseur se taisait ou tronquait).
      `asMcpArray` : sans objet — le 3e tool de tableau était
      `get_highlights`, dont la route est morte (R8cP-1). `fakeServer.ts`
      (353 lignes) : **signalé, pas coupé** — sous le plafond dur de 400,
      le split exigerait de filer `fx`+`guard` à des modules de tools dans
      le harnais de dix fichiers de test, pour un gain cosmétique.
      Compteur doublons = payload complet : à surveiller, inchangé.
- [x] **Divers** — fait le 2026-09-17 : `t()` durci en `FrKey` (le repli
      « rend la clé » masquait les fautes — une chaîne absente s'affichait
      brute au lieu d'être refusée au typecheck) ; le seul usage dynamique
      (`nature.*`) est typé par un littéral `satisfies Record<NatureType,
      FrKey>`, qui prouve au typecheck que les six clés existent ;
      `ListPatch` rétréci (`kind`/`collectionId`/`label` exclus — patcher
      n'est pas naviguer) ; `ChargePlus` extrait
      (`components/ChargePlus.tsx`), consommé par ListPane et CleanupView
      ; `initTheme` retirée (morte en prod, le hook fait le boot), le test
      du thème réécrit via `useTheme` ; commentaire périmé de
      CommandPalette réécrit (R11P-2 a introduit `selectRaindrop`).
      Le bloc Global Constraints du plan documente encore la route
      highlights supprimée — doc seule, laissé tel quel.

## Points ouverts (non liés au plan 2)

- [ ] **Lexique thématique à élargir** (`docs/DESIGN.md` §3) à partir des
      étiquettes réelles : ce qu'il ne reconnaît pas s'affiche en gris.
      **Échelle mesurée le 2026-09-16 sur l'app réelle : 96 étiquettes
      grises sur 113 affichées — 85 %.** Les 50 premières par `count`
      décroissant couvriraient l'essentiel.
- [ ] **Signalétique d'état jamais jointe à la liste principale** :
      `RaindropRow.etat` / `MosaicTile.etat` sont du plomberie morte (aucun
      appelant) — les filets ne vivent que dans les vues de traitement.
      Se joindra aux Tasks 12-13 des données d'analyse côté front (ou au
      polissage ci-dessus).
- [ ] **Divergence des deux étoiles** : résolue dans la fix wave (`Etoile`
      partagé) — reste à vérifier visuellement la grille 13 px héritée.

## Veille

`python3 tools/check_sources.py` — 7 sources, aucune n'a bougé au 2026-09-16.
Le pont MCP épinglé reste **archivé en amont** ; son candidat de reprise
(`adeze/raindrop-mcp`) est évalué en spec §10.1, sans migration décidée.

## Phase 2 (aperçu — spec §12, hors périmètre présent)

Agent IA avec plan validé via la Revue de l'action, moteur de règles,
exclusions d'audit, spike Stella, packaging du sidecar en binaire autonome,
E2E (Playwright), écriture des highlights, OAuth2 à la place du token collé,
formats d'export élargis. Spec séparée à venir.
