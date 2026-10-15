# Signet introuvable dans les doublons — 15 octobre 2026

Correctif après `99a8756`. Reproduction initiale : fiche d’un signet
présent dans les résultats d’analyse, alors que Raindrop retourne HTTP 404.
Le texte MCP « not found » seul n’est pas une preuve : le connecteur l’émet
également sur une panne réseau ou HTTP.

- Suite Vitest complète : **1 275 réussis, 2 ignorés**, aucun échec.
- `e2e/signet-absent.spec.ts` : **8 réussis** sur Chromium/WebKit, clair/sombre.
  Scénarios : doublon périmé, absence de lancement automatique, refus de scan
  visible, attente avec bouton désactivé, rechargement des résultats à la fin,
  panne de lecture réessayable sans message de disparition.
- Tests serveur : distinction 404/401/403/429/500/réseau, lecture retrouvée,
  réponse invalide, invalidation de l’instantané uniquement sur 404 confirmé.
- Typechecks front/sidecar/UI, build front du harnais et contrôle de taille : succès.
- Tests de régression exécutés en échec avant implémentation (lecture de secours
  absente et message/action non affichés), puis réussis après correction.

Les tests utilisent des réponses simulées. Aucune analyse du compte réel ni
écriture distante n’a été lancée pour implémenter ce correctif.

Build complet `python3 scripts/build_app.py` réussi ensuite : les 1 275 tests
passent à nouveau (2 ignorés), contrôles TypeScript et bundle réussis. Le nouveau
`.app` et le DMG arm64 dans `src-tauri/target/release/bundle/` contiennent le
correctif ; version locale conservée à 0.1.0-pre.21, signature ad-hoc vérifiée.
La release GitHub pre.21 publiée reste inchangée. Le parcours dans l’application
installée reste à vérifier manuellement : ouverture du doublon périmé, message,
puis actualisation explicite. Le scénario équivalent est testé dans les deux
moteurs navigateur avec réponses simulées.

---

# Passe pilote design et animations — 15 octobre 2026

Passe design après `eaa0332`, non incluse dans la release pre.21 publiée.

`npm run test:ui` : **72 réussis**, sur Chromium et WebKit, en clair
1280 × 800 et sombre 960 × 600. Les 20 exécutions supplémentaires couvrent :

- Revue sur toute la largeur et restauration de la fiche au retour ;
- titre de bibliothèque, filtres nommés, recherche et absence de débordement ;
- contraste du bouton primaire actif (au moins 4,5:1) ;
- animation des réglages, état final, focus et restitution après Échap ;
- préférence de mouvement réduit et indicateur de chargement.

Captures clair/sombre inspectées : bibliothèque avec détail, Nettoyage et
Revue. Rapport : `playwright-report/index.html` ; sélection de captures locales :
`test-results/pilotes/`. Ces fichiers générés sont ignorés par Git.
La comparaison visuelle avec l'utilisateur et la généralisation restent ouvertes.

Contrôles TypeScript front, sidecar et UI, contrôle de taille et relecture
indépendante : succès. Les tests de composants ciblés comptent 95 réussites.
Le premier passage complet, en parallèle des navigateurs, a rencontré deux
échecs temporels dans `linkchecker.test.ts` et `archives.test.ts` ; ces deux
fichiers passent isolément (34 tests).

Relance complète sans navigateurs concurrents (`npm test -- --maxWorkers=2`) :
**1 262 réussis, 1 échec, 2 ignorés**. L'échec concerne
`ListPane.touches.test.tsx`, « une touche née dans un contrôle de la ligne ne la
vise pas ». Ce fichier passe ensuite isolément (5/5). Le hook existant
`useIndexClavier` programme un focus de ligne après propagation du focus d'un
contrôle : une course avec cette frame est une piste à reproduire, pas un
diagnostic définitivement validé. Ce passage complet n'était donc pas vert.
Aucun changement de comportement clavier n'a été ajouté dans cette passe.

Lors du build complet demandé ensuite (`python3 scripts/build_app.py`), la suite
passe : **1 263 réussis, aucun échec, 2 ignorés**, ainsi que les typechecks front
et sidecar. Ce passage réussi ne clôture pas le suivi du focus intermittent.
Build Tauri macOS arm64 réussi : `.app` et `.dmg` dans
`src-tauri/target/release/bundle/`. Version conservée à 0.1.0-pre.21 pour ce
build local ; les artefacts de la release publiée restent inchangés. Version,
signature ad-hoc et présence du sidecar/MCP embarqués vérifiées par le script.

Les réponses HTTP sont simulées. Cette validation ne couvre pas le shell Tauri,
VoiceOver ou un compte réel ; aucun test Rust n'a été relancé pour cette passe CSS/React.

---

# Résultats du 15 octobre 2026 — intégration GitHub et corrections UI

Base : `e78aa8e`, 61 commits GitHub intégrés depuis `6f155db`, puis
réconciliation des modifications locales.

Exécution réelle sur macOS, Playwright 1.64.1, Chromium 156 et WebKit 27.2.
Chaque scénario tourne en clair 1280 × 800 et sombre 960 × 600.

`npm run test:ui` : **52 réussis**, aucun échec ni scénario ignoré.
Les scénarios issus de l'audit sont désormais inclus dans la commande par défaut.
`test:ui:audit` permet toujours de les cibler séparément.

| Scénario | Comportement validé |
|---|---|
| A08 — Réglages | Dialogue nommé, focus initial, Tab/Shift+Tab contenus, restitution au bouton ; raccourcis globaux neutralisés. |
| A08 — Échap | Fermer les réglages conserve la fiche ouverte. |
| A09 — palette | L'option active reste dans le rectangle de la liste défilante. |
| A04 — création | Le succès d'une création conserve le brouillon saisi ensuite. |
| A02 — suppression | Exécuter est désactivé pendant la suppression ; un verrou couvre l'action complète. |

Le premier passage après correction a aussi révélé deux défauts de harnais :
le sélecteur combobox incluait le tri de la bibliothèque ; un clic au centre
d'une ligne compacte pouvait viser une action interne. Le test cible maintenant
le champ de la palette et ouvre explicitement la fiche au clavier. Le défaut de
restitution du focus sous WebKit a été corrigé dans le produit : le bouton
Réglages prend explicitement le focus avant l'ouverture.

Contrôles complémentaires après intégration :

- `typecheck:ui`, `typecheck`, `typecheck:front` et builds front/sidecar : succès.
- Suite Vitest : **1 263 réussis, aucun échec, 2 ignorés**. Le test MCP à délai
  fixe passe cette fois ; sa fragilité historique reste suivie.
- Tests Rust : **73 réussis, aucun échec, 2 ignorés**.
- Contrôle de taille : succès (avertissements au-delà de la cible de 300,
  aucun dépassement du plafond de 400). Découpage A11 apporté par GitHub.
- Relecture indépendante : interaction entre garde modale et nouveau ⌘R
  corrigée ; le rechargement natif est empêché et vérifié par le test UI.
- `git diff --check` : succès.

Les tests ont été adaptés aux contrats amont : nom accessible de recherche,
message d’erreur réseau traduit, état vide explicite et confirmation de Revue
via la suppression de collections. La mise à la corbeille depuis la sélection
reste directe avec Annuler, conformément à la spec amont.

Le rapport navigable et les captures sont dans `playwright-report/index.html`.
Les réponses HTTP sont simulées : ces tests ne valident ni le shell Tauri ni
le compte réel. La charte v2 reste une proposition. A08 demeure partiellement
ouvert pour la modalité de la palette ; A09 pour la stabilité de l'identité de
sélection lors de réponses tardives. Les autres constats d'audit restent suivis
séparément.
