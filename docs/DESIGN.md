# DESIGN.md — la direction visuelle de Raindrop-GUI

> Ce document fait foi sur l'apparence. Toute tâche du plan 2 qui dessine un
> composant s'y réfère — sans quoi chaque écran diverge. Le vocabulaire métier
> est dans `DOMAINE.md`, les décisions structurantes dans la spec.
>
> Maquette de référence : canvas « Raindrop-GUI — Interface » (six plans :
> liste, mosaïque, fiche, arborescence, vocabulaire, Revue).

## 1. Ce que l'application est

Un outil de **diagnostic et de réparation** pour une bibliothèque de 12 210
liens qui se dégrade. L'utilisateur y est conservateur de sa collection : il
repère ce qui ne va pas, puis le corrige sans rien casser. L'interface est
compacte par défaut et ne respire qu'à deux endroits — la fiche d'un lien et la
Revue de l'action.

## 2. Les signaux, distingués par la forme

Quatre informations coexistent. **Trois sont colorées, et ne se distinguent
jamais par la seule couleur** : chacune a sa forme propre. La quatrième — la
nature du contenu — n'en porte aucune.

| Signal | Forme | Couleur | Sens |
|---|---|---|---|
| Collection d'origine | pastille ronde, 18 px | thématique | un contenant |
| Étiquette | pilule, hauteur 18 px (21 en détail) | thématique | une thématique |
| État du lien | filet de 3 px en bord de ligne | diagnostic | un diagnostic |
| Nature du contenu | glyphe au trait, 15 px | **aucune** | ce que c'est |

L'état **n'apparaît que sur les éléments à problème** : une ligne saine porte
donc trois signaux, une ligne à réparer quatre. C'est le plafond — et c'est
précisément pourquoi le quatrième ne peut pas être coloré.

**Pourquoi la nature ne prend pas de couleur.** Une quatrième teinte rendrait
les trois autres illisibles — on ne lit pas quatre codes couleur dans une ligne
de 36 px. La nature se lit à la **forme du glyphe**, et se filtre depuis la
barre de recherche (§11). Observation à l'appui (relevée le 2026-09-16 dans
l'app mymind, qui n'a pourtant aucune contrainte de signalétique) : ses puces
de type sont des glyphes monochromes sur fond neutre, quand ses étiquettes
d'espace portent un anneau coloré. La séparation forme/couleur s'impose d'elle-même
dès qu'on veut afficher les deux à la fois.

### 2.1 Les glyphes de nature

Le champ `type` de Raindrop prend six valeurs et une seule à la fois. Chacune a
son glyphe, tracé selon §9 (SVG, trait 1,6–1,8, grille 15–16 px) et teinté en
`quiet` — jamais en couleur de thématique.

| `type` | Glyphe | Tracé |
|---|---|---|
| `link` | maillon | deux arcs ouverts qui s'entrecroisent |
| `article` | feuillet | page avec trois filets de texte |
| `image` | vue | cadre, un mont, un disque en haut à gauche |
| `video` | lecture | cadre, triangle plein centré |
| `document` | document | page à coin replié |
| `audio` | onde | trois barres verticales de hauteurs inégales |

Le glyphe se place **avant le domaine**, dans le même filet de texte secondaire,
et partage sa couleur. Il ne prend ni fond, ni bordure, ni pilule : c'est une
lettre de plus dans la ligne du domaine, pas un badge.

**Depuis le 2026-09-20, le glyphe est accompagné de son libellé en toutes
lettres** (« Lien · exemple.com », « Vidéo · exemple.com ») en liste et en
grille : une icône à deviner n'identifie pas — le nom de la nature se lit,
il ne se reconnaît pas. Le libellé est singulier (la nature de *l'item*), là
où les puces de §11 portent les catégories plurielles.

### 2.2 L'étiquette retenue

Une étiquette **cliquée entre dans le filtre** ; recliquée, elle en sort. Deux
étiquettes retenues s'**intersectent** — ce n'est pas un choix d'interface :
l'API n'offre que ça (`#a OR #b` ne rend pas l'union, « OR » y est un mot
comme un autre). L'interface ne propose donc aucun ET/OU.

La pilule retenue **inverse ses deux valeurs** — le fond prend la clarté de
l'encre, l'encre celle du fond — **et garde sa teinte**. C'est son rôle qui
change, pas son identité : elle reste reconnaissable comme l'étiquette de sa
thématique (§3), et aucune couleur nouvelle n'entre dans le système. Sans
cette marque, une étiquette déjà posée inviterait à refaire ce qui est fait,
et son clic surprendrait en défaisant.

Les étiquettes retenues se relisent **en rangée sous la recherche**, chacune
retirable d'un clic, avec un « et » entre elles. C'est l'application de « un
filtre posé ne peut pas devenir invisible » (§9) au cas le plus dur : quand
un filtre à trois étiquettes ne rend rien, il n'y a plus une seule ligne à
l'écran où lire ce qui filtre.

## 3. La symbolique des couleurs

La teinte vient de ce qu'un mot **signifie**, jamais de son orthographe. Un
lexique range chaque étiquette et chaque collection dans une thématique.

| Thématique | Teinte (oklch H) | Ce qu'elle range (extrait) |
|---|---|---|
| santé | 25 | santé, médecine, sport, psychologie, handicap, sécurité |
| maison | 62 | maison, cuisine, recette, bricolage, jardin, logement |
| éducation | 90 | école, collège, lycée, cours, exercice, maths, svt, annales |
| méthode | 120 | outil, service, application, productivité, référence, tuto |
| argent | 150 | achat, finance, banque, budget, emploi, entreprise |
| lieux | 195 | voyage, carte, ville, pays, transport, Pyrénées |
| technique | 250 | code, dev, python, linux, wordpress, css, réseau, ia |
| création | 300 | design, typographie, graphisme, image, illustration, 3d |
| culture | 345 | lecture, livre, musique, film, jeu, conte, théâtre, média |
| **hors lexique** | — | **gris (chroma 0)** |

Le tableau donne un **extrait** : la liste fait foi dans
`src/design/lexique.ts`, seul endroit où elle vit. L'y recopier en entier
condamnerait ce document à mentir dès la première étiquette ajoutée.

**`éducation` a été ajoutée le 2026-09-19**, en neuvième. Elle n'est pas un
raffinement : sur une bibliothèque réelle de 12 210 signets, des dizaines
d'étiquettes (école-primaire, collège, exercices, annales, svt, physique-chimie)
ne trouvaient leur sens dans aucune des huit autres — les ranger ailleurs aurait
trahi la règle même de ce paragraphe. Son 90 tombe entre `maison` (62) et
`méthode` (120) : **28° de part et d'autre, contre 37 pour l'écart le plus
serré auparavant.** C'est le prix d'une neuvième teinte sur un cercle déjà
occupé ; une dixième demanderait de rouvrir la question du pas, pas seulement
d'y glisser une valeur.

**Clarté et chroma sont identiques pour toutes les thématiques** : aucune ne
crie plus fort qu'une autre. Seule la teinte varie.

Un mot absent du lexique reste **gris**, délibérément : le gris se remarque, il
désigne une étiquette à classer, et il se corrige en étendant le lexique. Une
couleur tirée au hasard aurait caché la lacune.

Le lexique est en français et destiné à grandir. Il vit dans un seul fichier et
ne demande aucune configuration utilisateur.

**Le pluriel ne compte pas.** « livres » vaut « livre », « jeux vidéos » vaut
« jeu vidéo » — chaque mot du groupe est ramené au singulier avant la
recherche. Ce n'est pas une entorse à la règle d'ouverture : un pluriel
signifie exactement ce que signifie son singulier, et c'est de l'orthographe,
comme les accents déjà retirés. Mesure avant/après sur la bibliothèque réelle :
**75 % des étiquettes affichées sortaient grises, contre 3 % ensuite** — les
deux tiers de cet écart venaient des pluriels et des groupes de mots, pas de
mots manquants.

## 4. Collections : une couleur par famille

216 collections sur trois niveaux. **Une seule teinte par famille, et une
teinte par famille : la racine la décide, toutes ses descendantes en
héritent.**

La teinte est *dérivée* de la couleur Raindrop de la racine (sinon de la
thématique de son titre, sinon rien — gris, §3), mais elle n'en est pas la
copie. Mesuré le 2026-09-17 : les douze racines colorées se pressaient dans
deux zones du cercle — les orangés de 16° à 95°, les bleus de 211° à 250° —
quand il en compte 360. « Vie pratique » et « Web » étaient à **0,1°** l'une
de l'autre, « Enseignement » et « Download » à 2° : à l'œil, la même couleur,
et la signalétique de famille ne distinguait plus rien.

Les teintes sont donc **écartées à intervalle constant en gardant leur
ordre** : la plus chaude le reste, la plus froide aussi, mais chacune gagne
l'écart qu'il faut pour se lire (30° avec douze racines). Le prix est assumé —
une couleur peut s'éloigner franchement de celle réglée dans Raindrop ; ce
qu'elle garde, c'est son rang.

**Un écart de teinte ne suffit pas : encore faut-il qu'il se voie.** Les
bandes de navigation ont donc leur propre clarté et leur propre chroma
(`--app-nav-l`, `--app-nav-c`), plus soutenus que le lavis de §6. Au lavis
d'origine — clarté 0,95, chroma 0,035 — deux familles voisines mesuraient
**ΔEok 0,013**, sous le seuil de perception de 0,02 : les teintes étaient
distinctes, l'œil ne les distinguait pas. Augmenter le seul chroma n'y
changeait rien, car si près du blanc la couleur demandée sort du gamut sRGB
et le navigateur la ramène vers ses voisines. Le couple retenu, mesuré dans
l'application, est **(0,90 ; 0,075)** : ΔEok 0,031 en clair, 0,035 en sombre,
le texte gardant 12,5:1 et 9,1:1.

Une première version faisait primer la couleur de chaque collection. Les onze
sous-collections de « PASSIONS » arrivaient alors en onze teintes : la famille
ne se lisait plus. Repérer une famille d'un coup d'œil vaut mieux que
restituer 56 couleurs individuelles.

**La hiérarchie ne passe donc pas par la teinte, mais par l'intensité et le
décrochement.** Une descendante tire son lavis vers le fond de l'application,
et **sa bande démarre sous la pastille de sa mère** (`--nav-retrait`) : le
décrochement dit le rang avant même qu'on lise le titre. Le titre d'une racine
porte enfin la graisse — c'est elle qui nomme la famille.

**Le survol explore, le clic fixe.** Survoler une collection déplie ses
enfants le temps qu'on y passe ; **cliquer** — sur la collection ou sur son
chevron — les **épingle**, et le clic suivant les referme. Le geste ne part
jamais de l'état affiché mais de l'épinglage : survolé, un groupe est déjà
ouvert, et basculer depuis là le refermerait au clic même qui demandait de le
retenir. Un repli explicite tient aussi pour le groupe qui porte la vue
courante, que sa qualité de « courant » rouvrirait sinon aussitôt.

Dans la barre, la pastille mesure 22 px et son fond reste la surface `work`,
**non teintée** : posée sur une bande qui porte déjà la couleur de la famille,
une pastille de la même teinte ne se détachait pas. C'est le dessin qu'elle
contient qui garde la teinte. Les bandes sont franchement arrondies (rayon 9)
et séparées de 2 px : sans cet air, elles se touchent et l'arrondi ne se voit
qu'aux extrémités d'un groupe.

Le **pastel n'est pas un traitement** : `.coll-icon` peint
`oklch(var(--app-wash-l) var(--app-wash-c) var(--h))`, dont la clarté et le
chroma sont des jetons du thème (0,95/0,035 en clair, 0,32/0,05 en sombre).
Fournir la teinte suffit — un rouge vif de Raindrop et une teinte du lexique
sortent au même niveau de douceur, dans les deux thèmes.

L'icône vient de Raindrop quand elle existe (champ `cover`), **posée sur** sa
teinte et non à sa place : à pleine taille elle masquait le fond, et les
collections qui en ont une perdaient toute couleur. Sinon, ou si la vignette
distante ne se charge pas, un dossier teinté : **jamais une case vide**.

Dans la barre latérale, la teinte ne se limite pas à l'icône : **l'entrée
entière porte le lavis**, sur toute la largeur et d'une bande à l'autre de
même longueur — parents et enfants compris, le retrait d'arbre vivant à
l'intérieur de la bande. Le **survol entoure** d'un trait de la même teinte,
plus soutenu ; il ne recolore pas le fond, qui appartient à la collection.
La vue courante, elle, assombrit son propre lavis : §6 dit que l'état se
marque par la surface, et « jamais une teinte » s'y lit désormais « jamais
une teinte **étrangère** ». La cible d'un dépôt prend un trait plus épais et
neutre — sur une barre où tout est teinté, un lavis de plus ne dirait pas
« c'est ici que ça tombe ».

**Chaque lien reprend la signalétique de sa collection** : carré arrondi dans la
liste, teinte de la vignette en mosaïque, fil d'Ariane dans la fiche.

## 5. États d'un lien

La **forme** distingue autant que la couleur — un lien mort et une redirection
restent différenciables sans percevoir le rouge et l'ambre.

| État | Marque | Couleur |
|---|---|---|
| sain | *aucune* | — |
| lien mort | trait plein | `--broken` |
| redirection | pointillé large (4 px / 4 px) | `--moved` |
| vérification impossible | pointillé fin (1 px / 2 px) | `--unsure` |
| doublon | double trait vertical | `--ink` |

En liste la marque borde la ligne ; en mosaïque elle coiffe la vignette.

**Une ligne ne porte qu'UNE marque, et « mort » l'emporte sur « doublon ».**
Un signet peut être les deux — sur la bibliothèque réelle, 1 032 signets sont
en doublon et rien n'interdit qu'ils soient morts. La priorité va au verdict du
lien : un lien cassé ne se répare pas en rangeant. Conséquence à connaître, la
marque n'est pas stable d'une analyse à l'autre — un signet marqué « doublon »
avant l'analyse des liens peut passer à « mort » après, et c'est bien ce qu'on
veut lui voir dire.

⚠️ **L'absence de marque ne certifie rien.** Elle recouvre trois états : vérifié
sain, jamais vérifié, et périmé au sens du TTL de 30 jours. La liste principale
ne prétend donc pas être un bilan de santé : ce que l'on sait et ce qu'on ignore
se lit au **Nettoyage**, dont les compteurs disent « jamais analysé » plutôt que
zéro. Marquer la ligne est un signal de plus, jamais une garantie de propreté.

## 6. Jetons

| Rôle | Clair | Sombre |
|---|---|---|
| `surface` fond d'app | `#FBFAF9` | `#161618` |
| `work` panneau de travail | `#FFFFFF` | `#1E1E21` |
| `ink` texte principal | `#17171A` | `#ECECE9` |
| `quiet` texte secondaire | `#6E6E75` | `#9B9BA2` |
| `line` filets et bordures | `#E7E5E2` | `#2C2C30` |
| `sel` ligne sélectionnée | `#F0EFEC` | `#2A2A2E` |
| `hover` survol | `#F5F4F1` | `#252528` |
| `broken` lien mort | `#A8301C` | `#E06A52` |
| `moved` redirection | `#8A6410` | `#D4A03C` |
| `unsure` indéterminé | `#9A9A96` | `#6B6B68` |

Couleurs dérivées, en oklch avec la teinte de la thématique :

| Usage | Clair | Sombre |
|---|---|---|
| fond d'étiquette / d'icône | `L .94 C .045` / `L .95 C .035` | `L .30 C .05` / `L .32 C .05` |
| texte d'étiquette / trait d'icône | `L .42 C .11` / `L .62 C .11` | `L .80 C .09` / `L .68 C .11` |

**Pas d'accent de marque.** Dans cet outil, une couleur qui ne signifie rien
n'existe pas : la sélection se marque par une surface, pas par une teinte.

## 7. Typographie

**Police système** (`ui-sans-serif, -apple-system, BlinkMacSystemFont`) pour
toute l'interface : elle s'aligne sur macOS et ne coûte aucun chargement sur des
listes virtualisées de 12 000 lignes.

**IBM Plex Mono** pour les URLs et les domaines, **et rien d'autre** — comparer
`exemple.fr/page?utm_source=x` à `exemple.fr/page` caractère par caractère *est*
le travail lors de la détection de doublons et de redirections. Une chasse fixe
aligne les différences ; une proportionnelle les cache.

| Rôle | Taille | Graisse |
|---|---|---|
| titre de fiche / de Revue | 26–28 px | 590, `letter-spacing: -0.015em` |
| titre de section | 21 px | 590 |
| titre dans le détail | 15 px | 590 |
| texte courant | 13 px | 400 |
| secondaire, compteurs | 12 px | 400 |
| URLs (mono) | 11 px | 400 |

Corps de texte : `line-height: 1.5–1.6`, `text-wrap: pretty`, largeur limitée à
~76 caractères.

## 8. Densités

| Élément | Hauteur | Remarque |
|---|---|---|
| ligne de liste | 36 px | titre + étiquettes + domaine ; ~22 visibles |
| nœud d'arbre | 26–28 px | retrait 14 px par niveau, filet de 2 px |
| entrée de navigation | 28 px | |
| tuile de mosaïque | 221 px de large **minimum** | vignette au ratio 221:118, titre sur 2 lignes. Les colonnes s'étirent (`minmax`) pour remplir le panneau — le reliquat de largeur ne reste plus vide sur la droite (renversé le 2026-09-20 à la demande de l'utilisateur ; la décision d'une largeur exacte était délibérée, son commentaire l'attestait) |
| action engageante | 38 px | Revue uniquement |

Rayons : pastille ronde (collection), 7 px (ligne, champ), 9–11 px (panneau,
tuile, bande de navigation).

**Pas d'ombre portée, sauf une** : la hiérarchie vient du niveau de surface.
L'exception est la **bande de collection**, qui porte une ombre très basse —
elle n'imite pas un relief, elle détache la bande du fond et de ses voisines,
là où douze teintes voisines et un simple filet d'air ne suffisaient pas à
séparer douze familles. Aucun autre élément n'en prend.

## 8bis. L'en-tête plein-fond

Depuis le 2026-09-20, la fenêtre macOS porte `titleBarStyle: "Overlay"` et
`hiddenTitle` : les **trois pastilles se posent sur NOTRE en-tête**, qui
reste le nôtre — même surface, même filet, aucun chrome simulé. Deux
conséquences que ce document tient :

- **La réserve des pastilles est un MUR, pas un remplissage** : ~76 px de
  vide à gauche du premier contrôle, lui-même poignée de déplacement
  (`data-tauri-drag-region`). Les vides de l'en-tête traînent la fenêtre ;
  les contrôles restent des contrôles — l'attribut ne porte que l'élément
  qui le porte.
- **Le premier rendu naît dans la surface `app` claire** (`backgroundColor`
  de la fenêtre), pas dans le blanc WebKit. En sombre, l'éclair initial
  demeure — le dynamique exigerait de lire l'apparence macOS au création
  de la fenêtre, gardé pour quand il dérange.

**Le mouvement est une préférence** : `prefers-reduced-motion: reduce`
coupe TOUTES les transitions et animations de l'interface (règle globale
de styles.css). L'interface étant volontairement pauvre en mouvement,
l'arrêt global ne coûte rien — et ne rate rien, là où un bloc par classe
en ratait.

## 8ter. Vues sauvegardées

Une vue filtrée peut être nommée : elle vit dans la barre latérale, entre
les vues fixes et Collections, dans l'ordre de création. Elle se lit comme
une vue fixe — même hauteur (28 px), même typographie, même surface de
sélection (`--color-app-sel`) — la surface porte la sélection, jamais une
teinte (§9). Pas de compteur : la vue rejoue ses filtres, elle n'affiche
pas ce qu'elle contient. Le répertoire vide masque la section entière ;
son échec de chargement se dit en une ligne discrète sous le titre.

Les deux commandes — renommer (crayon), supprimer (croix) — sont
**révélées au survol, jamais posées** : posées à demeure, elles mangeraient
la largeur de chaque ligne pour un geste rare. Absolues à droite de la
ligne, opacité nulle au repos, révélation au survol ET au focus
(`focus-within`) — le clavier les atteint comme le pointeur.

Le geste de création vit dans la **TopBar**, à côté de la bascule
d'affichage : un marque-page (glyphe `marquePage`), présent **seulement
quand un filtre est actif** — sauvegarder une vue non filtrée n'a pas de
sens, et le tri seul n'est pas un filtre. Le clic déplie un champ inline,
prérempli de la recherche ou de la première étiquette retenue ; Enter pose
(coche), Échap annule. La suppression d'une vue ne frappe jamais : une
smart list se recrée en trois clics — la frappe SUPPRIMER reste aux gestes
irréversibles.

## 9. Règles

- **L'écran ne surcharge jamais.** Seuls les icônes et éléments strictement
  nécessaires au geste courant de la zone sont posés. Tout le reste sort de
  l'écran — révélé au survol ou au focus, ou nulle part. Règles dérivées :
  - **Révélé, pas posé** — une action contextuelle n'existe visuellement
    qu'au survol ou au focus (actions de ligne, puces de nature §11).
  - **Une icône par geste** — pas de redondance icône + texte, sauf les
    verbes qui détruisent ou exécutent (« Mettre à la corbeille »,
    « Exécuter »).
  - **Masqué si nul** — compteurs, sections et contrôles sans contenu
    courant ne s'affichent pas. *Exception : un tableau de bord dont le
    rôle est d'annoncer ce qu'on peut lancer garde ses entrées à zéro —
    les six compteurs du Nettoyage restent posés, sinon l'écran cesse de
    dire ce qu'il sait faire.*
  - **Un seul point d'entrée par geste** — un même geste n'a qu'un seul
    contrôle visible à l'écran.
  - **Le texte est l'exception** — l'identité se dessine (icône, teinte,
    forme) ; le texte n'apparaît que pour ce qui ne se dessine pas :
    états, comptes de la Revue, frappe de confirmation.
  - **Toute icône seule porte son `aria-label`** (issu de `fr.ts`), et
    `aria-pressed` quand c'est une bascule d'état. Une épure qui prive un
    contrôle de son nom accessible n'épure pas, elle déplace la dette.
  - **Bouton-état contre champ** — un contrôle qui *applique* aussitôt et
    nomme l'état courant s'habille en bouton-état (`.etat` : pas de
    bordure de champ, libellé courant, chevron). Un contrôle qui *prépare*
    une action qu'un bouton exécute ensuite reste un champ (`.input`) :
    les `<select>` de destination du BulkBar et des lignes de nettoyage
    sont des saisies, pas des états.
  - **Le focus clavier est un anneau `quiet`, le clic ne montre rien.**
    `:focus-visible` uniquement : un anneau posé au clic ferait clignoter
    l'interface sous la souris, et son absence au clavier rendrait la
    navigation aveugle. Le jeton de la sélection (`sel`) avait été retenu
    d'abord — même idée, « l'endroit où je suis » — mais il est fait pour
    remplir une surface, pas pour tracer un trait de 2 px : **mesuré à
    1,10:1 sur le fond clair et 1,26:1 sur le sombre**, contre le seuil de
    3:1 qu'un indicateur de focus doit tenir. L'anneau ne se voyait pas, et
    toute la navigation au clavier avec lui. `quiet` tient 4,85:1 en clair
    et 6,54:1 en sombre, et reste sobre.
  - **Une bascule dont le contenu est la réponse ne marque pas son état** —
    l'icône liste/mosaïque nomme le mode vers lequel elle bascule, et c'est
    la liste elle-même qui dit celui qu'on regarde. Ne pas y remettre une
    paire de boutons : ce serait deux contrôles pour un geste.
- **Pas de cartes pour une liste.** Les cartes gaspillent le vertical et
  transforment un outil de tri en catalogue. La mosaïque est un mode, pas un
  style par défaut.
- **Aucune bordure là où un changement de surface suffit.** Les trois panneaux
  se distinguent par leur fond.
- **Icônes dessinées en SVG**, trait de 1,6–1,8, grille de 15–16 px, jamais
  d'emoji.
- **Espacement par `gap`**, jamais par marges successives ni par espaces dans la
  source.
- **Mouvement réservé aux réponses à une action** (pliage, ouverture,
  confirmation, **survol**). Aucune animation d'entrée. Le survol d'une bande
  de collection ouvre son ombre en 140 ms — assez pour qu'on voie la bande
  réagir, trop court pour qu'on attende. **Jamais la géométrie** : animer une
  largeur ou une marge ferait travailler la mise en page de toute la barre à
  chaque passage du pointeur. Et `prefers-reduced-motion` coupe la
  transition sans rien retirer des états.
- **Le vide signale l'irréversible** : la Revue est le seul écran aéré, et c'est
  ce contraste qui avertit, mieux qu'un bandeau rouge.

## 10. Écrire les textes

Interface **en français**, textes centralisés dans `src/i18n/fr.ts`.

Un bouton nomme ce qui va se produire — « Mettre à la corbeille », pas
« Valider » — et garde le même mot dans tout le parcours. Les erreurs disent ce
qui s'est passé et comment le corriger, sans s'excuser. Un écran vide est une
invitation à agir, pas un constat.

## 11. Filtrer par nature

La spec §4.1 promet des « filtres avancés » que rien n'annonçait à l'écran,
tandis que la TopBar alignait sept contrôles de même poids — dont un `<select>`
de nature que personne ne remarquait. Au **focus** du champ de recherche, une
rangée de puces apparaît sous le champ et nomme les natures disponibles ; elle
disparaît au blur si aucune n'est active.

Les filtres **rares** — domaine, dates — suivent la même mécanique un cran plus
bas : l'icône de réglages de la barre déplie un panneau sous la rangée de
nature, et ce panneau reste déplié tant qu'un de ses filtres est actif. Il
porte alors, et alors seulement, « Effacer les filtres » (§9, « masqué si
nul ») — sans quoi replier laisserait un filtre posé que plus rien ne retire.
La barre ne garde donc que trois commandes : la recherche, le tri (bouton-état)
et la bascule d'affichage (une icône).

- Une puce par nature — glyphe §2.1 + libellé français (`Liens`, `Articles`,
  `Images`, `Vidéos`, `Documents`, `Audio`).
- **Ordonnées par fréquence décroissante dans les items chargés de la vue
  courante** — pas dans la bibliothèque entière : aucun compteur par nature
  n'existe côté API, et un plein scan est exclu (spec §3.4). L'ordre reflète
  donc ce que l'utilisateur a sous les yeux ; à fréquence égale, il retombe
  sur celui du tableau §2.1.
- **Une nature absente de la vue n'a pas de puce** (§9, « masqué si nul ») :
  elle ne filtrerait rien, et la cliquer viderait la liste. Une vue vide ne
  montre donc aucune puce. Seule exception, la puce **active** : elle reste
  posée même retombée à zéro, sinon tomber à zéro résultat ferait disparaître
  la seule commande capable de retirer le filtre.
- Cliquer une puce pose le filtre de nature ; la recliquer le retire. Une puce
  active prend la surface `sel`, **jamais une teinte**.
- Hauteur 26 px, rayon 7 px, fond `work`, texte `quiet` — ce sont des commandes,
  pas des étiquettes : elles ne doivent pas se confondre avec les pilules
  thématiques de §2.

La nature est une propriété que Raindrop calcule et que nous ne corrigeons
jamais : ces puces **filtrent**, elles n'éditent rien.

## 12. Le mode lecture

Le contenu archivé se lit DANS l'app, en texte extrait — pas le HTML de la
page : ses CSS manquent, la fidélité n'y rendrait qu'une page cassée.

- **Colonne serif** (`ui-serif, Georgia` — police système, zéro chargement,
  même parti que §7), 17 px, `line-height: 1.6`, largeur ~66 caractères
  (`max-w-[66ch]`), sur la surface `app`. Le texte est un TEXTE : ni images,
  ni liens, ni mise en forme d'origine (v1, assumé spec §8). La feuille
  `.lecture-corps` habille les vrais éléments reconstruits : titres serif à
  leur taille (1,55/1,3/1,12em, poids 600), respirations entre blocs — le
  preflight de Tailwind les avait aplatis en mur de texte —, citations au
  filet `app-border`, code en chasse fixe sur `app-sel`, liens hérités de
  l'encre au soulignement discret qui se fonce au survol (pas d'accent :
  §7). Tout en jetons — le thème sombre est gratuit.
- **Une ligne de tête discrète** : provenance (« Archive locale » / « Copie
  permanente »), **date de l'archive** et temps de lecture, séparés par des
  points médians — lire sans montrer la fraîcheur de ce qu'on lit cacherait
  la moitié du diagnostic. La barre vit hors du défilement, posée comme une
  bande ombrée de la fenêtre (`app-sel`) : l'issue « Fermer » reste sous la
  main, le rebond macOS ne l'emmène pas. Le titre, le domaine, la collection
  et les étiquettes vivent dans la fiche voisine : les dupliquer ferait deux
  sources de vérité.
- **Une barre de position** (3 px, en tête de la fenêtre) suit
  l'avancement de la lecture — présentative (`aria-hidden`) : la barre
  native du système dit déjà où l'on est ; celle-ci ne porte qu'un trait
  calme (`app-muted` sur `app-border`), jamais une couleur de diagnostic.
- **Pendant la lecture, les étiquettes ne se lisent qu'en la fiche** (§2) :
  la ligne de tête n'en porte aucune. (Le rail les rendait en une ligne de
  texte, pas des pilules : une pilule inerte aurait fait douter de celles
  de la fiche, une pilule cliquable aurait quitté la lecture — il a cédé
  sa place à la ligne de tête, **amendé le 2026-09-22**, lot inversion
  fiche ↔ lecture.)
- **Les surlignages restent dans la fiche** — le mode lecture ne les
  duplique pas (v1).
- **La fiche accompagne la lecture** (colonne de droite, 320 px) : le clic
  d'un signet de bibliothèque ouvre le contenu lu, les actions d'édition
  restent visibles pendant la lecture. « Lire » y disparaît quand c'est
  déjà ce signet qu'on lit — un seul point d'entrée par geste (§9). La
  sélection reste — en revenant, la fiche est encore là.
- Chaque échec de lecture porte SA raison (archive disparue, garde de
  64 Mo, archive défectueuse, extraction vide), avec « Voir la page » en
  issue de secours — jamais un zéro, jamais un blanc (§5 des états).
