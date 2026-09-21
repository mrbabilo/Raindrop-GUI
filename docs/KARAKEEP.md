# KARAKEEP.md — analyse de référence de conception

Analyse de [Karakeep](https://karakeep.app) v0.33.2 (ex-Hoarder), exploré sur
l'instance de démonstration (`try.karakeep.app`) le 2026-09-21, surface par
surface. Ce document est une **référence d'inspiration** : ce que fait un
produit voisin, ce qui vaut le coup pour Raindrop-GUI, ce qui n'en fait pas
partie — et pourquoi. Il n'engage rien par lui-même ; les idées retenues
passent par la ROADMAP.

## 1. Ce qu'est Karakeep

Un read-it-later / gestionnaire de signets **self-hosté** (open source), avec
IA intégrée (tagging et résumé automatiques), archivage local multi-format
(lecteur extrait, capture d'écran, PDF, page HTML complète), recherche plein
texte, webhooks, API, extensions navigateur et apps mobiles. Fil conducteur du
produit : **tout ce que tu sauves t'appartient** — le contenu est archivé en
local et consultable hors ligne sous quatre formes.

Leurs réglages (masqués en démo, documentés) couvrent : apparence, IA,
import (Raindrop, Pocket, HTML), export, webhooks, clés API.

## 2. Cartographie des surfaces

### Dashboard (bookmarks)

- Masonry à colonnes étroites ; **cartes hétérogènes par type** : un lien rend
  sa couverture, une note rend son texte en pleine hauteur, un asset rend
  l'image entière. La grille ne contraint pas à une hauteur uniforme.
- Composer « NEW ITEM » épinglé en tête de grille (⌘E) : coller un lien,
  écrire une note, déposer une image.
- Chaque carte : tags cliquables, domaine • date (→ preview), favori (étoile),
  preview ↗, menu ⋯, et un « Bulk Edit » **par carte**.
- Bandeau d'état (mode démo) en tête de contenu, permanent.

### Preview (fiche) — deux onglets

- **Content** (par défaut) : le contenu archivé rendu dans une fenêtre de
  lecture, avec **six modes en dropdown** — Page Overview / Reader View /
  Screenshot / Archived PDF / Archived Page / Video — grisés quand le format
  n'est pas archivé. Réglages typographiques et plein écran. Les highlights
  s'affichent **surlignés dans le contenu lui-même**.
- **Details** : titre éditable, View Original, métadonnées (ajouté / auteur /
  publié), **résumé auto**, tags éditables (✨ = posés par l'IA), note, pièces
  jointes, listes, statistiques.

### Reader plein écran (`/reader/:id`)

Une page séparée, hors dashboard : chrome minimal (fermer, imprimer, réglages
typographiques, surligneur), colonne de lecture, temps de lecture, auteur.
Une **surface de lecture à part entière**, imprimable et surlignable — pas un
overlay du dashboard.

### Tags

Create Tag, Bulk Edit, **Drag & Drop Merging** (fusionner en glissant une
étiquette sur l'autre), tri par usage, recherche locale. Séparation
**« Your Tags » vs « AI Tags »** (posés par vous vs posés automatiquement).

### Highlights

Page dédiée : recherche dans les surlignages, citation avec barre de couleur,
date relative, lien vers la source, suppression. Deux existences du
highlight : surligné **dans le contenu lu**, et indexé **dans cette page**.

### Lists

Cartes épinglées vs toutes ; emoji + description + compteur ;
**Public/Private** (partage web public d'une liste) ; barre de couleur par
liste ; et **smart lists** : des listes définies par une *requête
sauvegardée* (« Youtube = smart list of all youtube links ») qui se peuplent
automatiquement.

### Search

Une page dédiée à la recherche, avec un langage d'opérateurs documenté
(tags, domaines, types, dates — cf. docs.karakeep.app, Guids/search-query-language).

### Menu carte

Edit, Unfavorite, Archive, Copy Link, **Manage Lists**, **Offline Copies →**
(reader / screenshot / PDF / HTML), More, Delete.

## 3. UI/UX et ergonomie — les forces

- **L'hétérogénéité assumée des cartes** : la masonry n'impose pas une
  hauteur uniforme — une note respire, un lien rend sa cover.
- **Le contenu avant la fiche** : cliquer une carte ouvre le *contenu lu*
  (Content par défaut), Details en onglet secondaire.
- **Les actions en pied de carte**, jamais en surimpression de l'image.
- **Le « Bulk Edit » par carte** : le mode multi-sélection est joignable
  depuis n'importe quelle carte.
- **Le reader plein écran est une page séparée**, imprimable et
  surlignable — pas un overlay.
- **Les highlights existent aux deux endroits** : surlignés dans le contenu
  lu, et indexés dans une page dédiée.

## 4. UI/UX et ergonomie — les faiblesses

- Masonry à deux colonnes en fenêtre étroite : largeur gaspillée, aucune vue
  liste compacte (pas de densité).
- Quatre chemins vers la même carte (titre, date, preview, ↗) — des
  doublons de point d'entrée.
- Les tags IA noient les tags humains (50+ automatiques vs 1 manuel en
  démo) : la séparation existe, la place visuelle non.
- Bruit permanent : bandeau de mode démo, notification de release en barre
  latérale.
- Ergonomie clavier absente des grilles (⌘E seul documenté).

## 5. Design

Design *shadcn/ui* (primitifs Tailwind) : propre, gris et violet, neutre au
point de ne rien dire. Le violet des tags IA est la seule couleur
sémantique. Typographie système, titres gras serrés. Le **reader est le seul
endroit avec une vraie direction typographique** (serif, colonne mesurée,
hiérarchie d'article). Aucune symbolique de famille par couleur — notre
geste « couleur par collection » (DESIGN §4) n'a pas d'équivalent chez eux.

## 6. Transpositions pour Raindrop-GUI

### Convergences (nos choix confortés)

| Notre décision | Leur confirmation |
|---|---|
| Mode lecture + page web réelle (spec 2026-09-19, plan prêt) | Leur Reader View + plein écran valide le pattern : surface de lecture dédiée, chrome minimal, typo réglable, surligneur |
| Highlights en lecture seule (phase 1) | Une page Highlights à part entière ; la phase 2 a un modèle |
| Diagnostics honnêtes (journal) | Leur démo ne dit rien de son état interne ; nous faisons mieux |

### À acter (idées retenues, par ordre de valeur)

1. **Vues sauvegardées (« smart lists »)** — une liste définie par requête
   (ex. tous les `#rust` non lus) nommée dans la barre latérale, qui vit et
   se met à jour. Tous les ingrédients existent chez nous (opérateurs de
   recherche, vues paramétrées) ; c'est la fonctionnalité la plus haute
   valeur de leur produit qui nous manque. → ROADMAP.
2. **Inverser fiche ↔ lecture quand la lecture existe** : le clic principal
   ouvre le *contenu lu*, la fiche passe en onglet secondaire (leur
   Content par défaut / Details en onglet). → à intégrer au plan
   lecture/page-web.
3. **Highlights surlignés dans le contenu lu**, pas seulement listés dans la
   fiche — dépasse la phase 1 (lecture seule), à négocier avec Raindrop.
   → ROADMAP, phase 2.
4. **Drag & drop de fusion d'étiquettes** dans la vue Tags — notre fusion
   actuelle est un formulaire là où le geste attendu est une poignée.
   → ROADMAP.
5. **Afficher ce qui est archivé par carte/fiche** (leur « Offline Copies »)
   — notre copie permanente + archives locales sont déjà en place, il
   manque la *visibilité* : ce qui existe, et l'ouverture. → à relier au
   marqueur archive de la fiche.

### Hors périmètre (et pourquoi)

- **IA tagging / résumé** : phase 2 (Stella) ; leur UI des ✨ est un bon
  canevas quand viendra le moment.
- **Self-hosting, multi-comptes, webhooks, clés API** : notre raison d'être
  est le compte Pro Raindrop — Raindrop reste la seule source de vérité.
- **Upload d'assets** : hors de ce que Raindrop expose.

## 7. Ce que ce produit nous apprend, en une phrase

Leur valeur vient de trois choix : le contenu lu est la surface principale,
le contenu archivé existe sous plusieurs formes visibles, et les listes
peuvent être des requêtes vivantes — les trois parlent directement à notre
roadmap, deux d'entre elles gratuitement.

## 8. Sous le capot — implémentations notables (source : github.com/karakeep-app/karakeep)

Monorepo TypeScript : `apps/web` (Next.js), `apps/workers` (files de jobs),
`apps/mobile`, `packages/db` (SQLite/Drizzle), `packages/shared` (le langage
de recherche y vit), `packages/shared-react` (composants).

### La recherche est un moteur interne, pas un délégataire

`packages/shared/searchQueryParser.ts` : un **vrai parser** (typescript-parsec)
qui transforme la saisie en arbre de matchers typés, compilé en SQL
(drizzle) côté serveur. Grammaire : `AND`/`OR` explicites, parenthèses,
négation (`-`, `!`), qualifieurs `is:`, `url:`, `list:`, `after:`, `before:`,
`age:`, `feed:`, `title:`, `tag:`, `source:`, `#tag`, dates relatives.
**Contraste architectural avec nous** : Karakeep possède ses données et son
moteur ; Raindrop-GUI délègue la recherche à Raindrop et **compose des
opérateurs dans `search=`** (`#tag`, `domain:`, `type:` — sondés un par un,
car non composables entre eux au-delà de l'intersection). Leur grammaire est
plus riche parce qu'ils paient le moteur ; nous économisons le moteur au
prix de l'intersection seule.

### Smart lists : une requête stockée, réutilisant le MÊME parser

`packages/db/schema.ts` : `lists.type: "manual" | "smart"` + `lists.query`
(le texte de recherche brut — réinterprété à chaque lecture par le parser
ci-dessus), + listes imbriquées (`parentId`), + `rssToken` (chaque liste a
un flux RSS) + `public`. La smart list n'a AUCUNE logique propre : c'est une
chaîne stockée et le parser partagé. **Transposition directe chez nous** :
une vue ListPane sérialisée (`listQueryArgs`) dans la barre latérale —
notre `listQueryArgs` joue le rôle de leur parser.

### Highlights : offsets numériques dans le contenu extrait

`packages/shared/types/highlights.ts` : `startOffset`/`endOffset` numériques
+ couleur (palette fixe) + note. Le rendu réapplique ces offsets au DOM du
contenu extrait (`BookmarkHtmlHighlighter.tsx` : sélection → popover
couleur/note). Le contenu lu étant **leur propre archive**, les offsets sont
stables — c'est ce que Raindrop fait côté serveur (nos highlights sont
normalisés par le mapper). Les offsets sont la raison pour laquelle leur
phase « surligner » est simple et la nôtre dépendra de l'archive Raindrop.

### L'évaluation de la qualité du lecteur

`apps/workers/workers/utils/readerViewAssessment.ts` : avant de proposer le
mode Reader, un **classifieur versionné** (`READER_VIEW_CLASSIFIER_VERSION`)
note la page : `isProbablyReaderable` (Readability), schémas JSON-LD
(Article vs Product/SearchResults), densité de phrases finies, avec un
**score et des raisons** (`ZReaderViewReason`). Notre spec lecture nomme
« extraction vide » et assume qu'une extraction pauvre n'est pas détectable
« à peu de frais » — leur code montre que le frais existe et est borné
(heuristiques sur le DOM). → candidat pour la phase 2 de notre spec
lecture : classer les extractions (bonne/mauvaise) plutôt que binaire.

### L'archivage : crawler headless + extraction en subprocess

`apps/workers/workers/crawler/` : Playwright headless (`crawlPage`,
`browser.ts`, `autoconsent.ts` — clic automatique des bannières de
cookies), et **l'extraction tourne dans un subprocess isolé**
(`parseSubprocess.ts`) : une page qui crashe le parseur ne tue pas le
worker — le même motif que notre limite « CLI » et notre subprocess MCP.
Les quatre formats (reader HTML, screenshot, PDF, full HTML) sortent de ce
pipeline.

### Un moteur de règles automatiques

`ruleEngineWorker.ts` : des règles du type « si tag X, ajouter à la liste Y »
évaluées à l'ajout. Phase 2 (Stella) pour nous — le canevas produit
existe.

### Leçon transversale

Karakeep paie son indépendance (moteur de recherche, crawler, workers,
bases) ; nous déléguons ces mécanismes à Raindrop Pro et gagnons la moitié
du code — mais **leurs parsers et leurs schémas sont publics** : quand une
de nos compositions d'opérateurs bute sur une limite, leur grammaire liste
ce qui EST possible côté Raindrop, et leur code montre l'implémentation.
