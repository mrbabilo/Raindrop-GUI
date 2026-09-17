# ROADMAP — Raindrop-GUI

⚠️ Les cases traînent derrière le code livré : vérifier `git log` avant de
traiter une tâche « à faire ».

*Dernier recalage : 2026-09-17 (fin du plan 2, après fix wave de la revue
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
- [ ] **Plan 3/3 — shell Tauri** (fenêtre, spawn sidecar, trousseau macOS,
      écran premier lancement) : à écrire. Porte aussi le **sélecteur du
      dossier de sauvegarde** (spec sauvegarde §4.3). Points de branchement
      déjà propres : `connection.ts` consomme `window.RAINDROP_GUI`, build
      80 KB gzip. **Notes plan 3** : ne monter `<Banners />` qu'après un
      premier health `connected` (sinon bannière « interrompue » au
      démarrage à froid) ; preview Vite sans proxy (T1).

## Lot sauvegarde et couche de données locale

- [x] **Spec écrite** : `docs/superpowers/specs/2026-09-16-sauvegarde-donnees-locales-design.md`
      (`454a5fc` → `cc78e45`, 8 défauts corrigés après relecture critique).
      Amende le §11 de la spec principale : la réplication locale n'est plus
      exclue, l'invariant devient « source de vérité **en écriture** ».
- [ ] **En attente de relecture utilisateur** → ensuite `writing-plans`.
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
      **Reste, à dessein** : les vues de traitement gardent un arrêt par
      ligne — leurs lignes portent plusieurs actions (Restaurer, choisir
      une destination), et les sortir du parcours sans autre accès serait
      une régression, pas un progrès. Le motif « grille ARIA » (→ entre
      dans les contrôles d'une ligne) est la voie, le jour où ça gêne.
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
      Reste à reprendre au fil de l'eau : les futures actions de ligne
      seront des icônes seules.
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
- [ ] **La bannière de crash ne couvre pas le sidecar mort** (constaté en
      coupant le sidecar, 2026-09-17) : `Banners` lit `useHealth`, qui
      échoue elle aussi — `data` est alors `undefined` et la bannière se
      tait. Elle ne sait dire que « sidecar vivant, MCP en rade ». Les vues
      affichent bien leur erreur, mais rien n'explique en tête que c'est
      toute la connexion locale qui est tombée.
- [x] **Lot Composer/Tags** — fait le 2026-09-17, les cinq points : garde
      `^https?://` rendue insensible à la casse (une URL collée en
      « HTTPS:// » n'était simplement jamais analysée) ; `soumettre` et le
      renommage gardés par `isPending` — deux Entrée rapides créaient deux
      bookmarks, ou lançaient deux renommages dont le second portait sur un
      nom disparu ; renommage vers le nom identique traité en no-op ; et le
      garde anti-course `seq`, qui n'avait aucun test, en a un qui retient
      une réponse lente jusqu'après le changement d'URL.
- [ ] **Hygiène tests** : useMutations sans tests unitaires (7 hooks/9) ;
      invalidation T8-5 non assertée ; untagged sans test ; « Tout
      désélectionner » non testé ; stubs URL ReviewPage.test sans
      nettoyage ; `broken: true` jamais testé ; factory `item()`
      duplicates.test non conforme au type ; mkdtemp sans nettoyage.
- [ ] **Sidecar défensif** : `?? id!` silencieux de `collections.ts:24` →
      `ShapeError` (en tête de file — famille « forme supposée ») ;
      `purge()` des origines sur empty-trash (croissance bornée mais
      inutile) ; échec d'écriture du store sans log ; `asMcpArray` si un
      3e tool en a besoin ; `?from=` vide coerce en 0 ; robustesse SSE
      (CRLF, data multi-lignes — localhost only) ; split `fakeServer.ts`
      (353 lignes) ; compteur doublons = payload complet (à surveiller à
      l'échelle).
- [ ] **Divers** : `t(key: string)` à durcir en `FrKey` ; `ListPatch` trop
      large ; `ChargePlus` dupliqué ListPane/CleanupView ; `initTheme`/
      `setTheme` morts en prod ; commentaire périmé CommandPalette.tsx:8-9 ;
      bloc Global Constraints du plan documente encore la route highlights
      supprimée (doc seule).

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
