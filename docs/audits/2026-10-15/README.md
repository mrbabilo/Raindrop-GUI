# Audit Raindrop-GUI — 15 octobre 2026

> Suivi : les cinq scénarios navigateur A02/A04/A08/A09 ont été corrigés et
> intégrés à la non-régression. Voir [validation UI](../../../e2e/VALIDATION.md).
> A08 (palette modale) et A09 (identité des résultats asynchrones) restent
> partiellement ouverts ; les constats ci-dessous décrivent l’état audité initial.

## Recalage après intégration GitHub

Le travail initial ci-dessous portait sur `6f155db`, en retard de 61 commits.
La branche locale a ensuite intégré `origin/main` à `e78aa8e` et les changements
locaux ont été réconciliés. Ce rapport reste la preuve de l’état initial,
**pas la liste exacte des défauts encore présents**.

- A01 : sérialisation du cache déjà corrigée en amont (`e736b04`) ; durée du
  verrou lors d’une annulation à vérifier séparément.
- A02 : verrouillage de Revue intégré en amont, complété localement par un
  verrou synchrone ; scénario navigateur conservé.
- A03 : garde du titre par URL intégrée (`ac240f7`) ; invalidation immédiate
  du parse et priorité de la saisie manuelle restent à vérifier.
- A04 : protection locale du brouillon conservée avec les métadonnées amont.
- A07 : invalidation de la fiche déjà intégrée (`fe2d09b`) ; bilan partiel
  refusé encore à traiter.
- A08 : modalité/confinement apportés en amont ; réglages complétés localement
  (focus initial, Échap exclusif, restitution WebKit). La palette reste à
  vérifier pour restitution et Échap. ⌘R natif est neutralisé en modale.
- A09 : recherche serveur temporisée et état vide apportés en amont ;
  défilement local conservé ; stabilité des résultats asynchrones ouverte.
- A11 : découpage déjà intégré (`12acb16`), contrôle de taille désormais vert.
- A05, A06, A10, A12 et A13 : restent au suivi, sans correction ajoutée lors
  de cette intégration.

Voir la [roadmap réconciliée](../../ROADMAP.md) et les
[résultats de validation actuels](../../../e2e/VALIDATION.md).

## Audit initial (avant synchronisation)

Référence : `6f155db`, arbre initial propre. Audit de qualité, fiabilité et UX des parcours existants ; aucune écriture sur le compte Raindrop. Aucun code produit modifié. Les sondes sont conservées ici, hors découverte automatique de Vitest.

## Conclusion

L'architecture est structurée et largement testée, mais la livraison n'est pas validée : le contrôle de taille échoue et une course d'écriture du cache d'analyse a été observée dans la suite existante. Les problèmes les plus urgents concernent les actions répétées, la conservation des saisies et la cohérence des résultats asynchrones.

Les skills existants `superpowers:brainstorming`, `superpowers:systematic-debugging` et `superpowers:verification-before-completion` ont été utilisés. Aucun nouveau skill n'est nécessaire pour dupliquer ces méthodes. Pour les prochaines passes, les appliquer avec les contrats locaux de `CLAUDE.md`, `docs/DESIGN.md` et les scénarios ci-dessous.

## Couverture et limites

Examen transversal : démarrage React, état/navigation, bibliothèque et mosaïque, création/édition/restauration, Revue, palette, réglages, hooks/cache, API Hono, file MCP, analyse et jobs, sauvegarde/persistance, shell Tauri, configuration et chaîne de build. Lecture des conventions, de la charte et de la roadmap, confrontées au code courant.

Validation dynamique : tests existants, sondes ciblées React/jsdom et Node, typechecks, builds front/sidecar, tests Rust et contrôles préalables du packaging. Ce n'est pas une certification exhaustive de chaque fichier ni un audit spécialisé de vulnérabilités.

Non exécutés : application native interactive, VoiceOver, mesures de contraste dans WebKit, captures clair/sombre, tests visuels à 960 × 600, authentification réelle, tests d'intégration Raindrop, fabrication/signature du DMG, analyse actualisée des vulnérabilités des dépendances. Aucun navigateur pilotable disponible dans cette session. Les constats de rendu ci-dessous sont donc explicitement issus du code.

## Résultats de vérification

- `npm run typecheck` et `npm run typecheck:front` : succès.
- `npm run build:front` et `npm run build:sidecar` : succès. Front : JS 351,78 kB / gzip 107,79 kB ; CSS 26,53 kB / gzip 6,39 kB. Avertissement Vite : import dynamique Tauri également importé statiquement, donc pas de chunk séparé.
- `cargo test --offline --manifest-path src-tauri/Cargo.toml` : 73 réussis, 2 ignorés, aucun échec. Les messages négatifs de tar appartiennent au test de rejet d'un membre absent.
- Épinglage MCP : vérifié à 1.3.1.
- `verifier_tailles()` de `scripts/build_app.py` : échec, `src/components/ResultatsLiens.test.tsx` = 417 lignes, plafond 400. Douze autres fichiers dépassent la cible de 300 sans dépasser le plafond.
- Six assertions de comportement attendu ajoutées pour l'audit échouent ; voir les deux sondes et leurs journaux. Deux sondes de persistance supplémentaires confirment des incohérences sur disque/mémoire.
- Suite existante : **1 056 réussis, 2 échecs, 2 ignorés** (127 fichiers). Échecs : reprise du scanner (A01) et redémarrage MCP. Le fichier MCP passe ensuite isolément : **4/4** ; son attente fixe de 1 500 ms est sensible au temps de lancement sous charge. Remplacer cette attente par une condition bornée, sans masquer une vraie panne. Cette relance ne rend pas la suite globale verte. Détails : `validation.txt`.

Les premières exécutions ne constituent pas une baseline valide : le sandbox refusait `listen(127.0.0.1)` avec `EPERM`. La relance autorisée a aussi rencontré un ancien Node Homebrew incapable de charger `libsimdutf.36.dylib`. Une nouvelle exécution a été lancée avec le Node disponible ensuite (`26.11.1_1`). Ces incidents sont séparés des défauts produit ; aucune installation système n'a été faite par l'audit.

## Constats priorisés

P1 : à traiter avant la prochaine livraison. P2 : correction du prochain lot. P3 : robustesse/dette. « Reproduit » signifie une sonde exécutée ; « statique » indique une conclusion de lecture à compléter par un test.

### A01 — P1 — Cache d'analyse : écritures concurrentes sur le même temporaire

**Reproduit**, suite existante et sonde Node. `sidecar/analysis/cache.ts:36` écrit toujours `analysis.json.tmp` puis le renomme, sans file propre. Deux `save()` concurrents donnent un succès et un rejet `ENOENT`. La suite a échoué dans « relancer ne revérifie QUE ce qui manque » avec cette erreur.

`Scanner` sérialise les sauvegardes seulement à l'intérieur d'une invocation de `verifierTargets`. Les scans de types différents partagent le cache ; de plus, `JobHandle.cancel()` publie immédiatement `cancelled` et `Scanner` libère son garde alors que les workers et leur persistance terminent encore. Une nouvelle analyse peut chevaucher la précédente.

**Correction proposée :** sérialiser l'écriture au niveau du cache ; maintenir le verrou d'exécution jusqu'à la sortie effective du worker. Tester annuler/relancer, scans liens/doublons simultanés et échec disque. Ne pas simplement augmenter les délais des tests.

### A02 — P1 — Suppression de collections relançable pendant son exécution

**Reproduit** dans `review-repro.tsx`. `src/components/ReviewPage.tsx:111` calcule `pending` sans la suppression de collections ; `execute` ne possède pas de verrou commun synchrone. Pendant un DELETE retenu, « Exécuter » reste actif. Plusieurs chaînes peuvent être lancées sur les mêmes collections.

**Correction proposée :** verrou commun pour toute la durée de l'opération, posé avant le premier await et libéré en finally. Couvrir aussi le lancement du job de dédoublonnage, dont la progression n'est posée qu'après la réponse POST. Garder les confirmations existantes.

### A03 — P2 — Titre d'une ancienne URL transmis à une nouvelle création

**Reproduit**, première sonde front. Dans `src/components/Composer.tsx:36`, les métadonnées ne sont pas associées explicitement à l'URL courante. Passer de A, déjà analysée, à B puis soumettre avant les 300 ms transmet `title: Titre A`. Le numéro de séquence n'est incrémenté pour une URL valide qu'au départ du prochain parse.

**Correction proposée :** invalider les métadonnées dès le changement d'URL, lier les réponses à leur URL/génération et ne soumettre que les métadonnées correspondantes. Distinguer titre automatique et titre volontairement saisi.

### A04 — P2 — Le succès d'un envoi efface le brouillon suivant

**Reproduit**, deuxième sonde front. `Composer.tsx:74` vide inconditionnellement les champs quand A est enregistrée. Les champs restent éditables pendant l'envoi : saisir B avant la réponse de A perd B.

**Correction proposée :** ne réinitialiser que la génération effectivement envoyée, ou désactiver explicitement les champs durant l'envoi. Préférence : préserver la saisie suivante ; afficher l'état d'envoi. Examiner le même motif dans `DetailPane.enregistrer` avant de l'étendre.

### A05 — P2 — Une ancienne ouverture de signet reprend la navigation

**Reproduit**, deux sondes front. `src/hooks/useOuvrirSignet.ts:28` attend l'inventaire sans vérifier si le clic est encore courant ni si son composant est monté. Cliquer A puis B, laisser B répondre puis A, sélectionne A. Démonter la liste avant la réponse déclenche encore une navigation.

**Correction proposée :** génération du dernier clic, invalidation au démontage et au changement de contexte de navigation ; seul le clic encore valide peut appeler `go`/`selectRaindrop`. Garder le repli vers la fiche si l'inventaire échoue.

### A06 — P2 — Une écriture de vue sauvegardée refusée reste active en mémoire

**Reproduit**, sonde Node. `sidecar/smartlists/store.ts:71` modifie `data` avant `await persist()`, comme rename/remove. Avec un parent de fichier absent : add rejette `ENOENT`, mais list retourne l'entrée ; après rétablissement du dossier, une autre création persiste également l'entrée refusée.

**Correction proposée :** sérialiser la mutation entière, construire le prochain état, l'écrire, puis publier l'état mémoire après succès. Tester création/renommage/suppression en échec et reprise ; un rollback naïf peut écraser une modification concurrente.

### A07 — P2 — Restauration refusée sans message dans les actions individuelles

**Statique, contrat bout à bout.** `sidecar/api/routes/raindrops.ts` peut rendre HTTP 200 avec `{restored: 0, unknown: []}` lorsqu'une destination connue échoue. `src/components/DetailPane.corbeille.tsx:43` et `CleanupRows.tsx:249` ne lisent que `unknown` et `isError` : ce cas ne déclenche ni demande de destination ni erreur. La fiche n'est pas invalidée par `useUnrestore` non plus, ce qui peut conserver des actions de corbeille après une restauration réussie.

**Correction proposée :** rendre et afficher les échecs par identifiant, vérifier le bilan de restauration et invalider la requête `raindrop` en plus des listes. Tester succès, origine inconnue et destination connue en échec.

### A08 — P2 — Modales : focus non contenu et raccourcis de fond actifs

**Statique.** `Reglages.tsx:97` et `CommandPalette.tsx:77` utilisent des div superposées sans dialogue modal ni mécanisme de confinement/restitution du focus. Les réglages ne prennent pas le focus à leur ouverture normale. Les raccourcis globaux d'App restent actifs ; la fiche écoute également Échap sur window.

**Correction proposée :** coque de dialogue commune avec nom accessible, focus initial, Tab/Shift+Tab contenus, restitution du focus et gestion exclusive d'Échap pour la couche active. Vérifier que fermer les réglages ne ferme pas aussi la fiche. Contrôler le défilement des réglages à la hauteur minimale : absence actuelle de max-height/overflow sur leur coque.

### A09 — P2 — Palette : option active hors du champ visible

**Statique.** `CommandPalette.tsx:68` déplace seulement un indice. La liste est bornée à `max-h-80` sans défilement de l'option active. Descendre au clavier peut donc sélectionner une ligne hors écran. Les réponses réseau ajoutent des lignes en tête, ce qui peut aussi changer l'action associée à un même indice.

**Correction proposée :** conserver une identité stable de l'option active, la recaler quand les résultats changent, la rendre visible au clavier. Ajouter chargement/erreur de recherche et tester l'arrivée tardive des résultats.

### A10 — P2 — Mosaïque non virtualisée

**Statique, dette déjà connue et toujours présente.** `ListPane.tsx:159` rend `items.map` intégralement. Le chargement différé des images ne borne pas le nombre de tuiles DOM. Parcourir une grande bibliothèque accumule tous les éléments chargés.

**Correction proposée :** virtualisation par rangées mesurées ; conserver largeur minimale des tuiles, clavier bidimensionnel, drag & drop et visibilité de la sélection. Mesurer avant/après sur 12 000 fixtures dans un vrai navigateur ; aucun chiffre de ralentissement n'est affirmé ici.

### A11 — P2 — Contrôle de livraison rouge

**Reproduit.** `ResultatsLiens.test.tsx` dépasse de 17 lignes le plafond dur. `npm run build:front` vert ne suffit donc pas à conclure que `npm run build:app` est livrable.

**Correction proposée :** répartir les tests selon les parcours liens/redirections/revérification, sans affaiblir le contrôle ni supprimer d'assertions. Rejouer le contrôle de taille.

### A12 — P3 — SSE CRLF coupé entre deux chunks

**Reproduit**, dernière sonde front. `src/lib/sse.ts:44` normalise chaque chunk avant concaténation. Un CR en fin de chunk suivi du LF dans le suivant n'est pas normalisé ; le séparateur final n'est pas reconnu et `onDone` n'est jamais appelé.

**Portée :** le sidecar courant émet du LF ; cas de robustesse du parseur, pas un blocage démontré sur son flux actuel. Corriger le découpage incrémental des lignes et tester les partitions de CRLF, les caractères UTF-8 et la fermeture prématurée du flux.

### A13 — P3 — La fiche rétrécit la Revue

**Statique, dette connue toujours présente.** `src/App.tsx:70` ouvre la colonne détail pour toute sélection, même en Revue. À la largeur minimale 960 px, les colonnes fixes 240 + 320 laissent 400 px au centre, avant ses espacements.

**Correction proposée :** masquer la fiche pendant la Revue tout en conservant la sélection pour le retour. Valider à 960 × 600 et 1280 × 800, avec filtres, libellés longs et actions visibles.

## Ordre de traitement proposé

1. Fiabilité : A01–A07 et A11. Conserver les sondes comme tests de régression dans les modules concernés ; preuves rouges puis vertes ; suite existante, typechecks, builds et contrôle de taille.
2. Accessibilité et lisibilité : A08, A09, A13. Validation clavier, Échap, focus et captures clair/sombre dans WebKit.
3. Performance et robustesse : A10, A12. Mesures de taille DOM/temps de rendu sur fixtures volumineuses ; tests de flux partitionnés.

Ce sont des corrections ciblées de parcours existants, sans refonte visuelle ni changement du contrat de confirmation des actions destructrices. L'implémentation reste à valider selon le skill brainstorming ; ce document est l'audit et la proposition concrète à examiner.

## Rejouer les preuves front

Depuis la racine du dépôt, copier temporairement `front-repro.tsx` vers `src/audit-repro.test.tsx` et `review-repro.tsx` vers `src/components/audit-review.test.tsx`, puis lancer :

```sh
npx vitest run src/audit-repro.test.tsx src/components/audit-review.test.tsx --maxWorkers=2
```

Les six assertions expriment le comportement attendu et échouent sur la référence auditée. Retirer ensuite uniquement ces deux copies temporaires. Elles ne sont pas des tests déclarés réussis et ne sont pas intégrées à la suite normale avant correction.

Sonde de persistance : `node docs/audits/2026-10-15/persistence-repro.mjs` après build sidecar ; résultats dans `persistence-repro.log`. Elle utilise exclusivement ses propres dossiers temporaires, nettoyés en finally.
