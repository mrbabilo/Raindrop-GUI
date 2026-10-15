# Validation UI dans un navigateur pilotable

Playwright ouvre le **front de production compilé**, avec ses vrais composants
React et son CSS. Les réponses de l'API locale sont simulées à la frontière
HTTP. Aucun sidecar, compte Raindrop ou jeton n'est nécessaire.

## Installation et commandes

```sh
npm ci
npx playwright install chromium webkit
npm run typecheck:ui
npm run test:ui
npm run test:ui:audit
npm run test:ui:report
```

- `test:ui` : tous les parcours de non-régression, audit inclus.
- `test:ui:audit` : assertions attendues des constats A02/A04/A08/A09.
  Les cinq défauts sont corrigés ; ces scénarios restent exécutés par défaut.
  Aucun `skip`, `test.fail` ou retry ne masque un échec.
- `test:ui:all` : les deux groupes, pour le verdict complet.
- `test:ui:headed` : non-régression avec fenêtres visibles.
- `npm run test:ui -- --project=webkit-clair` : un moteur/format seulement.
- `npx playwright test --ui` : interface interactive pour piloter les tests.

Le serveur est lancé et arrêté par Playwright sur `127.0.0.1:4178`. Le port
doit être libre : une instance existante n'est jamais réutilisée. Chaque
exécution reconstruit le front ; elle ne dépend pas d'un ancien `dist/`.
Sous un sandbox, autoriser le serveur local et les processus de navigateur.

## Contrats intégrés depuis GitHub

Le harnais suit la version `e78aa8e` : recherche ciblée par son nom accessible,
état vide explicite et erreur MCP traduite. La confirmation de Revue est testée
sur la suppression de collections (frappe SUPPRIMER). La corbeille depuis la
barre de sélection est désormais directe avec Annuler, conformément à la spec
§4.3 ; le harnais ne réintroduit pas l’ancien passage obligatoire par Revue.

## Matrice

| Projet | Moteur | Thème | Fenêtre |
|---|---|---|---|
| chromium-clair | Chromium | clair | 1280 × 800 |
| chromium-sombre-compact | Chromium | sombre | 960 × 600 |
| webkit-clair | WebKit | clair | 1280 × 800 |
| webkit-sombre-compact | WebKit | sombre | 960 × 600 |

Langue française, fuseau Europe/Paris, mouvements réduits. Les navigateurs
et le contexte de stockage sont isolés entre tests. WebKit Playwright
approche le moteur de l'application macOS ; il ne remplace pas un test du
shell Tauri, du trousseau ou des dialogues natifs.

## Ce que les scénarios vérifient

| Parcours | Régression détectée |
|---|---|
| Bibliothèque | contenu absent, thème erroné, débordement horizontal global |
| Panneau latéral | impossibilité de rouvrir la navigation |
| Clavier | flèches sans focus, sélection Espace incorrecte, Entrée sans détail |
| Recherche | état vide sans retour aux résultats |
| Erreur réseau | erreur présentée comme un vide ou bouton Réessayer inopérant |
| Mosaïque | bascule ou ouverture de fiche cassée |
| Nettoyage | absence d'analyse présentée comme zéro problème |
| Revue | exécution possible avant confirmation ou bouton hors fenêtre |
| Réglages — audit | dialogue non nommé, focus non contenu/restitué |
| Échap — audit | fermeture simultanée de la modale et de la fiche |
| Palette — audit | option active située hors de sa zone défilante |
| Création — audit | effacement du brouillon suivant par une réponse tardive |
| Suppression — audit | bouton Exécuter disponible pendant une suppression |

Le mock traite explicitement les routes utilisées. Une route inconnue ou
une requête externe inattendue fait échouer le test. Les appels GitHub de
version sont simulés ; les autres destinations externes sont bloquées.
Les écritures des scénarios d'audit restent des réponses locales simulées.

Les attentes portent sur le rendu et les interactions, avec les assertions
réessayées de Playwright. Les courses réseau utilisent une réponse retenue
et une libération explicite, sans attente arbitraire de plusieurs secondes.

## Captures et diagnostic

`playwright-report/index.html` contient le rapport navigable. Les vues
bibliothèque, fiche, mosaïque, Nettoyage et Revue sont jointes en PNG sur les
tests correspondants. Les tests en échec conservent aussi une capture et
une trace dans `test-results/ui/` :

```sh
npx playwright show-trace test-results/ui/<scenario>/trace.zip
```

Ces captures servent à la revue de la charte UI. **Elles ne constituent pas
encore des références de comparaison pixel à pixel approuvées.** Ne pas
transformer automatiquement le rendu actuel en cible visuelle : la charte
v2 est encore une proposition. Les contrastes, VoiceOver et la qualité
visuelle restent à vérifier séparément.

Les artefacts générés sont ignorés par Git. Les résultats d'une exécution
peuvent être remplacés par la suivante ; exporter le rapport avant une
nouvelle exécution pour le conserver.

Références : [serveur Playwright](https://playwright.dev/docs/test-webserver),
[simulation HTTP](https://playwright.dev/docs/mock),
[assertions](https://playwright.dev/docs/test-assertions).
