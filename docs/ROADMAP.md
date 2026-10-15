# Roadmap — Raindrop-GUI

Mise à jour : **15 octobre 2026**, après la publication de
[v0.1.0-pre.23](https://github.com/mrbabilo/Raindrop-GUI/releases/tag/v0.1.0-pre.23).
La première passe UI, le correctif des doublons introuvables, la sélection
peinte et l’iconographie diagnostique sont intégrés et publiés. Cette
préversion ne clôture ni l’audit ni la généralisation de la charte.

Sources : [audit et constats A01–A13](audits/2026-10-15/README.md),
[charte v2 proposée](DESIGN-v2-proposition.md),
[résultats des tests UI](../e2e/VALIDATION.md), [spec produit](superpowers/specs/2026-09-15-raindrop-gui-design.md).
L’[ancienne roadmap](roadmaps/2026-09-22-roadmap.md) conserve l’historique et
les motifs techniques des reports. La [roadmap GitHub intégrée](roadmaps/2026-09-24-roadmap-github.md) conserve aussi les lots UX/ergonomie et leurs vérifications restantes. Vérifier le code et `git log` avant de
reprendre une tâche ; une case cochée ci-dessous ne signifie pas « publié ».

## État après publication

| Élément | État vérifié |
|---|---|
| Bibliothèque, Nettoyage, sauvegarde, lecture, vues sauvegardées | Socle implémenté ; historique dans CHANGELOG et Git |
| Revérification des indéterminés | Implémentée, commit `6f155db` ; ne pas refaire |
| Audit transversal | 13 constats documentés ; certains restent à confirmer dynamiquement |
| Harnais navigateur | 88 tests réussis sur la branche courante, Chromium/WebKit, clair 1280×800 et sombre 960×600 |
| Corrections de fiabilité | A02, A04, partie d’A08/A09 et doublons introuvables intégrés jusqu’à pre.22 |
| Suite complète | 1 282 tests réussis sur la branche courante, aucun échec, 2 ignorés |
| Livraison native | pre.23 publiée : DMG et ZIP arm64, empreintes vérifiées, signature ad-hoc ; 73 tests Rust réussis, 2 ignorés |
| Charte v2 | Première passe pilote incluse dans pre.22 ; sélection peinte, survols et pictogrammes diagnostiques publiés dans pre.23 ; revue utilisateur et généralisation restantes |

Validation de pre.22 : **80 tests UI**, **1 275 tests Vitest** et **73 tests
Rust** réussis ; 2 tests Vitest et 2 tests Rust ignorés. Le focus clavier
intermittent reste suivi, voir [validation](../e2e/VALIDATION.md).

Validation de pre.23 : **88 tests UI**, **1 282 tests Vitest** et **73 tests
Rust** réussis ; 2 tests Vitest et 2 tests Rust ignorés.

## Ordre et dépendances

| Jalon | Priorité | Dépendance | Résultat attendu |
|---|---|---|---|
| 1. Fiabilité et contrôles | Immédiate | Socle existant | Écritures cohérentes, saisies préservées, contrôles verts |
| 2. Charte UI et trois écrans pilotes | Haute | Peut commencer pendant le jalon 1 | Direction visuelle concrète, comparée puis adoptée |
| 3. Accessibilité et généralisation UI | Haute | Règles visuelles retenues au jalon 2 ; corrections clavier possibles avant | Parcours clavier cohérents et composants harmonisés |
| 4. Performance et flux | Moyenne | Géométrie des tuiles stabilisée pour la mosaïque | DOM borné, flux robustes, mesures conservées |
| 5. Validation native et livraison | Préversion publiée ; validation complète encore ouverte | Contrôles automatisés réalisés ; validation manuelle et jalons 1–4 à poursuivre | Préparer la prochaine version et achever la stabilisation |

## Jalon 1 — Fiabilité et contrôles

- [x] **A02 : verrouiller toute l’exécution de Revue**, y compris les suppressions séquentielles. Verrou synchrone et tests de libération après erreur.
- [x] **A04 : préserver le brouillon suivant** quand la création précédente réussit. Scénario navigateur avec réponse retenue.
- [x] **A01, persistance : sérialisation intégrée depuis GitHub** (`e736b04`), avec tests concurrents.
- [ ] **A01, annulation : vérifier la durée du verrou jusqu’à l’arrêt effectif des workers.** Tester annuler/relancer et échec disque ; ne pas confondre la sérialisation des écritures avec l’absence de chevauchement des workers.
- [x] **A03, envoi : titre associé à son URL** via `titrePour`, intégré depuis GitHub (`ac240f7`) et testé.
- [ ] **A03, affichage : vérifier l’invalidation immédiate du parse précédent et la priorité du titre manuel** lorsque les réponses arrivent en retard.
- [ ] **A05 : réserver la navigation au dernier clic valide.** Tester réponses inversées, démontage et changement de vue ; conserver le repli vers la fiche si l’inventaire échoue.
- [ ] **A06 : publier une vue sauvegardée en mémoire après sa persistance réussie.** Tester ajout/renommage/suppression en échec et mutations concurrentes ; une écriture refusée ne réapparaît pas au prochain succès.
- [ ] **A07 : rendre visibles les restaurations refusées.** Confirmer le défaut avec un test de contrat ; vérifier succès, origine inconnue, destination connue en échec et actualisation de la fiche. L’invalidation de la fiche est déjà intégrée (`fe2d09b`) ; reste le bilan partiel refusé.
- [x] **A11 : découpage intégré** depuis GitHub (`12acb16`) ; fichier à 340 lignes et contrôle de taille repassé avec succès.
- [ ] **Stabiliser le test de redémarrage MCP.** La suite intégrée passe, mais le délai reste sensible à la charge. Remplacer l’attente fixe par une condition bornée et vérifier qu’un véritable échec de redémarrage reste détecté.

- [ ] **Reproduire et stabiliser le focus des contrôles de ligne.** Le test `ListPane.touches` échoue dans la suite complète et passe isolément ; vérifier le focus différé de `useIndexClavier` avant toute correction.

**Sortie :** régressions reproduites puis corrigées ; suite complète, typechecks,
builds front/sidecar et contrôle de taille réussis. Ne pas déclarer A01 résolu
sur la seule absence d’un échec intermittent. Conserver les preuves dans l’audit.

## Jalon 2 — Charte UI et écrans pilotes

- [x] Rédiger la proposition `DESIGN-v2-proposition.md`.
- [ ] **Compléter les trois écrans pilotes déjà implémentés :** bibliothèque avec fiche, Nettoyage avec résultats, Revue. Inclure titres longs, nombreuses étiquettes, chargement, erreur et absence de résultat.
- [ ] **Comparer lisibilité et densité :** tailles de texte, ligne actuelle face à une ligne de 40 px, espaces, place des actions et intensité des couleurs de collection.
- [ ] **Définir les composants communs :** boutons principal/secondaire/contextuel, champs avec libellés, focus, opération en cours, erreur et indisponibilité. Séparer les erreurs d’interface des diagnostics de liens.
- [x] **A13 : donner sa largeur à la Revue.** Masquer la fiche pendant la Revue en conservant la sélection pour le retour ; vérifier portée, confirmations et action accessibles à 960×600.
- [x] **Produire et inspecter les captures des écrans pilotes**, clair/sombre à 960×600 et 1280×800 ; contrôler animations normales/réduites et contraste des actions primaires.
- [ ] **Comparer les captures clair/sombre avec l’utilisateur** aux deux tailles du harnais, puis faire acter la direction sur ces écrans concrets.
- [ ] **Reporter les règles retenues dans `DESIGN.md`**, documenter les jetons réellement implémentés et les écarts restants.

**Sortie :** trois écrans utilisables et une charte applicable au code. Les
valeurs de la proposition ne deviennent pas des exigences adoptées sans cette
comparaison. Les captures actuelles ne sont pas des références pixel approuvées.

## Jalon 3 — Accessibilité et généralisation UI

- [x] Première passe de mouvement : transitions 120 ms, entrées de fiche/dialogue 180 ms, chargement nommé ; animations entièrement coupées selon la préférence système.
- [x] **Sélection peinte au pointeur :** maintenir le bouton principal sur une
  case et traverser les suivantes applique le même état dans la bibliothèque,
  les collections, le Nettoyage, les doublons et la Revue. Conserver clic,
  Maj-clic, clavier, tactile, réduction des mouvements et garde du dernier
  doublon ; validation Chromium/WebKit dans les quatre profils du harnais.
- [x] **Doubler la couleur des diagnostics par une forme :** chaîne rompue,
  flèche coudée, point d’interrogation et copies superposées dans le Nettoyage,
  la liste et la mosaïque ; noms accessibles hors libellé adjacent et tests
  Chromium/WebKit dans les quatre profils.

- [x] **A08, réglages :** dialogue nommé, focus initial/contenu/restitué, Échap exclusif, raccourcis globaux neutralisés et hauteur défilante bornée.
- [x] **A09, défilement :** maintenir l’option active de la palette dans la zone visible.
- [ ] **Compléter A08 pour la palette :** GitHub apporte déjà rôle modal et confinement via `useDialogue` ; vérifier focus initial/restitution, Échap sans fermeture de la fiche et interaction avec les autres superpositions.
- [ ] **Compléter A09 pour les réponses tardives :** conserver l’identité de l’option active, recaler une option disparue, distinguer chargement/erreur/vide ; Entrée ne doit pas choisir une autre cible silencieusement.
- [ ] **Généraliser la charte adoptée :** bibliothèque, lecture, Nettoyage, Revue, réglages, Tags et vues sauvegardées. Actions métier lisibles, filtres découvrables et retours utilisateur cohérents.
- [ ] **Vérifier clavier, zoom et VoiceOver**, accès aux actions de survol et alternative au glisser-déposer. Vérifier aussi visuellement l’étoile partagée en grille.
- [ ] **Mesurer les contrastes rendus** des deux thèmes selon les objectifs internes de la charte : texte courant 4,5:1, focus et signes essentiels 3:1.
- [ ] **Étendre Playwright** aux nouveaux parcours et ajouter des comparaisons visuelles après adoption des références ; conserver traces et captures en cas d’échec.

**Sortie :** matrice Chromium/WebKit verte, contrôles manuels consignés et écarts
explicites. Un résultat automatisé vert ne vaut pas certification d’accessibilité.

## Jalon 4 — Performance et robustesse des flux

- [ ] **A10 : virtualiser la mosaïque par rangées.** Mesurer avant/après sur 12 000 signets simulés ; le nombre de tuiles DOM doit dépendre de la fenêtre et de sa marge, pas du total chargé. Conserver sélection, clavier, glisser-déposer et position de retour.
- [ ] **A12 : corriger le parseur SSE incrémental.** Tester CRLF séparé entre chunks, UTF-8 fragmenté, fin normale et fermeture prématurée ; le sidecar actuel émet du LF.
- [ ] **Découper `CleanupRows.tsx`** selon ses responsabilités, notamment la corbeille, si le lot y touche. Cible 300 lignes, plafond dur 400 pour code et tests ; `ReviewPage.tsx` est à 355 après intégration.

**Sortie :** mesures reproductibles et conservées, régressions navigateur vertes,
aucune perte de navigation ni de sélection. Fixer les budgets de temps de rendu
à partir des mesures initiales, sans inventer un gain de performance.

## Jalon 5 — Préversion publiée, validation native à compléter

La publication pre.23 porte le périmètre intégré et testé décrit dans les
[notes de release](releases/v0.1.0-pre.23.md). Elle ne signifie pas que les
jalons 1–4 sont terminés. La recette native interactive reste ouverte.

- [x] Suite complète, trois typechecks, builds front/sidecar, tests Rust, contrôle de taille et build natif exécutés pour pre.23.
- [ ] Rejouer les parcours UI dans le shell Tauri : démarrage, reconnexion, réglages, sélection de dossier, bibliothèque, nettoyage et lecture.
- [ ] Terminer la validation réelle des vues sauvegardées : créer depuis un filtre, rouvrir, renommer, supprimer, désactiver la marque lors d’un changement de filtre.
- [ ] Terminer la validation lecture : 2–3 archives réelles, focus de la fenêtre et isolation IPC du site ouvert, selon la spec lecture §6.
- [ ] Vérifier avec des données de test contrôlées les actions de création/restauration/suppression ; les fixtures HTTP ne prouvent pas le contrat réel Raindrop.
- [x] Changelog et notes de version préparés ; ZIP et DMG arm64 générés, signature et version du bundle contrôlées, archives vérifiées.
- [x] Publier pre.22 sur demande explicite : tag `v0.1.0-pre.22` sur `e5d1544`, ZIP, DMG et empreintes publiés puis comparés aux artefacts locaux.
- [x] Publier pre.23 : sélection peinte, survols et pictogrammes diagnostiques ; ZIP, DMG et empreintes vérifiés.
- [x] Vérifier installation et lancement depuis les artefacts téléchargés sur
  une session macOS utilisateur, ainsi que l’ouverture du doublon périmé et son
  issue explicite. Les autres parcours natifs détaillés ci-dessus restent ouverts.
- [ ] Évaluer Developer ID et notarisation si une distribution sans blocage Gatekeeper devient nécessaire.

**Cible de stabilisation :** preuves rattachées à la version candidate, aucun P1 ouvert et aucun
contrôle obligatoire rouge. Toute réduction du périmètre doit être documentée
avant livraison ; les tests ne sont pas ignorés pour obtenir un résultat vert.

## Backlog après stabilisation

| Sujet | Condition de reprise / validation attendue |
|---|---|
| Redirections en masse | Spec d’écriture par lot via Revue, bilan partiel et reprise explicites avant implémentation |
| Fusion d’étiquettes par glisser-déposer | Conserver le formulaire et une alternative clavier ; confirmer portée et résultat |
| Consultation hors ligne | Refus des écritures déjà intégré (`5172138`) ; vérifier `navigator.onLine` sous Tauri. Définir consultation des archives et éventuelle file avec stratégie de conflits |
| Compteur de doublons dédié | Mesurer le coût du payload complet avant de changer le contrat ; clé de cache déjà partagée |
| Qualité d’extraction du lecteur | Définir des exemples bons/mauvais et des raisons visibles au-delà du simple vide/non-vide |
| Reprise d’analyse après redémarrage | Différée : pagination potentiellement modifiée ; conserver les contraintes de réconciliation et troncature de l’ancienne roadmap |
| Bruit des tests | Traiter les avertissements React `act` restants sans masquer les assertions |
| Veille des dépendances | Actualiser le registre de sources et l’évaluation du successeur MCP ; aucune migration décidée |


### Vérifications héritées de GitHub à conserver

- [x] Historique de navigation, dernière vue persistée, ⌘R, touches ⌫/F/E, largeur de fiche redimensionnable : intégrés, pas à réimplémenter.
- [ ] Vérifier ces raccourcis sous WKWebView/AZERTY, le focus après disparition d’une ligne et la poignée de redimensionnement à la souris/clavier.
- [ ] Vérifier les dates `created:>=` / `<=`, l’export CSV natif et le bilan réel de restauration (`modified`), avec sondes limitées et données contrôlées.
- [ ] Arbitrer l’accès au troisième niveau de collections et les touches d’action dans `CollectionView`.
- [ ] Évaluer une CSP compatible avec le port local dynamique, GitHub et les images ; la CSP reste désactivée.
- [ ] Mesurer les faux positifs HEAD avant de modifier le repli GET, sans lancer de vérification massive du compte.
- [ ] Évaluer le coût de relecture des listes périmées et les deux appels par signet en glisser-déposer. Ne pas basculer vers `/bulk` sans vérifier ajout d’étiquettes et protection des signets déjà corbeillés.

## Phase 2 — Hors périmètre de cette remise à niveau

Agent IA avec plan validé via Revue, moteur de règles, exclusions d’audit,
spike Stella, sidecar en binaire autonome, écriture des highlights, OAuth2,
formats d’export élargis : specs séparées avant réalisation. Les tests E2E
Playwright ne sont plus reportés en phase 2 : leur socle est déjà opérationnel.

## Méthode de suivi

Pour chaque tâche : reproduire le défaut ou fixer le critère observable,
implémenter, vérifier, puis mettre à jour cette roadmap et le constat associé.
Utiliser les skills existants de diagnostic, conception et validation ; créer
un skill spécifique seulement si une procédure répétée manque réellement.
Distinguer systématiquement **implémenté localement**, **validé** et **publié**.
Ne pas lancer d’analyse massive de liens réels pour exécuter cette roadmap.
