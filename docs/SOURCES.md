# Sources externes de Raindrop-GUI

> ⚠️ Ce fichier est la **carte** de tout ce qui vit hors du dépôt. L'état
> courant se relève par `python3 tools/check_sources.py` (référence dans
> `.sources-baseline.json`) — ne pas recopier de versions ici, elles
> pourriraient. Ce document porte les *rôles* et le *raisonnement*, le script
> porte les *valeurs*.

## 1. Comment vérifier

```bash
python3 tools/check_sources.py            # relève et compare (sortie 1 s'il y a un écart)
python3 tools/check_sources.py --report   # relève et affiche tout, sans juger
python3 tools/check_sources.py --offline  # seulement les contrôles locaux
python3 tools/check_sources.py --update   # assume l'état courant comme référence
```

Le **registre** — quelles sources, sondées comment — est un fichier de
données à part, `tools/sources_registry.py` ; `check_sources.py` ne porte que
la mécanique. Ajouter une source se fait dans le registre seul.

Même patron que StarHubFR : un relevé, une référence, un `--update` explicite
visible dans le diff. **Un écart n'est pas une faute** — c'est une chose à
aller regarder. Les sources injoignables ne comptent **pas** comme un écart ;
`--update` conserve leur référence au lieu de l'écraser par du vide. L'API
GitHub anonyme plafonne à 60 req/h : le script passe par `gh` si présent
(5 000/h) et rend un message clair sur épuisement du quota.

## 2. Les sources sondées

### 2.1 `@kud/mcp-raindrop-io` — le pont (`mcp/kud`)

Toute l'accès à Raindrop passe par lui (spec §2). **Épinglé à une version
exacte** dans `package.json` — jamais de `npx @latest` (spec §3.1) ; le pin
est lu en direct par le script, jamais codé dedans.

Découvert à l'installation de la sonde (2026-09-16) : le dépôt amont est
**archivé** (le README redirige vers un MCP officiel Raindrop, OAuth 2.1) et
**ne publie aucune release GitHub**. On suit donc : le dernier **tag** croisé
au pin (un nouveau tag = désarchivage probable — LE signal), le statut
`archived`, et l'**empreinte du README**, surface où apparaîtraient des tools
nouveaux (`update_raindrop` gagnant `url`, archivage, Stella — §5.1, §12).
Un README qui change peut valoir « on peut retirer le REST direct §5.1 » ou
« le MCP officiel est mûr, à évaluer ».

### 2.2 `adeze/raindrop-mcp` — le candidat de reprise (`mcp/adeze`)

**Ce n'est pas une dépendance** : aucun code du projet ne l'appelle. On le
surveille parce que notre pont est archivé (§2.1) et que celui-ci est le seul
serveur MCP Raindrop encore vivant — v2.4.5, MIT, TypeScript, transport stdio
présent dans le binaire (donc compatible avec notre modèle de spawn, spec §2).

Ce qu'il changerait, vérifié dans le JS publié et non dans sa doc : son
`bookmark_manage` pose `link` dans la charge de mise à jour — **l'URL y est
modifiable**, ce que `update_raindrop` de kud 1.3.1 ne permet pas (trap n°1) ;
il embarque un vrai rate limiting (`rate-limiter-flexible`) là où le 429 nous
est invisible. Ce qu'il coûterait et pourquoi on ne migre pas aujourd'hui :
spec §10.

À surveiller : **une majeure** — ses vingt tools portent des noms entièrement
différents de kud, c'est là qu'est le coût — et **l'apparition d'un
`unrestore`**, absent en 2.4.5, qui justifie encore notre appel REST direct.
⚠️ Sa branche par défaut est `master` (kud est sur `main`).

### 2.3 `@modelcontextprotocol/sdk` — le client MCP (`sdk-mcp`)

Le client du sidecar (transport stdio). Le dépôt est un **monorepo par
changesets** : les tags `@paquet@x.y.z` sont les nouveaux paquets 2.0 (core,
client…), le tag **sans préfixe** est celui du paquet `sdk` — le filtre de la
sonde. Son corps de release, compact, est stocké dans la référence :
**l'écart affiche le changelog**. Montée majeure (2.0) = vérifier la compat
du client avant upgrade.

### 2.4 `hono` — le serveur HTTP local (`hono`)

Les endpoints REST + SSE du sidecar (127.0.0.1), comparés à la version
**résolue** du lockfile. Mineures : passent seules (plage `^4.9`) ;
**majeure** = breaking API à lire avant upgrade.

### 2.5 `zod` — la validation (`zod`)

Schémas des entrées et types partagés front/sidecar. La v4 a déjà cassé
l'API de la v3 : une mineure saute, une majeure se lit avant.

### 2.6 developer.raindrop.io — la référence API (`api-raindrop/docs`)

La doc de l'API REST de **repli** (§3.3) et l'endroit où sont posées les
contraintes que notre throttle construit dessus (**120 req/min**,
**pagination 50**). L'empreinte porte sur le contenu **utile** — `<script>`
et `<link>` retirés avant hachage (noms de fichiers hashés par build). Un
changement de doc = nouveau champ, limite ou dépréciation : à relire.

**Relevé du 2026-09-19** (premier écart, +149 octets sur la page d'accueil) :
contrat relu intégralement, **rien ne nous touche**. 120 req/min et
`perpage 50 max` / « maximum 100 objects » confirmés sur `/v1/raindrops/multiple`.
Le **changelog 1.0.4** retire `/raindrops/:collectionId/filters`,
`GET /user/:id` et `GET /tags/suggest` — aucune n'est la nôtre (nous
appelons `/user` authentifié ; l'analyse des filtres est locale, §5.1).
`unrestore` reste absent de la doc (trap CLAUDE.md inchangé). Le MCP
officiel (§2.1, déjà connu à la référence du 16) n'a pas bougé : bêta Pro,
`/rest/v2/ai/mcp`, Streamable HTTP. La page d'accueil elle-même n'étant pas
conservée, l'octet qui a bougé reste non identifié — le contrat, lui, est
entier.

**Relue le 2026-09-16** (signal de la veille : −86 octets). Constantes du
projet toutes confirmées — 120 req/min, `perpage` 50 max, `-1`/`-99`, `link`
modifiable par `PUT /raindrop/{id}`, suppression → corbeille puis définitive.
Quatre écarts relevés, traités en spec §12, §4.2 et dans les traps de
`CLAUDE.md` (dont `unrestore`, **absent de l'API publique**).

> **À faire à la prochaine passe sur la veille** : sonder
> `https://developer.raindrop.io/llms-full.txt` (toute la doc en ~115 ko de
> texte) au lieu de hacher 474 ko de SPA. L'écart deviendrait **lisible** —
> on verrait *quelle ligne* de la doc a changé, pas seulement *que* quelque
> chose a bougé. Changement volontairement séparé : il réécrit la référence.

### 2.7 `constantes-épinglées` — la sonde de `--offline`

Releve sur le disque le pin du MCP et la présence du JS spawné
(`node_modules/…/dist/index.js`). Elle ne sort pas de la machine : elle
attrape **sans réseau** le commit qui remplacerait le pin exact par une plage
`^x.y.z` (contrainte CLAUDE.md), ou un `npm install` manquant.

## 3. Suivies à la main (pas de sonde)

- **API Raindrop REST sous jeton** (`api.raindrop.io/rest/v1`) — la sonde
  consommerait le quota du compte ; la page docs est le signal.
- **MCP officiel Raindrop** — annoncé dans le README de kud (2026-08).
  Candidat Phase 2, à évaluer quand il bougera.
- **Stella** — endpoint interne de l'app web, aucune API publique au
  2026-09-15 (spec §12). Fragile par construction, hors sonde.
- **Inspirations UX** — karakeep, Linkwarden, Bookmarks Organizer, buku,
  GoSuki (spec §13) : des idées reprises, pas des dépendances.
- **`dedene/raindrop-cli`** (Go) — v0.1.1, 11 étoiles, sans push depuis
  2026-02 : trop jeune pour être une dépendance, et rien d'un CLI Go ne
  s'embarque dans un sidecar Node. Retenu comme **idée** (export CSV/HTML/ZIP,
  import Netscape, OAuth2 par redirect local) — spec §12.
- **Écosystème Raindrop écarté** (relevé du 2026-09-16) —
  `raindropio/extensions` archivé depuis 2020, `raindrop-io-py` dont le
  mainteneur s'est désengagé, et plusieurs CLI tierces invérifiables. Aucune
  reprise prévue : ne pas les re-sonder sans raison neuve.
