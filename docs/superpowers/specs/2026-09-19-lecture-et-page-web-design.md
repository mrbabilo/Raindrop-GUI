# Spec — Lecture du contenu archivé et page web réelle

**2026-09-19** — validée avec l'utilisateur le jour même ; l'approche et les
sections ont été approuvées en revue avant rédaction. Cette spec rouvre
**explicitement** une case du §12 de la spec principale (le mode lecture,
tenu pour Phase 2) : le choix d'ouverture appartient à l'utilisateur, il
l'a fait en demandant la feature.

## 1. La demande, et les deux gestes

« Il manque un affichage de la page web (webview) — online / issu de
l'archivage. » Décomposé avec l'utilisateur, la demande tient en DEUX gestes
distincts, tous deux retenus :

1. **Lire** — le contenu archivé, confortablement, DANS l'app : le mode
   lecture que §12 dessinait déjà (texte serif ~66 caractères ; le rail
   de métadonnées à droite dessiné alors a cédé sa place à la ligne de
   tête — **amendé le 2026-09-22**, spec inversion). Le contenu vient de
   l'archive locale, de la copie permanente Pro, et seulement en repli
   du web.
2. **Voir la page réelle** — l'état du web AUJOURD'HUI, pour juger d'un lien
   avant de le corriger ou le supprimer. Rendu réel dans une fenêtre webview
   créée par le shell — pas le navigateur système, qui existe déjà sur l'URL.

Un seul point d'entrée en v1 : la **fiche** (panneau détail). **Amendé le
2026-09-22 (spec inversion)** : le clic principal des vues de bibliothèque
(liste, mosaïque, vue collection) ouvre directement la lecture — « lecture
sinon fiche », jamais un écran d'échec d'un clic ; la fiche accompagne la
lecture en colonne. Les vues de Nettoyage gardent clic → fiche.

## 2. Décisions tranchées avec l'utilisateur

| Question | Tranché | Écarté, et pourquoi |
|---|---|---|
| Usage | Les deux gestes | Un seul geste perdrait soit le confort, soit l'état réel |
| Forme de la lecture | **Texte extrait**, rendu dans notre typographie | HTML archivé brut : ses CSS et images externes manquent, la page sort cassée — fidèle, rarement lisible |
| Conteneur de la page réelle | **Fenêtre webview** dédiée, sans barre d'adresse | Iframe dans l'app : bloquée par X-Frame-Options sur la plupart des gros sites ; navigateur système : on quitte l'app |
| Transport du contenu archivé | **Approche A** — le sidecar sert le HTML décompressé en flux, le front extrait le texte | B : protocole custom Tauri — mécanisme Rust nouveau, auth par navigation insoluble (le jeton ne voyage pas en URL, trap §Traps), deux canaux pour une donnée. C : extraction côté sidecar — réintroduit la copie entière en mémoire côté serveur, le défaut corrigé le matin même sur l'écriture, et jsdom en dépendance lourde contre un DOMParser natif |

## 3. La chaîne de lecture

Sources, par priorité, dans cet ordre :

1. **Archive locale** — `<dossier>/archives/<id>.html.gz`. Présence déjà
   connue du front (le marqueur « Archivé », `useArchives`).
2. **Copie permanente Pro** (`cache.status === "ready"`) — si aucune archive
   locale : la télécharger D'ABORD par la route d'archivage existante
   (`POST /api/backup/archive`, un seul identifiant, SSE, garde de
   réentrance), puis lire l'archive produite. L'archive est de toute façon ce
   que l'utilisateur veut posséder ; la lecture ne duplique donc aucun
   chemin de téléchargement.
3. **Ni l'une ni l'autre** — « Lire » est désactivé avec sa raison ; « Voir
   la page » reste le seul geste.

**Route nouvelle** : `GET /api/backup/archives/:id/content` (Bearer, comme
toute l'API locale). Le sidecar décompresse le `.html.gz` **en flux**
(`createGunzip` chaîné à la réponse) — jamais la copie entière en mémoire,
la leçon de l'écriture (§Traps lot 2026-09-18) appliquée à la lecture.
**Garde de décompression : 64 Mo** au-delà desquels la route refuse avec une
raison nommée. La couverture est MESURÉE, pas présumée (2026-09-19) :
`cache.size` est la taille **stockée** — rapport 1,00 avec le
`Content-Range` de S3 — et la décompression réelle d'une copie donne
**1,5×** (une copie de 4 Ko est même stockée en clair, sans
`Content-Encoding` : la recompression à l'écriture reste nécessaire). Le
p99 stocké (31,5 Mo) sort donc à ~47 Mo décompressé, sous la garde ; seuls
les au-delà de ~42 Mo stockés la rencontreront. Le budget d'archives, lui,
reste cohérent tel quel : il compte des octets stockés, comme le disque. L'identifiant est validé entier avant de
construire le nom de fichier — aucun chemin négociable.

**Extraction, côté front** (DOMParser, natif du webview, zéro dépendance) :
`<article>`, puis `[role=main]`, puis `<main>`, puis le conteneur
div/section dont le `textContent` est le plus long, puis le corps. On retient les **blocs whitelistés** dans l'ordre du document
(p, h1–h6, li, blockquote, pre), leurs **inlines typés** (gras, italique,
liens `http(s)`) et les **images de l'archive** (`src` `http(s)` ou
`data:image` seulement) — **aucun `innerHTML` nulle part** : le rendu est
reconstruit en arbre DOM (createElement + textContent, whitelist fermée),
l'injection de contenu archivé est exclue par construction, et aucune
« sanitisation » n'a à être crue.
**Amendé le 2026-09-21** (arbitré avec l'analyse Karakeep,
`docs/KARAKEEP.md`) : la v1 initiale réduisait la lecture à du texte nu ;
un texte est un extrait, pas une lecture — le rendu filtré donne la
lecture vraie pour le même invariant de sécurité. Le **temps de lecture**
(≈ 220 mots/min, calculé sur l'extraction) rejoint le rail.

**Rendu** : vue pleine largeur de l'app (l'extension de la fiche que §12
dessinait) — colonne serif ~66 caractères, rail droit de métadonnées (titre,
domaine, collection, étiquettes, badge « archive locale » ou « copie
permanente », **date de l'archive** — la route la porte dans un en-tête
`X-Archive-Date`, mtime du fichier : lire sans montrer la fraîcheur de ce
qu'on lit serait cacher la moitié du diagnostic), bouton de fermeture qui revient à la vue d'origine
(`returnView`, même règle que la Revue : **l'aller ne prouve rien sans le
retour**). Les surlignages restent dans la fiche — le mode lecture les ne
duplique pas en v1.

## 4. La fenêtre webview (page réelle)

Commande Tauri **`ouvrir_page_web(url)`** dans `commandes.rs` :

- **Validation au bord Rust** : schéma `http` ou `https` uniquement — jamais
  `file://`, jamais l'origine de l'app, jamais rien d'autre. Une URL refusée
  rend une erreur nommée, pas un panique.
- **Fenêtre étiquetée par empreinte de l'URL** : rouvrir la même URL
  concentre la fenêtre existante au lieu d'en multiplier.
- **ZÉRO capability** : `capabilities/default.json` ne liste que `main` ;
  la fenêtre créée par le shell pour le contenu externe doit rester hors de
  toute liste — aucun accès IPC, aucun plugin. C'est le point de sécurité
  de tout le lot : **à vérifier explicitement à l'implémentation**, pas à
  présumer. Un site dans cette fenêtre est un œil, pas une main.
- Le site injoignable y affiche l'erreur de WebKit lui-même — c'est une
  vraie page de navigateur ; l'app n'en décore pas davantage.
- Côté front, un helper unique : sous l'origine Tauri il invoque la
  commande ; hors Tauri (dev navigateur, tests) il retombe sur
  `window.open`.

## 5. États et erreurs — jamais un zéro inventé

- Pas d'archive, pas de copie : « Lire » désactivé **avec sa raison** (§10 :
  le bouton nomme ce qui manque).
- Téléchargement à la demande : progression « téléchargement de la copie
  permanente… » via le composant de job d'archivage existant (SSE, résultat,
  échecs individuels nommés).
- Archive introuvable au moment de lire (supprimée entre le marqueur et le
  clic) : 404 nommé de la route.
- **Budget d'archives plein** au moment du téléchargement à la demande : la
  route d'archivage le rapporte (`nonTentes`, `raisonArret`, garde posée le
  2026-09-19) — l'état est nommé tel quel, avec « Voir la page » en issue.
  Le refuser en silence ferait croire à une panne.
- **Copie Pro en échec côté Raindrop** : `cache.status` a six valeurs
  (`ready`, `retry`, `failed`, `invalid-origin`, `invalid-timeout`,
  `invalid-size`) — « Lire » désactivé distingue « pas de copie » de « copie
  en échec (raison) », qui n'appellent pas le même geste.
- Gz corrompu, garde de 64 Mo atteinte, extraction vide : chacun un état
  nommé dans le mode lecture, avec « Voir la page » en issue de secours.

## 6. Tests

**Sidecar** : la route sert un HTML décompressé FIDÈLE (fixture gzippée
réelle) ; 404 nommé sur identifiant sans archive ; identifiant non entier
refusé ; la garde de 64 Mo coupe avec sa raison ; un gz corrompu est un
refus, pas un plantage. Sabordés.
**Front** : les heuristiques d'extraction (priorités, repli corps, extraction
vide) ; le mode lecture (rendu du texte, rail, badge, **fermer ramène bien à
la vue d'origine**) ; « Lire » désactivé avec raison ; le déclenchement du
téléchargement quand seule la copie Pro existe.
**Rust** : le refus de schéma (file://, javascript:, origine de l'app) ;
l'acceptation http/https.
**Réel** : la lecture sur de vraies archives, la fenêtre sur de vrais sites —
à l'utilisateur, comme toujours.

## 7. Documentation liée

- **Spec principale §12** : le mode lecture est amendé — « tranché et livré
  le 2026-09-19 » (comme le fut `cache` avant lui) ; la fenêtre webview y
  est ajoutée comme geste distinct.
- **DESIGN.md** : section pour la forme du mode lecture (serif, 66
  caractères, rail, badge) — la direction visuelle fait foi, elle doit dire
  cette surface.
- **ROADMAP** : l'entrée « Hors ligne » garde ce qui lui appartient (les
  écritures refusées proprement, le thème system à chaud) ; la consultation
  hors ligne des archives est CE lot, il en sort.
- **i18n** : toutes les chaînes de la surface (libellés des deux boutons,
  états, raison de désactivation, badge).

## 8. Limites assumées en v1

- Rendu FILTRÉ, pas fidèle : seuls les blocs et inlines whitelistés se
  rendent (formulaires, tableaux, iframes, scripts… sont jetés) — l'archive
  complète reste consultable par « Voir la page ». Les images de l'archive
  se rendent (src web de la page d'origine : hors ligne, elles manquent —
  la copie Pro ne stocke pas les assets).
- **Les surlignages ne se repositionnent pas dans le contenu lu (phase 2,
  blocant nommé)** : Karakeep y parvient parce qu'il possède l'archive ET
  des offsets numériques ; Raindrop n'expose que le TEXTE du surlignage —
  le repositionnement serait une recherche de chaîne, fragile (texte
  coupé/reformaté par l'extraction). Ils restent dans la fiche.
- Page réelle = web vivant : ce geste n'existe pas hors ligne, par
  définition.
- 64 Mo décompressés : au-delà, refus nommé (voir §3).
- **Un seul point d'entrée (la fiche) ; les lignes et tuiles n'y viennent
  pas en v1** — amendé le 2026-09-22 : le clic inversé les y amène
  (`docs/superpowers/specs/2026-09-22-inversion-fiche-lecture-design.md`).
- **Une fenêtre par URL consultée** : l'étiquetage par empreinte concentre
  les réouvertures d'une MÊME URL, mais deux pages différentes ouvrent deux
  fenêtres — assumé en v1, où l'usage attendu est « consulter puis fermer ».
- **Extraction sans garantie de qualité** : l'heuristique (§3) n'est pas un
  Readability — une page à dominante navigation extraira son menu. L'état
  « extraction vide » est nommé ; une extraction *pauvre* n'est pas
  détectable à peu de frais.
