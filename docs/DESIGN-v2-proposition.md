# Charte UI v2 — proposition à valider

Statut : proposition du 15 octobre 2026, initialement rédigée sur `6f155db`.
Une première passe pilote est maintenant implémentée sur bibliothèque,
Nettoyage et Revue, avec animations et primitives partagées. Voir la section
« Passe pilote v2 » de `DESIGN.md` pour les règles effectivement appliquées.
La comparaison utilisateur et la généralisation restent à faire.
Après intégration de GitHub `e78aa8e`, plusieurs améliorations UX existent
déjà : confronter chaque proposition au DESIGN.md courant avant application. `DESIGN.md` reste la référence
actuelle jusqu'à validation. Ce document décrit la cible ; il ne prétend
pas que l'ensemble de l'interface l'applique déjà.

## Intention

Faciliter trois activités : retrouver un signet, lire son contenu et
entretenir sa bibliothèque. L'application doit rester efficace avec des
milliers de liens, tout en rendant ses actions compréhensibles sans devoir
connaître chaque icône.

Direction proposée : une application macOS sobre, lisible et structurée,
avec des couleurs de collection reconnaissables et une hiérarchie d'actions
explicite. L'interface française et les confirmations métier sont conservées.

## Ce qui change dans les principes

| Règle actuelle | Règle proposée |
|---|---|
| « Le texte est l'exception » | Les actions métier portent un verbe visible ; les icônes seules servent les gestes familiers. |
| « Révélé, pas posé » | Les actions essentielles restent visibles ; les actions secondaires apparaissent au survol **et** au focus. |
| « Masqué si nul » | Masquer une décoration inutile ; garder les entrées nécessaires pour comprendre une fonction ou sortir d'un état vide. |
| « Un seul point d'entrée par geste » | Une action principale par zone ; un accès contextuel peut compléter l'accès global s'il répond à un autre moment du parcours. |
| « La Revue est le seul écran aéré » | La densité suit la tâche ; le risque se dit par le texte, la portée et la confirmation. |
| Toute l'identité d'une collection repose sur sa bande | Couleur, nom et hiérarchie se complètent ; la sélection doit rester identifiable indépendamment de la famille. |

## 1. Hiérarchie visuelle

Chaque zone possède un titre, un contenu principal et ses actions. Le titre
du signet prime sur les étiquettes ; les étiquettes priment sur les métadonnées
secondaires. Le nombre d'étiquettes visibles s'adapte à la place, avec une
commande « +N » pour accéder aux autres.

Conserver les fonds neutres chauds en clair et les surfaces gris profond en
sombre. Trois niveaux suffisent : fond d'application, panneau de travail,
surface superposée. Réserver les ombres discrètes aux superpositions qui
doivent se détacher ; tester leur utilité réelle avant de les généraliser.

La couleur de collection conserve son rôle de repérage. Les bandes actuelles
restent le point de départ ; comparer leur intensité avec une variante plus
calme avant de changer leurs jetons. La couleur ne porte jamais seule une
information ou un état.

## 2. Typographie et densité

Valeurs de départ pour les maquettes, à vérifier dans WebKit :

| Usage | Proposition |
|---|---|
| Texte et titre de signet | 14 px, interligne 1,4 à 1,5 |
| Métadonnées | 12 px minimum |
| URL à comparer | 12 px monospace, adresse complète accessible |
| Titre de section | 20–22 px, graisse 600 |
| Titre de page ou fiche | 24–28 px, graisse 600 |
| Lecture longue | 17–18 px serif, interligne 1,6, largeur 60–70 caractères |
| Ligne de bibliothèque | Comparer 40 px à l'actuel 36 px ; conserver un mode compact si nécessaire |
| Navigation et contrôles | 32 px comme point de départ ; surface cliquable distincte de la taille de l'icône |
| Action principale de formulaire/Revue | 36–40 px |

La police système reste la base. La monospace sert les URL et les blocs de
code. Une police nommée dans la charte doit être disponible ou avoir un repli
assumé : aucune dépendance visuelle à une police installée par hasard.

Échelle d'espacement commune : 4, 8, 12, 16, 24, 32 px. Réserver les valeurs
particulières aux contraintes natives et aux alignements optiques documentés.

## 3. Boutons, champs et états

Trois niveaux d'action : principal (fond contrasté), secondaire (surface ou
bordure discrète), contextuel (icône ou texte discret). Une action principale
par zone de travail. Le rouge n'est pas l'accent général de l'application.

Les actions métier se lisent : « Ajouter le signet », « Restaurer »,
« Revérifier les liens », « Mettre à la corbeille ». Dans une Revue,
remplacer le générique « Exécuter » par le verbe de l'opération.

Chaque contrôle définit : repos, survol, focus clavier, activation,
indisponibilité, opération en cours et erreur. Le survol ne déplace rien.
Une action indisponible indique la condition manquante quand elle n'est pas
évidente. Pendant une écriture, bloquer sa répétition et nommer l'opération.

Les champs possèdent un libellé persistant ; le placeholder donne un exemple.
Une réponse tardive ne doit pas écraser une nouvelle saisie. Une erreur
conserve le brouillon et propose une reprise cohérente avec l'opération.

Séparer les jetons de diagnostic des liens des jetons d'erreur d'interface :
une panne de connexion et un lien mort n'ont pas le même sens.

## 4. Navigation, recherche et filtres

La vue courante se distingue par une surface et un signe supplémentaire
(graisse ou repère), sans dépendre uniquement de la teinte. Le dépliage d'une
collection est une action distincte de sa sélection ; le chevron exprime
son état. Réexaminer l'ouverture au survol si elle provoque des déplacements
de cibles pendant la navigation.

Les filtres actifs restent visibles, retirables individuellement et
effaçables ensemble, même sans résultat. Un bouton « Filtres » rend la
fonction découvrable sans exiger de focaliser la recherche.

Stabiliser l'ordre des natures pendant la session. Ne pas conclure qu'une
nature n'existe pas dans la collection à partir des seules pages chargées.
Le calcul de disponibilité ne doit pas déclencher un balayage complet.

Dans la palette, l'option active reste visible au clavier. Les résultats
tardifs ne changent pas silencieusement la cible d'Entrée. Chargement,
absence de résultat et échec sont des états distincts.

## 5. Composition des écrans

- **Bibliothèque :** titre et recherche en tête, filtres actifs dessous,
  contenu au centre, actions de sélection près de la sélection.
- **Lecture :** largeur de texte limitée ; fiche disponible tant que la
  largeur permet une lecture confortable ; retour à la position précédente.
- **Nettoyage :** diagnostic, fraîcheur et action suivante lisibles ensemble.
  « Jamais analysé », « Analyse partielle » et zéro résultat restent distincts.
- **Revue :** action nommée, portée exacte, exclusions éventuelles, conséquence
  et confirmation. Masquer la fiche latérale tout en conservant la sélection
  pour le retour. Conserver les niveaux de confirmation métier actuels.
- **Réglages :** sections lisibles et zone défilante bornée à la fenêtre ;
  titre et fermeture restent accessibles.

La grille ne doit pas sacrifier le contenu central aux colonnes fixes.
À petite largeur, permettre de replier les panneaux et conserver toutes
les commandes. Dans les lignes longues, réserver une place aux actions
avant de tronquer le texte. La mosaïque doit borner le nombre de tuiles
rendues, tout en conservant le clavier et le glisser-déposer.

## 6. Accessibilité et retours utilisateur

Objectifs internes de validation : contraste du texte courant au moins
4,5:1 ; indicateurs de focus et signes essentiels au moins 3:1 contre leurs
surfaces adjacentes. Mesurer les couleurs effectivement rendues dans les
deux thèmes ; ces objectifs ne constituent pas une déclaration de conformité.

Le focus est visible, non rogné et suit un ordre logique. Une fenêtre modale
possède un nom, reçoit le focus, contient Tab/Shift+Tab et restitue le focus
à sa fermeture. Échap agit sur la couche active uniquement.

Toute action au survol possède un accès clavier ; toute action de
glisser-déposer possède une alternative. Les infobulles complètent les noms
visibles ou accessibles, sans porter seules une instruction nécessaire.

Un état vide explique le contexte et propose une action pertinente. Une
erreur indique ce qui a échoué, ce qui a été conservé et la prochaine action.
Un résultat partiel annonce les réussites et les échecs séparément.

Respecter la réduction des animations. Les confirmations et progressions
ne doivent jamais dépendre d'une animation ou d'une couleur pour être comprises.

## 7. Validation et adoption

Comparer d'abord trois écrans : bibliothèque avec fiche, Nettoyage avec
résultats et Revue. Vérifier chacun en clair/sombre à 960 × 600 et
1280 × 800, avec titres longs, étiquettes nombreuses, chargement, erreur et
absence de résultat. Tester clavier seul, zoom et lecteur d'écran.

La première itération doit permettre de juger la taille du texte, la
densité, la présence des actions et la force des couleurs. Les valeurs
proposées ci-dessus deviennent définitives après cette comparaison.

Après validation, intégrer les règles retenues à `DESIGN.md`, déplacer
l'historique des décisions dans un document séparé et maintenir une table
des jetons et variantes réellement implémentés. Distinguer explicitement
les règles adoptées des écarts encore ouverts dans le code.

Référence de fiabilité : `audits/2026-10-15/README.md`. La nouvelle charte
complète les corrections de l'audit ; elle ne les remplace pas.
