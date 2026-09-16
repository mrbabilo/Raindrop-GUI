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

## 2. Les trois signaux, distingués par la forme

Trois informations colorées coexistent. **Elles ne se distinguent jamais par la
seule couleur** : chacune a sa forme propre.

| Signal | Forme | Sens |
|---|---|---|
| Collection d'origine | carré arrondi 18 px, rayon 5 | un contenant |
| Étiquette | pilule, hauteur 18 px (21 en détail) | une thématique |
| État du lien | filet de 3 px en bord de ligne | un diagnostic |

L'état **n'apparaît que sur les éléments à problème** : une ligne ordinaire ne
porte que deux signaux.

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
