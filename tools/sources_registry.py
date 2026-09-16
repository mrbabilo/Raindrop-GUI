"""Le registre des sources externes de Raindrop-GUI — les données, pas la logique.

Séparé de `check_sources.py` (les sondes, la comparaison, la CLI) : ce fichier
ne décrit **que** ce qu'on surveille et pourquoi. On y touche quand une
dépendance entre ou sort du projet ; on touche à `check_sources.py` quand la
*façon* de sonder change. `docs/SOURCES.md` en est la lecture humaine.

Clés d'une sonde `repo` : `meta` (archive + dernier push), `tags` (dernier tag,
croisé à `pin`), `release_filter` **ou** `lock` (déclenchent la lecture des
releases ; `lock` ajoute la version installée), `notes` (corps de release
découpé en lignes), `readme` (empreinte du README).
"""

MCP_PACKAGE = "@kud/mcp-raindrop-io"

SOURCES = [
    {"key": "mcp/kud", "kind": "repo", "repo": "kud/mcp-raindrop-io",
     "meta": True, "tags": True, "pin": MCP_PACKAGE,
     "readme": "https://raw.githubusercontent.com/kud/mcp-raindrop-io/main/README.md",
     "role": "le serveur MCP épinglé (1.3.1) — tout l'accès Raindrop passe par lui",
     "used_by": "sidecar (spawn direct de node_modules/…/dist/index.js)",
     "note": "dépôt ARCHIVÉ en amont, sans release GitHub : on suit le dernier "
             "tag (croisé au pin, délibéré — spec §3.1), le statut d'archive et "
             "l'empreinte du README. Un nouveau tag ou un désarchivage = LE "
             "signal ; un README qui change veut dire nouveaux tools "
             "(update_raindrop + url, archivage, Stella) — ou le MCP officiel "
             "annoncé dans ce même README"},

    {"key": "mcp/adeze", "kind": "repo", "repo": "adeze/raindrop-mcp",
     "meta": True, "release_filter": r"^v?\d",
     "readme": "https://raw.githubusercontent.com/adeze/raindrop-mcp/master/README.md",
     "role": "le candidat de reprise si le MCP épinglé (archivé) devient bloquant",
     "used_by": "aucun code — veille de décision (spec §10), pas une dépendance",
     "note": "actif là où kud ne l'est plus (v2.4.5, MIT, TypeScript, transport "
             "stdio présent dans le bin). Son `bookmark_manage` pose `link` en "
             "mise à jour : l'URL y est modifiable, ce qui lèverait le trap n°1 "
             "et l'appel REST direct des redirections. Surveiller (a) une "
             "majeure — les noms de tools sont TOUS différents de kud, le coût "
             "de migration est là ; (b) l'apparition d'un `unrestore`, absent "
             "en 2.4.5. ⚠ branche par défaut `master`, pas `main`"},

    {"key": "sdk-mcp", "kind": "repo", "repo": "modelcontextprotocol/typescript-sdk",
     "release_filter": r"^\d", "notes": True, "lock": "@modelcontextprotocol/sdk",
     "role": "le SDK MCP — le client du sidecar, transport stdio",
     "used_by": "sidecar (client MCP)",
     "note": "monorepo par changesets : les tags @paquet@x.y.z sont les nouveaux "
             "paquets 2.0, le tag **sans** préfixe est le paquet sdk. Corps de "
             "release stocké : l'écart affiche le changelog. Majeure → compat client"},

    {"key": "hono", "kind": "repo", "repo": "honojs/hono", "lock": "hono",
     "role": "le serveur HTTP local du sidecar (127.0.0.1, REST + SSE)",
     "used_by": "sidecar (serveur API)",
     "note": "plage ^4.9 : les mineures passent seules ; une majeure = breaking API"},

    {"key": "zod", "kind": "repo", "repo": "colinhacks/zod", "lock": "zod",
     "role": "la validation des schémas (entrées des endpoints, types partagés)",
     "used_by": "sidecar (validation), types partagés front",
     "note": "la v4 a déjà cassé l'API de la v3 : une mineure saute, une majeure se lit"},

    {"key": "api-raindrop/docs", "kind": "page",
     "url": "https://developer.raindrop.io", "hash_html": True,
     "role": "la référence de l'API REST de repli — et ses contraintes (120 req/min, 50/page)",
     "used_by": "sidecar/direct/raindropRest.ts (repli §3.3), file d'attente MCP",
     "note": "l'empreinte détecte un changement de doc — nouveau champ, "
             "nouvelle limite, dépréciation : à relire avant de coder"},

    {"key": "constantes-épinglées", "kind": "local", "package": MCP_PACKAGE,
     "role": "l'épinglage et le JS du MCP, tels que posés dans ce dépôt",
     "used_by": "package.json, node_modules",
     "note": "la sonde de --offline : elle ne sort pas de la machine"},
]

# Sources sans sonde automatique : les sonder consommerait le jeton/quota du
# compte, ou n'a pas de sens avant Phase 2.
UNPROBED = [
    ("API Raindrop REST (sous jeton)", "api.raindrop.io/rest/v1 — consommerait "
     "le quota du compte ; la page docs est le signal", "sidecar/direct/raindropRest.ts"),
    ("MCP officiel Raindrop", "annoncé dans le README de kud (2026-08) — OAuth 2.1, "
     "pas de token statique. À évaluer en Phase 2", "—"),
    ("Stella", "endpoint interne de l'app web Raindrop, aucune API publique au "
     "2026-09-15 — Phase 2, fragile par construction", "spec §12"),
    ("Inspirations UX", "karakeep, Linkwarden, Bookmarks Organizer, buku, GoSuki — "
     "des idées, pas des dépendances", "spec §13"),
    ("raindrop-cli (dedene, Go)", "v0.1.1, 11 étoiles, sans push depuis 2026-02 : "
     "une inspiration (export CSV/HTML/ZIP, import Netscape, OAuth2 par redirect "
     "local), pas une dépendance — rien d'un CLI Go ne s'embarque dans le sidecar", "spec §12"),
    ("Écosystème Raindrop écarté", "raindropio/extensions (archivé 2020), "
     "raindrop-io-py (mainteneur désengagé), CLI tierces invérifiables — relevé "
     "du 2026-09-16, aucune reprise prévue : ne pas re-sonder sans raison", "spec §13"),
]
