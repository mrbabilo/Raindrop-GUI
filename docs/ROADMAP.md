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
- [x] **Dette cliquet** — `sidecar/api/routes/raindrops.test.ts` portait
      **430 lignes**, au-dessus du plafond dur de 400, exclu du cliquet avec
      les tests (choix documenté dans `scripts/build_app.py`). **Découpé le
      2026-09-19**, à sa frontière naturelle : `raindrops.lecture.test.ts`
      (141, les GET et les filtres, sans aucun échafaudage d'écriture) et
      `raindrops.test.ts` (364, les écritures). Fait au moment où le lot
      « filtre multi-étiquettes » devait y ajouter des tests — « à la
      première retouche », comme prévu.
      **Découvert au passage, non traité** : sous un tsconfig incluant les
      tests, le sidecar porte **27 erreurs de typage préexistantes dans
      6 fichiers** (comptées le 2026-09-19) (`SidecarDeps` importé d'`app.js` qui ne l'exporte pas,
      `hono.request` rendant `Response | Promise<Response>`, fixtures
      incomplètes). Vitest transpile sans vérifier : rien ne les voit. Le
      nouveau fichier, lui, est type-clean.
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

- [x] **Budget d'archives : les trois conséquences traitées** (2026-09-19) —
      la spec raisonnait à « 2,1 Mo pièce » pour 5 Go ; la **distribution
      réelle** mesurée le 2026-09-18 sur les 8 875 copies permanentes donne
      médiane **1,17 Mo**, moyenne **3,18 Mo**, p90 **7,52**, p99 **31,46**,
      **max 160,67** — soit **27,6 Go** pour tout archiver et **~1 600
      archives** dans les 5 Go (18 % de la bibliothèque). Le budget n'a pas
      bougé (c'est un budget, pas une prédiction) ; ce qui a changé :
      (1) **l'éviction ne se fait plus en silence** — `purgerOrphelins` et
      `appliquerBudget` rendent leurs comptes, `ResultatSauvegarde.menage` les
      porte jusqu'à l'écran (hors du manifeste, comme `bascule`), et le champ
      est **absent** quand rien n'a été retiré, jamais deux zéros ;
      (2) **l'archivage s'arrête au budget** au lieu d'écrire 1,6 Go que
      l'éviction rongerait aussitôt — les identifiants restants sont comptés
      dans `nonTentes` avec un `raisonArret`, **hors des `echecs`** : ils n'ont
      pas raté, ils n'ont pas été essayés ;
      (3) **plus de copie entière en mémoire** — écriture en flux par fichier
      `.partiel` puis renommage (commit précédent).
      Nettoyage au passage : la marche du dossier d'archives, recopiée trois
      fois, vit désormais dans `lireArchives()`.
      **Piège vérifié** : réarchiver REMPLACE, donc le total courant retire
      l'ancienne taille avant d'ajouter la neuve — sans quoi reprendre des
      signets déjà archivés ferait croire le budget plein sur un total
      imaginaire.

- [x] **Nettoyage : sept défauts corrigés** (2026-09-19) — tous mesurés sur la
      bibliothèque réelle, aucun supposé. Le plus grave : les résultats
      d'analyse étaient rangés **par URL** et non par signet, cachant jusqu'à
      242 signets morts (430 signets partagent une adresse au caractère près).
      Les six autres : trois compteurs affichant « 0 » sans qu'aucune analyse
      n'ait tourné ; un scan quitté devenu insuivable **et inannulable** alors
      que `GET /api/jobs` porte tout ; la catégorie « Indéterminé » de
      DOMAINE.md sans compteur ni vue ; un compteur de doublons qui comptait
      des groupes (414 groupes, 1 032 signets, 618 copies retirables) ; la même
      URL vérifiée une fois par signet (11 968 distinctes pour 12 210) ; et la
      reprise après coupure, qui fonctionnait sans se voir.
      **Non vérifié en réel** : un scan complet des 12 210 liens frapperait des
      milliers de serveurs tiers. Le chemin est éprouvé par les tests, dont
      trois sur la reprise (interruption, relance, TTL expiré), et le
      dédoublonnage est confirmé par le sidecar réel (`total: 11968`).

### Reste à faire sur le lot sauvegarde

- [x] **Reprise EN VOL** (2026-09-19, `sidecar/backup/resilience.ts`) — un 429
      ou un timeout à la page 40 sur 245 n'avorte plus le job.
      `ErreurHttpRaindrop.status`, ajouté pour cela et lu par personne, décide
      enfin : 429 → pause 4/8/16 s ; 5xx et pannes réseau → retry 1/2/4 s ;
      **401/403/404 → aucune reprise** (les rejouer ferait d'une erreur claire
      une panne lente). **Lectures seulement**, par construction : le module
      décore une `Lecture`, dont le canal n'expose que des GET.
      Trois choix qui ne sautent pas aux yeux : la pause vit **hors du créneau
      de file** (attendre dedans figerait le rang interactif, donc l'interface,
      à chaque hoquet) ; c'est un **décorateur appliqué par job** et non une
      option de `makeLecture` (construit au démarrage, il ne peut pas connaître
      l'annulation d'un job qui n'existe pas encore) ; et la pause se dort par
      **tranches de 250 ms**, sans quoi annuler pendant une attente de 16 s
      laisserait l'interface muette aussi longtemps.
      **Trouvé en écrivant le test**, pas en relisant le code : le 429 tombait
      sur le relevé du watermark, **avant** le balayage — donc hors du filet de
      `balayage.ts`. L'annulation est désormais relue aux DEUX niveaux, et qui
      clique « annuler » ne lit jamais « http 429 ».
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
- [x] **Petites dettes du lot — réglées** (2026-09-19). `interface File` était
      déclarée **trois fois** à l'identique : elle vit désormais chez qui
      l'implémente (`mcp/throttle.ts`), et les modules de sauvegarde dépendent
      du contrat, pas de la classe. La pagination `50` était recopiée **cinq
      fois** (dont une dans un test que je venais d'écrire) : elle vit chez le
      canal qui parle à l'API (`lecture.ts`), parce qu'une valeur qui
      divergerait d'un module à l'autre ferait sauter des éléments **sans lever
      la moindre erreur** — la boucle s'arrête sur `items.length < PAR_PAGE`.
      Le mot `complet` : c'est le **MODE** qui a cédé le nom (`"balayage"`), et
      non la fidélité — celle-ci est écrite sur disque, dans `manifest.json`
      comme dans `meta.json`, et la renommer invaliderait les sauvegardes
      existantes. `Piece.fidele` reste : une pièce est fidèle, un instantané
      est complet quand toutes le sont — deux portées, deux mots, ce n'est pas
      la même chose.
      **Les deux trous de COUVERTURE sont comblés** (2026-09-19) : la page de
      recouvrement de l'incrémental a deux tests — le faux serveur HTTP trie
      correctement et ne pouvait pas produire le cas, d'où une `Lecture`
      fabriquée qui sert les pages voulues ; et les trois chemins d'échec
      d'`archiver` en ont quatre, dont celui qui vérifie que le second appel
      ne porte AUCUN en-tête d'authentification (l'URL S3 est déjà signée, et
      la réémettre la fait rejeter — mesuré au §5.4). Trois sabordages.
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
- [x] **Passe design** — soldée le 2026-09-19, point par point, car sur neuf
      mentions **quatre étaient déjà réglées** et une est illisible :
      **faits ce jour** — « Tout désélectionner » (il n'existait AUCUN moyen
      de défaire une sélection autrement qu'un à un ; en fin de barre, après
      les actions, car elle défait sans engager) ; la **garde de la barre**,
      qui portait sur `selectedIds.size` et affichait « 0 sélectionnés » avec
      corbeille et archivage sur un ensemble vide dès qu'une sélection
      débordait la page (R9P-1 : la navigation la garde, voulu) — elle porte
      désormais sur ce qui est réellement actionnable **ici** ; les
      **étiquettes évanouies** (`shrink-0` sur la pilule : le conteneur est
      `shrink` et borné au tiers — sans plancher, les pilules se comprimaient
      toutes ensemble jusqu'au moignon illisible ; rognées, elles restent
      lisibles) ; **`.wash` fusionné à `.coll-icon`** par sélecteur groupé
      (la formule oklch était recopiée deux fois ; zéro appelant touché, et
      la règle groupée placée AVANT `.coll-icon-nav` pour que l'écrasement de
      fond de la navigation survive par ordre du source) ; **`racine()`
      déplacée** vers `lib/arbre.ts` — de la marche d'arbre, pas du dessin —
      avec ses deux tests transférés (ils cohabitent avec le code).
      **Déjà réglés, vérifiés avant d'écrire** — `leading-tight` est en place
      sur la tuile (correctif appliqué, la mention en gardait la trace) ;
      `filetEtat` est une paire complète (quatre états, et la mosaïque
      emploie le même helper) ; la **persistance de la sélection** est le
      choix documenté R9P-1 ; le **media select** est bien parti (7b).
      **Illisible** : « moyenne d'icônes §8 » — §8 (densités) ne parle pas
      d'icônes, et aucune trace retrouvée dans le code ni les tests. Noté ici
      plutôt que coché en silence, comme « désélection d'arbre RTL » avant
      lui.
- [x] **Lot a11y** — soldé le 2026-09-19. ⚠️ **Cinq des sept points étaient
      DÉJÀ faits** et cette case mentait depuis des jours : nom accessible de
      la recherche (`TopBar`), chaîne ARIA de la palette
      (`combobox`/`aria-controls`/`aria-activedescendant`, `listbox`→`option`),
      nom accessible du champ de renommage d'étiquette, désarmement du confirm
      inline au clic extérieur (`pointerdown`, le `blur` seul ne suffisait pas),
      et le `role="alert"` imbriqué de `Banners` (la bannière le porte, pas son
      contenu). Vérifié un par un avant d'écrire quoi que ce soit — la consigne
      de CLAUDE.md, « vérifier `git log` avant de croire une case à faire »,
      vaut aussi pour les cases qu'on a soi-même écrites.
      **Ce qui restait vraiment** : la **vue Tags n'avait aucune navigation par
      zone**. 317 étiquettes réelles à quatre contrôles chacune, soit plus de
      **mille deux cents arrêts de tabulation** pour traverser l'écran — le
      grief même auquel la barre latérale et la liste avaient déjà répondu, et
      la seule zone oubliée. Le patron « ligne activable » (Enter/F2 entre,
      Échap referme) a quitté `CleanupRows` pour `LigneActivable.tsx`, une
      seconde famille de vues l'employant désormais ; il y gagne au passage un
      typage par balise, là où un `Record<string, unknown>` rendait `any`
      chaque paramètre de gestionnaire.
      **Non retrouvé** : « désélection d'arbre RTL », mentionné sans contexte
      au plan 2 (`730a7a7`) et introuvable dans le code comme dans les tests.
      Noté ici plutôt que coché en silence.
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

- [x] **Lexique thématique élargi** (2026-09-19). Mesure de départ, prise sur
      les 317 étiquettes réelles (23 909 occurrences) : **92 % des étiquettes
      distinctes grises, 75 % pondéré par l'usage** — plus sévère que
      l'estimation de 85 % faite en septembre. Après : **24 % et 3 %.**
      Deux leviers, et le second a pesé plus lourd que le premier : le lexique
      passe de 63 à ~250 mots, et surtout **le pluriel cesse de compter**
      (« livres » vaut « livre », « jeux vidéos » vaut « jeu vidéo » — chaque
      mot du groupe est ramené au singulier). Beaucoup de grises n'étaient pas
      des mots manquants : leurs singuliers étaient au lexique depuis le début.
      **Neuvième thématique `éducation`** (teinte 90) : la bibliothèque est
      celle d'un enseignant, et des dizaines d'étiquettes ne trouvaient leur
      sens dans aucune des huit autres. DESIGN.md §3 amendé — le tableau ne
      donne plus qu'un extrait, la liste faisant foi dans le module.
      **Ce qui reste gris le reste à dessein** : marqueurs de tri (`à-trier`,
      `à-lire`, `à-voir`) et noms propres (`babilosapiens`) n'ont pas de
      thématique, et leur en inventer une cacherait ce qu'il faut voir.
- [x] **Signalétique d'état jointe à la liste principale** (2026-09-19) —
      `RaindropRow.etat` et `MosaicTile.etat` étaient de la plomberie morte
      depuis le plan 2 : les filets ne vivaient que dans les vues de
      Nettoyage, donc un lien mort ne se voyait jamais là où l'on passe son
      temps. Les DEUX moitiés sont câblées (liste et mosaïque), plus la vue
      Collection et ses sections.
      Source : `GET /api/analysis/etats`, qui ne transmet QUE les signets
      diagnostiqués — la charge suit les problèmes, pas la taille de la
      bibliothèque, et une réponse par page ne couvrirait pas les lignes que
      le virtualiseur n'a pas montées. Jumeau du marqueur « Archivé »
      (`useArchives`) : une `Map` par identifiant, `staleTime` de 60 s, et une
      clé sous `["analysis", …]` que `useStartScan` invalide déjà.
      **Deux décisions tablées dans DESIGN.md §5** : « mort » l'emporte sur
      « doublon » (un lien cassé ne se répare pas en rangeant), et l'absence
      de marque NE CERTIFIE RIEN — elle recouvre vérifié sain, jamais vérifié
      et périmé. La liste n'est pas un bilan de santé ; le Nettoyage l'est.
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
