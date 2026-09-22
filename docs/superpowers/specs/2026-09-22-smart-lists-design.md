# Spec — Smart lists (vues sauvegardées)

**2026-09-22** — arbitrage d'origine : `docs/KARAKEEP.md` §8 (« une requête
stockée, réutilisant le MÊME parser »), porté à la ROADMAP depuis l'audit.
Les trois décisions structurantes ont été tranchées avec l'utilisateur le
jour même. Amende la ROADMAP (entrée soldée à la livraison) et DESIGN
(nouvelle section pour la barre latérale).

## 1. La demande

Les filtres de la liste (étiquettes, recherche, domaine, dates, nature,
non-taggés) se composent à chaque session et s'effacent à sa fin. Une
**smart list** est une vue filtrée **nommée dans la barre latérale**, qui
vit : elle rejoue ses filtres à chaque ouverture et se met à jour comme
n'importe quelle liste. Chez Karakeep, la smart list n'a **aucune logique
propre** — une chaîne stockée, réinterprétée par le parser de recherche.
Chez nous, le parser existe : **`listQueryArgs`** (`src/hooks/listQuery.ts`),
le seul endroit où les filtres d'une vue « list » deviennent une requête.

## 2. Décisions tranchées avec l'utilisateur

| Question | Tranché | Écarté, et pourquoi |
|---|---|---|
| Le geste de création | **Depuis la vue** — un bouton « Sauvegarder la vue » dans la TopBar, visible seulement quand un filtre est actif | « + » dans la barre latérale : créer une vue à froid, sans la composer d'abord, n'a pas de sens — le geste naît là où la vue existe |
| Ce qui est stocké | **La vue entière** — collection de rattachement, filtres ET tri | La requête globale seule (littéral Karakeep) : une smart list ancrée à une collection (« #rust dans Py ») est le cas d'usage réel |
| La gestion en v1 | **Renommer + supprimer** depuis la barre latérale | L'éditeur de filtres d'une smart list existante : recréer coûte trois clics et n'ajoute aucun état |

## 3. Les données (sidecar)

Nouveau module `sidecar/smartlists/` — le dépôt JSON en app-data, patron
`trash-origins.json` (dépôt déclaré dans `sidecar/index.ts`, fichier hors du
dépôt git) :

```jsonc
{ "smartlists": [ {
    "id": "sl-…",        // identifiant stable (généré)
    "label": "Rust",     // nom lisible, borné (validation zod)
    "vue": {             // la forme sérialisable d'une vue "list"
      "collectionId": 0, "notag": false,
      "search": "", "tags": [], "sort": "created-desc",
      "media": null, "domain": "", "createdStart": "", "createdEnd": ""
    },
    "cree": "2026-09-22T…" } ] }
```

**Aucune logique propre** : la vue stockée est rejetée telle quelle dans le
`View` par le clic de la barre latérale ; `listQueryArgs` fait le reste —
c'est lui, notre parser. Routes sous `/api/smartlists` : GET (liste), POST
(créer — le front envoie label + vue, le sidecar fixe id et date), PATCH
(renommer), DELETE. Validation zod sur chaque route ; le nom est borné
(non vide, longueur plafonnée) — une smart list n'est pas un dépotoir. La
vue reçue exige `collectionId` (nombre), le reste est optionnel avec ses
défauts — une vue minimale « Tous » filtré est légale. Les
**pseudo-collections** sont stockables comme les autres : sauvegarder la
Corbeille ou les Favoris filtrés est un filtre sur un contenant, pas un
cas spécial. Fichier JSON illisible → **liste vide** (le patron du dépôt) :
l'app ne casse pas, la section barre latérale dit son état.

## 4. La création — depuis la vue

Dans la **TopBar**, un bouton « Sauvegarder la vue » apparaît quand la vue
« list » courante porte **au moins un filtre actif** (étiquettes retenues,
recherche, domaine, dates, nature, non-taggés). Le tri seul ne déclenche
pas le bouton — « Tous triés par titre » n'est pas une smart list — mais le
tri **voyage** avec la vue stockée. Clic : un petit formulaire inline dans
la TopBar (champ nom **prérempli de la recherche** si elle existe, sinon du
nom de la première étiquette retenue, sinon laissé vide ; Enter ou bouton
pour poser) → POST → invalidation `["smartlists"]` →
l'entrée apparaît dans la barre latérale. Échap annule.

## 5. La barre latérale

Une section **« Vues sauvegardées »** entre les vues fixes et Collections,
dans l'ordre de création. Chaque entrée :

- clic → `go({ kind: "list", ...vue, label, smartlistId })` — le `View`
  « list » gagne un **`smartlistId?: string`** : le surlignage de l'entrée
  active se lit sur l'identifiant, pas sur une heuristique de label ;
- **renommer** au survol (crayon → champ inline, Enter pose) → PATCH ;
- **supprimer** (croix au survol) → DELETE, **sans frappe de confirmation** :
  une smart list n'est pas la bibliothèque — elle se recrée en trois clics,
  la frappe SUPPRIMER reste aux gestes irréversibles (§8, collections).

**La surlignage ne survit pas à la divergence.** Tout `patch` de filtre
appliqué à la vue courante **efface `smartlistId`** : l'entrée reste
surlignée tant que la vue est intacte — dès qu'un filtre bouge, la vue
n'est plus « la » smart list, et la barre latérale doit le dire. De même,
supprimer la smart list **ouverte** efface l'identifiant de la vue (la
liste filtrée reste à l'écran — ce sont des filtres, pas un fichier) ;
après un **renommage**, la vue ouverte garde son libellé d'origine jusqu'à
la prochaine ouverture — assumé.

## 6. Cas aux bords

- **La collection rattachée disparaît** (supprimée au Nettoyage) : la smart
  list reste, **vide** — les items ne viennent plus, la vue ne casse pas.
  Le même parti que les collections vides du Nettoyage.
- **Les étiquettes ou le domaine filtrés disparaissent** de la bibliothèque :
  la liste se vide d'elle-même — c'est une vue, pas un instantané.
- **Un filtre modifié DANS la smart list ouverte** ne réécrit pas la smart
  list : la vue courante diverge, la smart list stockée reste — pas
  d'écriture fantôme (v1 sans éditeur, §2).
- **Nom en doublon** : permis — deux vues « Rust » divergentes sont deux
  smart lists ; l'identifiant les distingue.
- **Filtres modifiés dans la vue ouverte** : la smart list stockée reste —
  et le surlignage s'efface (§5). Pas d'écriture fantôme (v1 sans éditeur).
- **Hors ligne / sidecar arrêté** : la section barre latérale rend son état
  d'échec nommé, comme les autres requêtes (§5 des états).

## 7. Tests

- **Sidecar** : CRUD complet sur le dépôt (créer → lire → renommer →
  supprimer), persistance réelle du JSON en répertoire temporaire, zod
  refuse nom vide / trop long / vue incomplète, id généré par le sidecar.
- **Front (TopBar)** : le bouton n'existe pas sans filtre actif, existe
  avec (étiquette retenue, recherche, domaine — un cas chacun suffit) ;
  création → POST portant la vue sérialisée + invalidation.
- **Front (Sidebar)** : la section rend les smart lists ; le clic rejoue la
  vue (les items de la liste en témoignent) ; l'entrée active est
  surlignée via `smartlistId` ; renommer et supprimer frappent les routes.
- **Le surlignage ne ment pas** : changer un filtre dans la smart list
  ouverte efface la marque active ; supprimer la smart list ouverte aussi
  (la liste filtrée reste). Sabordés comme les autres.
- **Sabordage** : le test du bouton filtré (actif/inactif) et celui de la
  navigation sont sabotés (réintroduire le défaut, voir le test échouer).

## 8. Limites assumées (v1)

- Pas d'**édition** des filtres d'une smart list existante : on supprime et
  on recrée — trois clics, aucun état d'édition à maintenir.
- Pas d'**imbrication** (`parentId` de Karakeep), pas de **partage**, pas de
  **flux RSS**, pas d'**icônes** personnalisées, pas de **réordonnancement**
  de la section (l'ordre est celui de la création — les collections se
  réordonnent, pas encore les smart lists).
- La smart list vit **dans cette installation** (app-data) : pas de synchro
  Raindrop — l'API n'en offre pas, et la bibliothèque reste la seule source
  de vérité.

## 9. Documentation liée

- **DESIGN.md** : nouvelle section pour « Vues sauvegardées » dans la barre
  latérale — la direction visuelle fait foi, elle doit dire cette surface
  (placement, survol crayon/croix, état actif).
- **ROADMAP** : l'entrée « Vues sauvegardées (« smart lists ») » passe en
  Soldé à la livraison.
- **i18n** : toutes les chaînes nouvelles dans `src/i18n/fr.ts` (bouton,
  formulaire, section, crayon, croix, états d'échec).
