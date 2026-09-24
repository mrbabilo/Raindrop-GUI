# Audit d'ergonomie — 2026-09-24

Après l'audit UX/UI du 2026-09-23 (défauts visuels, accessibilité,
rédaction), celui-ci regarde les **parcours** : combien de gestes coûte une
tâche courante, ce que l'application dit après une action, ce qui se
défait, ce qui se retrouve d'une session à l'autre. Méthode : lecture des
flux dans le code (sélection, clavier, persistance, retours d'action),
comparaison à la spec (§115-§116) et aux conventions macOS. Chaque
amélioration a un test rouge avant, saboté après.

## Corrigé

| # | Constat | Avant | Après | Commit |
|---|---|---|---|---|
| 1 | **La fiche n'éditait ni les étiquettes ni la collection** — écart à la spec §116 (« titre, extrait, note, tags, collection ») | ajouter une étiquette à un signet : 5 gestes (cocher, Étiqueter, Revue, confirmer, exécuter) ; en retirer une : **impossible** ; changer de collection : glisser-déposer seulement | pilules retirables, champ d'ajout (Entrée ou virgule, étiquettes existantes proposées), sélecteur de collection — dans le même brouillon (Enregistrer / Annuler / Échap) | `0b6e293` |
| 2 | **Le mode d'affichage et le tri se perdaient à chaque navigation** | mosaïque ou tri par titre → cliquer une autre collection → retour à la liste par date ; rien au relancement | préférences qui suivent la navigation et la session ; une vue sauvegardée garde son tri | `ea20f0f` |
| 3 | **Cocher plusieurs signets** | un clic par case | Maj-clic : la plage ; « Tout sélectionner (N) » dans la barre de sélection | `4f6c359` |
| 4 | **La recherche ne disait pas sa portée** | « Rechercher… » dans « Dev » : ne rien trouver se lisait « n'existe pas » | « Rechercher dans « Dev »… » | `4f6c359` |
| 5 | **Un glisser-déposer réussi ne disait rien** | la ligne disparaissait, c'est tout ; rien ne se défaisait | avis (« 2 signets déplacés ») ; « Annuler » là où c'est sûr : déplacement (retour à chaque collection d'origine), corbeille sans signet déjà corbeillé | `4f6c359` |

## Écart de spécification — corrigé le 2026-09-24 (`dc95eea`)

- **Spec §115 : la barre d'actions en masse porte « Déplacer ».** Le geste
  avait été retiré (la largeur de la barre ; « le glisser-déposer fait le
  même geste »), et **au clavier, déplacer plusieurs signets était
  impossible**. Rétabli : un sélecteur de destination et son bouton, la
  barre se repliant sur deux rangées si la colonne est étroite.

## Propositions — toutes implémentées le 2026-09-24

| # | Proposition | Commit |
|---|---|---|
| 1 | Historique ⌘[ / ⌘] (et ⌘← / ⌘→ hors d'un champ — les crochets demandent Option sur AZERTY) | `bd208a1` |
| 2 | ⌫ / F / E sur la ligne active | `d0df348` |
| 3 | Corbeille (et déplacement) depuis la sélection sans Revue, avec avis + Annuler — **spec §4.3 amendée** | `dc95eea` |
| 4 | Dernière vue rouverte au lancement | `bd208a1` |
| 5 | ⌘R relit (les listes repartent de leur première page) | `bd208a1` |
| 6 | Colonne de fiche redimensionnable | `73f08f7` |

Texte d'origine des propositions :

1. **Historique de navigation** (⌘[ / ⌘]) : revenir à la collection
   précédente demande aujourd'hui de la retrouver dans la barre latérale.
2. **Touches d'action sur la ligne active** : ⌫ → corbeille (réversible,
   avec l'avis et son Annuler), F → favori, E → éditer la fiche. La liste
   ne connaît aujourd'hui que la navigation (flèches, Espace, Entrée).
3. **La Revue pour les gestes réversibles** : mettre trois signets à la
   corbeille depuis la barre de sélection passe par la Revue (case à cocher
   + Exécuter) — la spec §4.3 le veut (niveau 1). Avec l'avis et son
   Annuler, une exécution directe serait aussi sûre pour la corbeille
   seule. Décision de spec.
4. **Rouvrir la dernière collection au lancement** (le mode et le tri sont
   retenus depuis #2, pas la collection).
5. **Rafraîchir** (⌘R) : l'application ne relit pas au retour de fenêtre
   (choix délibéré, la file est chère) ; une modification faite sur le site
   Raindrop n'apparaît qu'à la navigation suivante, sans geste pour la
   demander.
6. **Colonne de la fiche redimensionnable** (320 px fixes).

## À vérifier en réel

- Le champ d'étiquettes de la fiche et sa liste de propositions
  (`<datalist>`) dans WebKit.
- Maj-clic sur une case : WebKit ne sélectionne pas de texte au passage.
- L'avis de dépôt et son Annuler, sous la liste et sous la vue de
  collection.
- ⌘R : ni WKWebView ni un menu ne le prennent avant le webview (sinon la
  page se recharge et l'état de l'app est perdu).
- ⌘[ au clavier AZERTY ; ⌘← / ⌘→ hors d'un champ.
- ⌫ sur la ligne active : le focus après la disparition de la ligne.
- La poignée de la fiche : curseur, tirer, double-clic.
