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
│   ├── raindrops.jsonl        # un objet BRUT par ligne
│   ├── collections.json
│   ├── highlights.json
│   ├── user.json
│   └── meta.json              # compteurs, watermark lastUpdate, complétude
└── archives/
    └── <raindropId>.html.gz   # copies permanentes (HTML gzippé), à la demande
```

**JSONL** pour les raindrops : écriture en flux sans charger 11 Mo en mémoire,
reprise d'une sauvegarde interrompue, lecture ligne à ligne.

⚠️ **La pagination doit être stable pour que la reprise ait un sens.** Le
balayage complet dure ~2 min 15, largement de quoi qu'un élément soit modifié en
cours de route : trié par `-lastUpdate`, il remonterait en page 0 et décalerait
tout ce qui suit, si bien qu'une « reprise à la page suivante » sauterait des
éléments. Le balayage complet se fait donc trié par **`created`**, qui ne change
jamais. Le tri `-lastUpdate` est réservé au rafraîchissement incrémental, dont
la fenêtre se compte en secondes. L'horodatage de début de balayage est
enregistré dans `meta.json` : ce qui a bougé pendant la course est rattrapé par
le rafraîchissement suivant, et l'instantané ne prétend pas être plus cohérent
qu'il ne l'est.

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

## 5. Flux

### 5.1 Sauvegarde initiale

245 requêtes, ≈ 2 min 15 au throttle de 550 ms. Exécutée comme **job SSE
annulable** via l'infrastructure existante (`sidecar/jobs/`), avec progression.
Reprise possible grâce au JSONL.

### 5.2 Rafraîchissement incrémental

`sort=-lastUpdate`, page par page, **jusqu'à croiser le watermark** de
l'instantané précédent. Quelques éléments modifiés : une requête. C'est ce qui
rend la sauvegarde quotidienne quasi gratuite.

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
  archivage repart de l'endpoint `/cache`.

Les fichiers sont donc écrits **`<raindropId>.html.gz`**, tels quels, sans
décompression : nommer `.html` un contenu gzippé produirait des archives que
rien n'ouvre.

Déclenché par l'utilisateur sur une collection, ou automatiquement sur les liens
classés morts — là où l'archive vaut le plus.

### 5.5 Rotation

Instantanés complets horodatés. Rétention : **les 7 derniers instantanés
quotidiens**, plus **le plus ancien de chacune des 4 semaines précédentes** — un
instantané promu « hebdomadaire » échappe à la purge quotidienne. À
11 Mo pièce, l'historique coûte peu et protège de ce qu'une sauvegarde unique
écrasée ne protège pas : une suppression massive accidentelle propagée dans la
sauvegarde avant qu'elle ne soit remarquée.

### 5.6 Export lisible

Dérivé à la demande depuis l'instantané, ou récupéré directement via
`GET /raindrops/0/export.{format}` (`csv`, `html`, `zip` — natif, avec passage
de `sort` et `search`). Le brut reste la référence ; l'export est une vue.

## 6. États dégradés

Le dossier de sauvegarde échappe au contrôle de l'app : disque externe
débranché, fichier iCloud non téléchargé, dossier renommé, disque plein. Chaque
cas produit un message explicite et **laisse l'instantané précédent intact** :
jamais d'écrasement avant écriture réussie.

Une sauvegarde interrompue est marquée incomplète dans `meta.json` et n'est
**jamais** présentée comme valide — mieux vaut « la dernière sauvegarde date
d'hier » qu'une archive tronquée qu'on croit bonne.

Le réseau qui tombe reprend à la page suivante. Le 429, désormais visible,
déclenche une pause avant reprise au lieu d'être compté comme un échec.

## 7. Tests

**Leçon de l'incident `unrestore`** (2026-09-16) : un `fetchImpl` mocké valide
notre appel, jamais l'API d'en face — c'est ainsi qu'un endpoint inexistant a
traversé l'implémentation *et* la revue.

Ce module se teste donc contre un **vrai serveur HTTP local** imitant l'API
Raindrop, sur le modèle de `sidecar/testing/targetServer.ts` : bibliothèque
paginée, 307 vers un faux S3, 429, réponses tronquées.

Couverture visée : pagination complète, reprise après coupure, watermark
incrémental, détection de suppression par écart de compteurs, rotation et
rétention, dossier devenu inaccessible, sauvegarde partielle jamais validée.
Aucun appel réseau réel, comme le reste de la suite.

## 8. Effets sur la spec principale

| Section | Effet |
|---|---|
| §11 | La réplication locale n'est plus exclue ; invariant reformulé (§3.1 ci-dessus) |
| §3.3 | Élargi : le REST direct devient le canal de la couche de données |
| §5.1 | Inchangé — l'analyse garde son snapshot normalisé ; une éventuelle fusion avec la réplique est une optimisation ultérieure, non retenue par YAGNI |
| §12 | L'export élargi trouve ici son usage (§5.6) |

## 9. Hors périmètre

Édition hors ligne complète ; réinjection vers Raindrop depuis une sauvegarde
(les identifiants changent : il faudrait reconstruire l'arbre des collections et
les rattachements) ; export vers buku, retenu comme piste d'interopérabilité où
la perte d'information est un choix assumé, et non une amputation.

## 10. Constantes vérifiées (2026-09-16)

- 12 210 bookmarks ; ~937 o de métadonnées par item ; 74 % avec copie permanente
  (`cache.status: ready`), 2,1 Mo en moyenne, maximum observé 23 Mo.
- `sort=-lastUpdate` **fonctionne** sur `/raindrops/{collectionId}` (REST).
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
