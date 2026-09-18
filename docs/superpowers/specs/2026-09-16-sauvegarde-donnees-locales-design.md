# Sauvegarde et couche de données locale — design

> Spec complémentaire à `2026-09-15-raindrop-gui-design.md` (la spec principale).
> Elle **amende** son §11 : la réplication locale n'est plus hors périmètre.
> Toutes les constantes ci-dessous ont été vérifiées **contre l'API réelle** le
> 2026-09-16, jamais sur la foi de la documentation.

## 1. Contexte et objectifs

L'utilisateur demande la sauvegarde intégrale de ses données Raindrop et, à
terme, une consultation hors ligne avec synchronisation. La bibliothèque réelle
compte **12 210 bookmarks** (la spec principale en supposait > 5 000).

Deux mesures orientent tout le design :

| Quantité | Volume | Conséquence |
|---|---|---|
| Métadonnées des 12 210 bookmarks | **~11 Mo** | une réplique locale est triviale |
| Copies permanentes Pro (74 % des items, 2,1 Mo en moyenne) | **~18,7 Go** | l'archivage des pages doit être **à la demande** |

L'écart est de 1 700×. Confondre les deux sous le mot « intégral » conduirait à
concevoir un système de plusieurs heures pour un besoin de deux minutes.

## 1bis. Corrections issues de la relecture critique (2026-09-18)

Ces points sont **contraignants** : ils corrigent des décisions qui, telles
qu'écrites, ne tenaient pas.

1. **La pagination ascendante ne protège pas des suppressions** (§4.2). Elle
   règle les créations ; une suppression en amont du point de lecture décale la
   suite vers l'arrière et fait **sauter** un élément, que l'incrémental par
   `-lastUpdate` ne rattrapera jamais. Parade : **réconciliation par
   identifiants** en fin de balayage, rejeu unique, puis instantané marqué
   incomplet si l'écart persiste. Sans cela, §5.3 promettait une fidélité qu'il
   ne pouvait pas tenir.
2. **`archives/` n'avait ni rétention ni règle d'orphelins** (§5.4) : hors des
   instantanés horodatés, la rotation ne le touchait pas. Ajouté : purge des
   orphelins à chaque balayage complet, et budget `ARCHIVES_MAX_GO` (5 Go) avec
   éviction du plus ancien.
3. **La file prioritaire pouvait affamer la sauvegarde** (§4.4) : « ce qui
   reste » peut ne jamais venir. Ajouté : un plancher d'**une requête sur
   quatre**, qui porte le pire cas du balayage à ≈ 9 min mais garantit qu'il
   finit.
4. **Le watermark n'était pas défini en cas d'égalité de dates** (§5.2).
   Ajouté : comparaison `>=`, une page de recouvrement, dédoublonnage par `_id`.
5. **Le saut vers S3 se suit à la main** (§5.4) : suivi automatiquement,
   l'en-tête `Authorization` serait réémis vers une URL déjà signée.
6. **L'avertissement de confidentialité ignorait `archives/`** (§3.5), qui
   porte le corps complet des pages — l'artefact le plus sensible de
   l'arborescence.
7. **`manifest.json` s'écrit atomiquement**, et **changer de dossier ouvre un
   arbre neuf** sans adopter ni déplacer l'ancien (§6).
8. **`sort=created` ascendant est désormais mesuré** (§10) — l'argument du §4.2
   reposait dessus sans qu'il figure parmi les constantes vérifiées, contre la
   règle que cette spec se donne elle-même. Le §7 disait « 307 » là où §5.4 et
   §10 ont mesuré **303** : corrigé.

## 1ter. Écarts constatés à la livraison (2026-09-18)

Le lot est livré. Ces deux points **ne sont pas tenus** par le code : ils sont
écrits ici plutôt que tus, parce que le §1bis existe précisément pour interdire
de promettre une fidélité qu'on ne tient pas — et qu'une spec qui décrit autre
chose que le code livré est la forme la plus durable de cette faute.

1. **La reprise après coupure n'est pas implémentée.** §4.2, §5.1, §6 et §7 la
   décrivaient comme acquise. En réalité `ouvrirJsonl` **tronque** le fichier à
   chaque ouverture (comportement voulu : un rejeu de balayage doit réécrire,
   pas doubler — et c'est verrouillé par un test), et `ErreurHttpRaindrop`
   porte bien un `status` structuré mais **personne ne le lit**. Un 429 ou un
   timeout en cours de balayage avorte le job entier. L'implémenter suppose une
   pause bornée sur le 429 et un retry réseau **sur les lectures seulement,
   jamais les écritures**. Inscrit à `docs/ROADMAP.md`.

2. ~~**L'archivage des copies permanentes n'est pas déclenchable.**~~
   **Corrigé le 2026-09-18.** `archiver()` n'avait aucun appelant : le §2
   annonçait « archivage des copies permanentes à la demande » sans que rien
   ne puisse le déclencher, et les deux règles de rétention (§5.4) tournaient
   contre un dossier que rien ne remplissait. Le câblage est livré
   (`sidecar/backup/archivage.ts`, route `POST /api/backup/archive`, bornée à
   500 identifiants). Le §2 est désormais tenu **côté sidecar** ; il reste au
   plan 2 à appeler cette route depuis l'interface — sur une collection, ou
   sur les liens classés morts.

### Correction apportée au §5.3

Le §5.3 prescrit de **comparer les compteurs d'abord**, et de ne lancer le
balayage complet que si les comptes divergent. L'implémentation place cette
comparaison **après** la fusion incrémentale, et c'est délibéré : comparer
avant déclencherait un balayage complet au moindre **ajout**, alors qu'un ajout
porte un `lastUpdate` récent et est déjà rattrapé par l'incrémental — le compte
fusionné retombe juste. Comparer après isole ce qui échappe vraiment à
l'incrémental : la **suppression** distante, c'est-à-dire le « point dur » que
le §5.3 nomme lui-même. Une divergence détectée à ce moment **escalade** vers un
balayage complet dans la même exécution.

## 2. Périmètre

**Ce lot** : sauvegarde des métadonnées (brut fidèle + export lisible dérivé),
archivage des copies permanentes à la demande, rafraîchissement quotidien
automatique. Les instantanés sont le **seul** artefact produit : aucune copie de
travail en app-data (cf. §4.1).

**Après le plan 2 (front)** : consultation hors ligne et file d'opérations
simples rejouées à la reconnexion. Conçu plus tard, mais ce lot pose
délibérément le socle qui le portera.

**Jamais dans ce lot** : édition hors ligne complète, réinjection vers Raindrop
depuis une sauvegarde, export buku (cf. §9).

## 3. Décisions structurantes

### 3.1 L'invariant de la spec principale, reformulé

§11 disait « Raindrop reste la seule source de vérité » et excluait la
réplication locale. Cette formulation est remplacée par :

> **Raindrop reste la seule source de vérité en écriture.** La réplique locale
> est une copie de lecture, reconstructible et jamais autoritaire : en cas de
> divergence, le serveur gagne.

L'esprit est préservé — rien ne diverge silencieusement — tout en autorisant la
copie. Toute fonctionnalité future qui voudrait faire de la copie locale une
autorité doit rouvrir cette décision explicitement.

### 3.2 Le canal est le REST direct, pas le MCP

La couche de données passe par `sidecar/direct/raindropRest.ts`. Trois raisons
cumulatives, la première étant bloquante :

1. **Le MCP n'expose pas le tri par date de modification.** Son `sort` accepte
   `score`, `±created`, `±title`, `±domain` — vérifié dans le JS du paquet
   épinglé. Sans `-lastUpdate`, **aucune synchronisation incrémentale n'est
   possible** et chaque rafraîchissement coûterait 245 requêtes.
2. **Les codes HTTP y sont visibles.** Le pont aplatit toute erreur en
   `Error: failed to …` (trap n° 2) ; un job de plusieurs minutes doit
   distinguer un 429 d'une panne réseau.
3. **Indépendance du pont.** La couche de données ne dépend plus de la décision
   §10.1 (reprise éventuelle du serveur MCP archivé), quelle qu'elle soit.

Conséquence assumée : `raindropRest.ts` cesse d'être un contournement ponctuel
et devient un client de lecture à part entière. C'est un **élargissement du
§3.3** de la spec principale.

> À noter : le MCP **n'appauvrit pas** les données (`searchRaindrops` renvoie
> `{count, items}` bruts — vérifié). Le passage en REST direct est motivé par le
> tri et les codes d'erreur, pas par une perte de champs.

### 3.3 Fichiers JSON, pas de base de données

Retenu après comparaison de trois approches :

- **JSON fidèle + index en mémoire** (retenu) : 11 Mo se chargent et s'indexent
  sans effort ; une recherche plein texte sur 12 000 entrées en JavaScript se
  compte en dizaines de millisecondes. Aucune dépendance nouvelle, ce qui
  préserve l'objectif « packaging du sidecar en binaire autonome » (§12).
- **SQLite** : écarté par YAGNI. La bonne réponse à 500 000 entrées, pas à
  12 000 ; le coût est une dépendance native (`better-sqlite3`) à compiler par
  plateforme. **Chemin de repli** si la bibliothèque changeait d'ordre de
  grandeur.
- **Relecture des fichiers à chaque requête** : écarté — 11 Mo relus à chaque
  frappe donneraient l'interface poussive que la liste virtualisée cherche
  précisément à éviter.

**Le schéma de buku a été examiné et écarté comme stockage** (proposé en cours
de conception) : ses six colonnes
`bookmarks(id, URL UNIQUE, metadata, tags, desc, flags)` ne portent ni
collections, ni highlights, ni `cache`, ni `created`/`lastUpdate` — cette
dernière absence rendrait la sync incrémentale impossible. Surtout, la
contrainte `URL ... UNIQUE` est **incompatible** avec une bibliothèque
contenant des doublons, que l'app existe justement pour détecter.

### 3.4 Format brut, champs inconnus compris

Les objets sont écrits **tels que l'API les renvoie**, sans passer par
`toRaindropItem` — ce mapper perd `cache`, `broken`, `highlights` et la liste
`media` complète. La documentation prévient qu'il est risqué d'*utiliser* les
champs non documentés ; les *conserver* est l'inverse d'un risque : un champ
qu'on n'a pas écrit est définitivement perdu.

### 3.5 Confidentialité du dossier de sauvegarde

Une sauvegarde contient **l'intégralité des URLs, titres, notes et surlignages**
— soit un profil de lecture complet. Le dossier pouvant être placé sur iCloud,
Dropbox ou tout autre service, ces données quittent alors la machine vers un
tiers.

Le projet chiffre le jeton dans le trousseau et interdit de l'écrire en clair ;
écrire 12 210 URLs sans le mentionner serait incohérent. Décision : **pas de
chiffrement** (une archive chiffrée dont la clé se perd est une archive perdue,
et le besoin exprimé est la récupération), mais **un avertissement explicite au
moment du choix du dossier**, indiquant ce que le fichier contient et ce que
cela implique si l'emplacement est synchronisé. Le choix reste à l'utilisateur,
il est simplement éclairé.

L'avertissement nomme explicitement `archives/` : les copies permanentes ne sont
pas des métadonnées mais **le corps complet des pages lues** — articles
payants, contenus privés, tout ce qu'une page affichait au moment de sa
capture. C'est l'artefact le plus sensible de l'arborescence, et le passer sous
silence dans un avertissement qui parle d'« URLs et de titres » serait
trompeur.

Le jeton Raindrop, lui, **n'apparaît dans aucun fichier de sauvegarde** — comme
partout ailleurs dans le projet.

## 4. Architecture

### 4.1 Un seul artefact dans ce lot

**Instantanés d'archive** — photos horodatées, complètes, jamais réécrites, dans
**le dossier désigné par l'utilisateur** (Documents, iCloud, Dropbox, disque
externe). C'est le filet de sécurité : il ne vaut que s'il survit à la perte de
la machine.

Le rafraîchissement incrémental **part du dernier instantané** : on le relit, on
applique les éléments modifiés, on écrit le suivant. Aucune copie de travail
n'est donc maintenue en app-data — la conserver dupliquerait 11 Mo pour
anticiper un besoin qui n'arrive qu'avec le lot hors ligne. Seul un état de
synchronisation léger (watermark, compteurs) vit dans `manifest.json`.

**Conséquence à assumer** : si le dossier est inaccessible (disque débranché,
fichier iCloud non téléchargé), l'incrémental est impossible et la prochaine
sauvegarde repart complète. Le cas est signalé, pas contourné.

> La copie de travail en app-data, socle de la consultation hors ligne, sera
> introduite par le lot suivant. L'arborescence ci-dessous est conçue pour être
> lue telle quelle par ce futur module.

### 4.2 Arborescence

```
<dossier choisi>/Raindrop-GUI/
├── manifest.json              # inventaire des instantanés, compteurs, empreintes
├── 2026-09-16T15-30-00/
│   ├── raindrops.jsonl        # un objet BRUT par ligne (collection 0)
│   ├── trash.jsonl            # la corbeille, même format
│   ├── collections.json
│   ├── highlights.json
│   ├── user.json
│   └── meta.json              # compteurs, watermark lastUpdate, complétude
└── archives/
    └── <raindropId>.html.gz   # copies permanentes (HTML gzippé), à la demande
```

**JSONL** pour les raindrops : écriture en flux sans charger 11 Mo en mémoire,
reprise d'une sauvegarde interrompue (⚠️ **différée** — voir §1ter),
lecture ligne à ligne.

⚠️ **La pagination doit être stable pour que la reprise ait un sens.** Le
balayage complet dure ≈ 2 min 20, largement de quoi qu'un élément soit modifié en
cours de route : trié par `-lastUpdate`, il remonterait en page 0 et décalerait
tout ce qui suit, si bien qu'une « reprise à la page suivante » sauterait des
éléments. Le balayage complet se fait donc trié par **`created` ascendant** —
le paramètre `sort=created`, **jamais `-created`**. Le sens n'est pas un détail
de style : en descendant, un bookmark créé pendant le balayage apparaît en
page 0 et décale tout ce qui suit, ce qui recrée exactement la course qu'on
élimine. En ascendant, les nouveaux éléments s'ajoutent **après** le point de
lecture et ne perturbent rien ; ils seront pris au passage suivant. Le tri
`-lastUpdate` est réservé au rafraîchissement incrémental, dont la fenêtre se
compte en secondes. L'horodatage de début de balayage est enregistré dans
`meta.json`.

⚠️ **Ce que l'ordre ascendant ne règle PAS : les suppressions.** L'argument
ci-dessus vaut pour les créations. Une **suppression en amont du point de
lecture** décale la suite **vers l'arrière**, et la pagination par offset saute
alors un élément — silencieusement. Lire la page 5 (indices 250-299), voir
disparaître l'élément d'indice 10, et la page 6 rend désormais les anciens
indices 301-350 : l'ancien 300 n'est jamais lu. Le cas n'est pas théorique —
**l'application elle-même supprime** (vues de nettoyage, mise à la corbeille)
et le balayage dure 2 min 20.

Le rafraîchissement incrémental ne rattrape pas ce cas : il trie par
`-lastUpdate`, or un élément sauté qui n'a pas été modifié n'a aucune date
nouvelle — il ne remonterait jamais.

**Parade : réconciliation par identifiants.** Le balayage collecte les `_id`
au passage (ils sont déjà en main, 12 210 entiers ≈ rien). À la fin, il relit
le `count` de l'API et le compare au nombre d'identifiants **distincts**
collectés. Égalité : l'instantané est complet, et on peut l'affirmer. Écart :
le balayage est **rejoué une fois** ; si l'écart persiste, l'instantané est
marqué **incomplet** (§6) et n'est jamais compté comme la dernière sauvegarde
valide. Le coût n'apparaît que lorsque quelque chose a réellement bougé.

### 4.3 Module

Un nouveau `sidecar/backup/`, distinct de `sidecar/analysis/`. Les deux
parcourent la bibliothèque mais leurs contraintes divergent : l'analyse veut une
forme normalisée et légère, la sauvegarde la forme brute et complète. Les fondre
produirait un module qui sert mal les deux.

Découpage visé (≤ 300 lignes par fichier, cf. conventions) : le parcours et la
pagination, l'écriture/rotation des instantanés, le registre des origines
incrémentales, l'archivage des copies.

**Dépendance au plan 3** : le sélecteur de dossier relève de Tauri. Le moteur se
livre avec un chemin fourni par configuration ; le sélecteur graphique se
branche ensuite sans modifier le moteur.

### 4.4 Une seule file vers l'API, avec priorité

**Défaut relevé dans l'existant (2026-09-16)** : le throttle de 550 ms
(`sidecar/mcp/throttle.ts`) n'encadre **que** les appels MCP. Le client REST
direct appelle `fetch` sans passer par lui. Sans conséquence jusqu'ici — il ne
servait qu'à des corrections d'URL isolées — mais ≈ 250 requêtes de sauvegarde
hors file cumulées au trafic MCP dépasseraient les 120 req/min : la limite est
**globale par utilisateur**, elle ne distingue pas nos canaux.

Correctif imposé par ce lot : **les deux canaux partagent la même file**. La
sauvegarde n'a pas le droit d'ignorer un throttle que le reste respecte.

**Priorité.** Un job de plus de deux minutes qui partage la file rendrait l'interface
poussive pendant tout ce temps. La file distingue donc deux rangs : les requêtes
**interactives passent devant**, la sauvegarde consomme ce qui reste. Elle
s'efface pendant que l'utilisateur travaille et rattrape quand il s'arrête.

**Avec un plancher**, sans quoi « ce qui reste » peut ne jamais venir : sur une
application utilisée sans interruption, la sauvegarde serait affamée et le
balayage hebdomadaire n'aboutirait jamais. La règle : **au moins une requête de
sauvegarde sur quatre**, même sous charge interactive. Au pire, le balayage
complet passe de 2 min 20 à ≈ 9 min — il finit toujours.

**Déclenchement** : au démarrage de l'app si la dernière sauvegarde date de plus
de 24 h — plutôt qu'à heure fixe, qui tomberait forcément au mauvais moment et
ne servirait à rien si l'app est fermée. Plus le déclenchement manuel.

## 5. Flux

### 5.1 Sauvegarde initiale — ce qui est collecté

| Source | Requêtes | Contenu |
|---|---|---|
| `/raindrops/0` paginé | 245 | les 12 210 bookmarks, bruts |
| `/raindrops/-99` paginé | 1 et + | **la corbeille** — incluse : elle contient ce que l'utilisateur vient de supprimer, donc exactement ce qu'une sauvegarde doit pouvoir rendre |
| `/collections` + `/collections/childrens` | 2 | l'arborescence complète |
| `/highlights` paginé | 1 et + | **tous les surlignages en une fois** — vérifié : l'endpoint global existe, il ne faut surtout pas interroger les bookmarks un par un (12 210 requêtes, ≈ 2 h) |
| `/user` | 1 | compte et préférences |

≈ 250 requêtes, ≈ 2 min 20 au throttle. Exécutée comme **job SSE annulable**
via l'infrastructure existante (`sidecar/jobs/`), avec progression. Le JSONL
**rendrait** la reprise possible ; elle n'est pas implémentée (§1ter).

### 5.2 Rafraîchissement incrémental

`sort=-lastUpdate`, page par page, **jusqu'à croiser le watermark** de
l'instantané précédent. Quelques éléments modifiés : une requête. C'est ce qui
rend la sauvegarde quotidienne quasi gratuite.

**Égalité de dates.** Plusieurs éléments peuvent partager la même seconde de
`lastUpdate` : un `>` strict en sauterait, un `>=` seul bouclerait. La règle est
donc : comparaison `>=`, **une page de recouvrement** au-delà du point de
croisement, et **dédoublonnage par `_id`**. Réappliquer un élément déjà à jour
est sans effet — l'opération est idempotente.

Déclenchement : **automatique une fois par jour**, plus un déclenchement manuel.

### 5.3 Suppressions distantes — le point dur

Un élément supprimé ailleurs ne modifie aucune date : il disparaît sans trace, et
le tri par modification ne le verra jamais.

Parade : **comparer d'abord les compteurs** (une requête) ; ne lancer le
balayage complet des 245 pages que si les comptes divergent du local. Coût
habituel : une requête. Coût réel seulement quand quelque chose a bougé.

Les compteurs de référence vivant dans `manifest.json`, donc dans le dossier de
l'utilisateur (§4.1), cette vérification économique suppose ce dossier
accessible. S'il ne l'est pas, ni la comparaison ni l'incrémental ne sont
possibles : la prochaine sauvegarde repart complète, et le dit.

⚠️ **L'angle mort des compteurs.** Une suppression *et* un ajout entre deux
passages laissent le compte inchangé : la divergence est invisible, et
l'élément supprimé survivrait indéfiniment dans les sauvegardes suivantes comme
s'il existait encore. La comparaison de compteurs est donc un **déclencheur bon
marché, pas une garantie**.

D'où la règle : **un balayage complet est exécuté au moins une fois par
semaine**, que les compteurs aient bougé ou non. Coût hebdomadaire : ≈ 250
requêtes, ≈ 2 min 20. C'est le prix d'une sauvegarde dont on peut affirmer
qu'elle reflète la bibliothèque, et non qu'elle n'a pas détecté de différence.

### 5.4 Archivage des copies permanentes

`GET /raindrop/{id}/cache` répond **303** (et non 307 comme l'annonce la doc)
vers une URL S3 **signée et temporaire** (Wasabi, `X-Amz-*`). Vérifié le
2026-09-16 :

- la signature ne couvre que `GET` — un `HEAD` sur la cible renvoie **403**,
  donc pas de sondage préalable de taille : on télécharge ou rien ;
- le contenu est **du HTML compressé en gzip** (`1f8b08`) servi en
  `Content-Type: text/html`, un fichier unique et non un bundle de ressources ;
- `cache.size` correspond exactement à la taille **compressée** stockée
  (11 186 o mesurés pour un `cache.size` de 11 186) — l'estimation de 18,7 Go
  du §1 vaut donc pour du contenu déjà compressé ;
- l'URL étant signée et périssable, elle ne peut pas être mémorisée : chaque
  archivage repart de l'endpoint `/cache` ;
- **la redirection se suit à la main** (`redirect: "manual"`, puis une seconde
  requête vers l'URL rendue) : suivie automatiquement, l'en-tête
  `Authorization: Bearer` du premier appel serait réémis vers une URL **déjà
  signée**, que S3 peut rejeter. Le second appel ne porte aucun en-tête
  d'authentification.

⚠️ **Correction du 2026-09-18, mesurée en réel.** Le « tels quels » ci-dessous
était faux, et l'a été jusqu'au premier archivage sur données réelles. L'objet
n'est pas seulement stocké gzippé : il est **annoncé `Content-Encoding: gzip`**
(`206`, `Content-Range: bytes 0-0/3143395` sur un objet de 3,1 Mo). `fetch`
(undici) déplie cet encodage de façon transparente, si bien qu'`arrayBuffer()`
rend du **HTML en clair** — écrit « tel quel », le fichier portait un nom
`.html.gz` que `gunzip` refuse, et pesait 5,6 Mo. `archives.ts` **recomprime**
donc quand la signature `1f 8b` manque, et laisse passer le corps s'il est déjà
gzippé. La mesure de `cache.size` faite au curl reste juste : `curl` ne déplie
pas par défaut, `fetch` si.

Les fichiers sont écrits **`<raindropId>.html.gz`**, et leur contenu est
réellement gzippé : nommer `.html.gz` un contenu en clair produirait des
archives que rien n'ouvre.

Déclenché par l'utilisateur sur une collection, ou automatiquement sur les liens
classés morts — là où l'archive vaut le plus.

**Rétention des archives.** `archives/` vit hors des instantanés horodatés : la
rotation du §5.5 ne le touche pas, et sans règle il croîtrait sans borne — à
2,1 Mo pièce. Deux règles, toutes deux nécessaires :

1. **Purge des orphelins**, à chaque balayage complet : l'ensemble des
   identifiants vivants est alors connu ; une archive dont l'identifiant
   n'apparaît ni dans `raindrops.jsonl` ni dans `trash.jsonl` est supprimée.
   Sans elle, l'archive d'un signet effacé resterait indéfiniment sous un
   identifiant qui ne résout plus.
2. **Un budget**, `ARCHIVES_MAX_GO` (défaut **5 Go**) : au-delà, les archives
   les plus anciennes sont évincées jusqu'à repasser sous le seuil. Une
   archive évincée se recrée à la demande — l'endpoint `/cache` reste la
   source. Pas d'exception pour les liens morts : une règle unique vaut mieux
   qu'une exception qui rouvrirait la croissance sans borne.

### 5.5 Rotation

Instantanés complets horodatés. Rétention : **les 7 derniers instantanés**, plus
**le plus ancien de chacune des 4 semaines calendaires précédentes** — un
instantané promu « hebdomadaire » échappe à la purge. La promotion se calcule
**à partir des instantanés présents**, jamais d'un calendrier théorique : si
l'app reste fermée trois semaines, les semaines sans instantané restent vides,
rien n'est fabriqué et rien n'est purgé à tort. À
11 Mo pièce, l'historique coûte peu et protège de ce qu'une sauvegarde unique
écrasée ne protège pas : une suppression massive accidentelle propagée dans la
sauvegarde avant qu'elle ne soit remarquée.

### 5.6 Export lisible

**Dérivé de l'instantané**, et uniquement de lui. L'API propose bien
`GET /raindrops/0/export.{format}` (`csv`, `html`, `zip`), mais s'en servir
produirait un export reflétant le **serveur à l'instant T**, pas la sauvegarde
qu'on prétend exporter : deux documents portant la même date pourraient
diverger. Le brut est la référence, l'export en est une vue — dérivée hors
ligne, sans requête, et reproductible.

## 6. États dégradés

Le dossier de sauvegarde échappe au contrôle de l'app : disque externe
débranché, fichier iCloud non téléchargé, dossier renommé, disque plein. Chaque
cas produit un message explicite et **laisse l'instantané précédent intact** :
jamais d'écrasement avant écriture réussie.

Une sauvegarde interrompue est marquée incomplète dans `meta.json` et n'est
**jamais** présentée comme valide — mieux vaut « la dernière sauvegarde date
d'hier » qu'une archive tronquée qu'on croit bonne.

**Vérification systématique après écriture.** Une archive jamais relue est une
archive qu'on *croit* bonne, et c'est le mode de défaillance qu'une sauvegarde
existe pour exclure. Chaque instantané est donc **relu immédiatement après
écriture** : comptage des lignes du JSONL, validité JSON de chaque ligne,
recoupement avec le compteur annoncé par l'API. Les empreintes SHA-256 de chaque
fichier sont consignées dans `manifest.json` et **revérifiées** avant qu'un
instantané ne serve de base à un rafraîchissement incrémental — sans quoi une
corruption silencieuse se propagerait de sauvegarde en sauvegarde.

Un instantané qui échoue à sa propre vérification est marqué invalide et
conservé (il peut rester partiellement exploitable), mais n'est jamais compté
comme la dernière sauvegarde valide.

**`manifest.json` s'écrit atomiquement** — fichier temporaire voisin puis
renommage. C'est le seul fichier réécrit à chaque passage (les instantanés,
eux, naissent dans un dossier neuf) : une coupure en cours d'écriture le
laisserait tronqué, et avec lui l'inventaire de toutes les sauvegardes.

**Changer de dossier de sauvegarde** ouvre un arbre neuf : la prochaine
sauvegarde est complète, et l'ancien dossier est laissé **intact**, jamais
déplacé ni adopté. Adopter un arbre trouvé sur place supposerait qu'il vient de
cette application et de ce compte — deux choses invérifiables.

⚠️ **Non tenu — voir §1ter.** Le réseau qui tombe *devrait* reprendre à la
page suivante, et le 429, désormais visible, *devrait* déclencher une pause
avant reprise au lieu d'être compté comme un échec. Aujourd'hui, l'un comme
l'autre avortent le job entier.

## 7. Tests

**Leçon de l'incident `unrestore`** (2026-09-16) : un `fetchImpl` mocké valide
notre appel, jamais l'API d'en face — c'est ainsi qu'un endpoint inexistant a
traversé l'implémentation *et* la revue.

Ce module se teste donc contre un **vrai serveur HTTP local** imitant l'API
Raindrop, sur le modèle de `sidecar/testing/targetServer.ts` : bibliothèque
paginée, **303** vers un faux S3 (le code mesuré, pas celui de la doc), 429,
réponses tronquées.

Couverture visée : pagination complète, ~~reprise après coupure~~ (§1ter),
watermark
incrémental, détection de suppression par écart de compteurs **et** balayage
hebdomadaire garanti, rotation et rétention (y compris avec des semaines sans
instantané), dossier devenu inaccessible, sauvegarde partielle jamais validée,
**vérification post-écriture** (JSONL tronqué, ligne corrompue, empreinte qui ne
correspond plus), **priorité de file** (une requête interactive passe devant une
sauvegarde en cours) **et son plancher** (la sauvegarde progresse même sous
charge interactive continue), **réconciliation par identifiants** (une
suppression simulée en cours de balayage doit produire un écart détecté, un
rejeu, puis un instantané marqué incomplet si l'écart persiste), **égalité de
watermark** (plusieurs éléments à la même seconde, aucun sauté, aucun doublon),
et **rétention des archives** (orphelin purgé au balayage complet, éviction du
plus ancien au-delà du budget).
Aucun appel réseau réel, comme le reste de la suite.

## 8. Effets sur la spec principale

| Section | Effet |
|---|---|
| §11 | La réplication locale n'est plus exclue ; invariant reformulé (§3.1 ci-dessus) |
| §3.3 | Élargi : le REST direct devient le canal de la couche de données |
| §5.1 | Inchangé — l'analyse garde son snapshot normalisé ; une éventuelle fusion avec la réplique est une optimisation ultérieure, non retenue par YAGNI |
| §12 | L'export élargi trouve ici son usage (§5.6) |
| §3.2 (throttle) | Étendu : la file de 550 ms couvre désormais **aussi** le REST direct, et distingue interactif / arrière-plan (§4.4) |

## 9. Hors périmètre

Édition hors ligne complète ; réinjection vers Raindrop depuis une sauvegarde
(les identifiants changent : il faudrait reconstruire l'arbre des collections et
les rattachements) ; export vers buku, retenu comme piste d'interopérabilité où
la perte d'information est un choix assumé, et non une amputation.

## 10. Constantes vérifiées (2026-09-16)

- 12 210 bookmarks ; ~937 o de métadonnées par item ; 74 % avec copie permanente
  (`cache.status: ready`), 2,1 Mo en moyenne, maximum observé 23 Mo.
- `sort=-lastUpdate` **fonctionne** sur `/raindrops/{collectionId}` (REST).
- **`sort=created` ascendant fonctionne, pagination profonde comprise** (mesuré
  le 2026-09-18, l'argument du §4.2 reposait dessus sans qu'il soit vérifié) :
  page 0 rend le plus ancien signet (2011-12-06), `-created` le plus récent
  (2026-09-12), et la page 244 répond **200** avec les 10 derniers items en
  ordre chronologique. Pages 0 et 1 : identifiants distincts, aucun
  recouvrement.
- `cache` et `broken` figurent **dans la réponse de liste** — pas de requête
  supplémentaire par item.
- `GET /raindrop/{id}/cache` → **303** (la doc annonce 307) vers une URL S3 signée et temporaire ; `HEAD` y est refusé (403) ; le contenu est du **HTML gzippé** et `cache.size` est la taille compressée.
- `/backups` et `/backup/{id}.{format}` existent (sauvegardes générées par
  Raindrop) ; `/raindrops/{id}/export.{format}` en `csv`, `html`, `zip`.
- Pagination 50 max en lecture, 100 objets max en création groupée.
- 120 requêtes/minute ; en-têtes `X-RateLimit-*` lisibles en REST direct
  uniquement.
- Aucun ETag ni `If-Match` : **le serveur n'arbitre pas les conflits** — à
  charge du lot hors ligne d'en définir la politique.
- **Pagination profonde sans limite observée** : page 244 répond 200 avec les
  10 derniers items (12 210 = 244 × 50 + 10). Le balayage complet tient.
- **`GET /highlights` existe** et renvoie tous les surlignages paginés — ne
  jamais les collecter bookmark par bookmark.
- Collections spéciales mesurées : `0` → 12 210, `-1` → 0, `-99` → 0.
- **Le throttle du projet ne couvre pas le client REST direct** (relevé dans le
  code, `sidecar/index.ts` : seul `deps.mcp` est encadré). La limite de 120
  req/min étant globale par utilisateur, ce lot impose une file commune (§4.4).
