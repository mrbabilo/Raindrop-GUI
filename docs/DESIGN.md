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
| Collection d'origine | carré arrondi 18 px, rayon 5 | thématique | un contenant |
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

## 3. La symbolique des couleurs

La teinte vient de ce qu'un mot **signifie**, jamais de son orthographe. Un
lexique range chaque étiquette et chaque collection dans une thématique.

| Thématique | Teinte (oklch H) | Mots-clés |
|---|---|---|
| technique | 250 | code, dev, informatique, python, rust, linux, mac, api, serveur, git, test |
| création | 300 | design, webdesign, typographie, graphisme, couleur, art, photo, ui, ux |
| argent | 150 | achat, finance, banque, budget, prix, vente, boutique, comparer |
| maison | 62 | maison, cuisine, recette, bricolage, jardin, déco, matériel |
| santé | 25 | santé, médecine, sport, urgent, important, sécurité |
| lieux | 195 | voyage, carte, ville, pays, transport, hôtel, restaurant |
| culture | 345 | lecture, livre, article, veille, musique, film, podcast, presse |
| méthode | 120 | outil, service, application, productivité, référence, guide, archive |
| **hors lexique** | — | **gris (chroma 0)** |

**Clarté et chroma sont identiques pour toutes les thématiques** : aucune ne
crie plus fort qu'une autre. Seule la teinte varie.

Un mot absent du lexique reste **gris**, délibérément : le gris se remarque, il
désigne une étiquette à classer, et il se corrige en étendant le lexique. Une
couleur tirée au hasard aurait caché la lacune.

Le lexique est en français et destiné à grandir. Il vit dans un seul fichier et
ne demande aucune configuration utilisateur.

## 4. Collections : la couleur appartient à la racine

216 collections sur trois niveaux. **La collection racine porte la couleur de sa
thématique ; ses descendantes en héritent** — filet vertical et fond d'icône
compris. On repère une famille sans lire les titres.

L'icône vient de Raindrop quand elle existe (champ `cover`, **68 collections sur
216**), avec sa couleur dominante (`color`). Sinon : un dossier teinté de la
thématique, **jamais une case vide**.

> ⚠️ `toCollection` (`sidecar/api/mappers.ts`) ne garde aujourd'hui ni `cover`
> ni `color`. Le type partagé `Collection` doit les exposer pour que ceci soit
> affichable.

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
| tuile de mosaïque | 221 px de large | vignette 118 px, titre sur 2 lignes |
| action engageante | 38 px | Revue uniquement |

Rayons : 5 px (icône), 7 px (ligne, champ), 9–11 px (panneau, tuile).
Pas d'ombre portée : la hiérarchie vient du **niveau de surface**, pas de l'ombre.

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
  confirmation). Aucune animation d'entrée.
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
