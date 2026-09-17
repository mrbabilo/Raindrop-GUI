# Changelog

Format [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versionnement [SemVer](https://semver.org/lang/fr/).

## [Unreleased]

Rien n'est encore publié : l'application se lance en développement
(`./scripts/dev-sidecar.sh` puis `npm run dev`). Le **plan 3/3 — le shell
Tauri — n'est pas commencé**, il n'y a donc pas d'application packagée.

### Ajouté

#### Sidecar — plan 1/3, 16 tasks (2026-09-15 → 2026-09-16)

- Pont vers `@kud/mcp-raindrop-io` **épinglé à 1.3.1**, lancé en
  sous-processus : connexion typée, erreurs distinguées
  (`MCP_TIMEOUT` / `MCP_CRASHED` / `RAINDROP_API`), redémarrage
  automatique ×3 avec backoff.
- **API REST locale** (Hono) bindée sur `127.0.0.1` port 0, jeton Bearer,
  erreurs uniformes : raindrops, collections, tags, highlights, user,
  maintenance. Le token Raindrop ne traverse jamais HTTP.
- **File d'appels espacée de 550 ms** (≈ 109 req/min sous la limite de
  120) : le 429 étant indétectable à travers le MCP, la prévention est
  proactive. Retry sur les lectures seulement, jamais sur les écritures.
- **Moteur d'analyse local** : normalisation d'URL et doublons (exacts,
  normalisés, approchants) ; vérificateur de liens suivant les chaînes de
  redirection (concurrence 6, timeout, retry, annulation).
- **Jobs SSE** : progression, annulation, battement de cœur ; snapshot
  paginé 50/page et cache `analysis.json` écrit atomiquement, avec durée
  de vie.
- Démarrage : configuration par l'environnement, journaux JSONL gardés
  7 jours, fichier de verrou porteur du port (jamais du token).
- `POST /api/raindrops/unrestore` — restauration depuis la corbeille, avec
  mémoire de la collection d'origine (Raindrop ne la conserve pas).

#### Interface — plan 2/3 (2026-09-16 → 2026-09-17)

- Shell à **trois panneaux**, textes en français centralisés, thème clair
  et sombre.
- **Navigation** : vues fixes, collections arborescentes, étiquettes
  cliquables (filtre serveur `#tag`).
- **Liste** virtualisée à défilement infini, avec sélection multiple, et
  **mosaïque** en second mode. Recherche débouncée, tri, filtres domaine
  et dates, puces de **nature du contenu**.
- **Détail permanent** : aperçu, édition en ligne, favori, mise à la
  corbeille, surlignages en lecture seule.
- **Actions en masse** : la sélection construit une page **Revue de
  l'action** — compteur exact, désélection, recherche, export CSV,
  confirmation à deux niveaux pour l'irréversible.
- **Composer ⌘E** : collage d'URL, préremplissage, alerte de doublon.
- **Palette ⌘K** : bookmarks, collections, étiquettes et vues au clavier.
- **Nettoyage** : tableau de bord (compteurs, fraîcheur, scans SSE
  annulables) et six vues de traitement — liens morts, redirections,
  doublons, non-taggés, collections vides, corbeille.
- **Vue des étiquettes** : renommer, fusionner, supprimer.
- **Les collections se repèrent à leur couleur.** Dans la barre latérale,
  chaque entrée est une bande dans la teinte de sa collection, portant son
  icône Raindrop — ou un dossier teinté quand elle n'en a pas, y compris
  si la vignette distante ne se charge pas.
  - **Une couleur par famille** : la collection principale la décide, ses
    sous-collections en héritent. Elles s'en distinguent par un lavis plus
    léger et par leur bande, qui démarre sous l'icône de leur mère.
  - **Chaque famille a sa propre teinte**, assez éloignée des autres pour
    se lire. Vos couleurs Raindrop se pressaient dans deux zones du cercle
    chromatique — deux collections étaient à un dixième de degré l'une de
    l'autre — et les teintes sont donc redistribuées en gardant leur
    ordre : une couleur peut s'éloigner franchement de celle réglée dans
    Raindrop, seul son rang est conservé.
  - Les teintes restent **pastel** quelle que soit la vivacité de la
    couleur d'origine, et le texte garde partout un contraste confortable.
  - **Au survol**, la bande s'entoure d'un trait de sa teinte et son ombre
    s'ouvre, en 140 ms — rien ne se déplace, et la transition disparaît si
    le système demande moins d'animation.
  - **Le survol explore, le clic fixe** : survoler une collection déplie
    ses sous-collections le temps qu'on y passe ; cliquer la collection ou
    son chevron les garde ouvertes, et le clic suivant les referme.
- **Navigation au clavier** : chaque zone ne prend qu'un arrêt de
  tabulation au lieu d'un par ligne, et les flèches y circulent — y
  compris en deux dimensions dans la mosaïque. →/← déplient une
  collection, Entrée ouvre la fiche, l'espace coche et passe à la ligne
  suivante, Échap rend la main. Le focus clavier se voit — un anneau —,
  le clic ne montre rien.
- **Vue d'une collection parente** : cliquer une collection qui a des
  sous-collections montre ses signets directs, puis une section par
  sous-collection — chacune avec son intertitre, son compte exact et un
  « Voir les N » vers la collection entière. Les contrôles restent en
  tête, uniques.
- **Arbre pliable et rangé** : les collections se lisent en ordre
  alphanumérique naturel (« 10 - SERVEURS » après « 9 », pas entre « 1 »
  et « 2 »), et la barre latérale ne déplie un parent qu'au survol.
- **Déplacement par glissement** : tirer un signet — ou toute une
  sélection — sur une collection de la barre latérale l'y range. Un
  fantôme dit ce qu'on transporte, la collection visée s'allume, et la
  corbeille n'accueille rien : y glisser un signet l'effacerait d'un
  geste, alors que la mise à la corbeille est un verbe que l'on nomme.
- **Bannières dégradées** : pont MCP tombé, hors-ligne.

#### Conception et outillage

- Spécification de conception Phase 1 (2026-09-15) et sa relecture
  critique ; spécification de sauvegarde (2026-09-16), en attente de
  validation.
- `docs/DESIGN.md` — direction visuelle, qui **fait foi sur l'apparence** :
  symbolique des couleurs, signalétique de collection, états, densités,
  jetons, signalétique de la nature du contenu.
- `tools/check_sources.py` — veille des sources externes (le pont MCP
  épinglé est **archivé en amont**, son candidat de reprise est évalué
  sans migration décidée).
- Conventions : `CLAUDE.md`, `docs/DOMAINE.md`, `docs/ROADMAP.md`,
  `scripts/dev-sidecar.sh` (token lu du trousseau macOS) — 2026-09-15.
- Licence propriétaire, tous droits réservés (2026-09-16).

### Modifié

- **Principe d'épure — « l'écran ne surcharge jamais »** (DESIGN.md §9,
  2026-09-17). Seuls les contrôles nécessaires au geste courant sont
  posés ; le reste est révélé au survol ou au focus, ou nulle part.
  Appliqué à l'existant :
  - la barre de liste ne garde que trois commandes — recherche, tri,
    affichage ; **domaine et dates se replient** dans un panneau que
    l'icône de réglages déplie, et qui refuse de se replier tant qu'un de
    ses filtres est actif ;
  - le **tri devient un bouton-état** qui nomme son tri courant ;
  - la bascule liste/mosaïque, **deux boutons texte pour un seul geste**,
    devient une icône unique nommée par sa destination ;
  - le **favori se réduit à l'étoile** ; « Ouvrir » disparaît, la ligne
    d'adresse étant déjà le lien ;
  - les **compteurs à zéro** sortent de l'écran, comme les puces des
    natures absentes de la vue et la section des surlignages vide ;
  - les verbes ne sont plus répétés entre un champ et son bouton.

  Toute commande réduite à une icône porte son nom accessible : l'épure
  ne déplace pas sa dette vers l'accessibilité.

### Corrigé

- **Le champ Domaine ne filtrait rien** (2026-09-17). Le pont MCP envoie
  `domain` en paramètre d'URL, que l'API Raindrop ignore : la bibliothèque
  entière revenait, quel que soit le domaine demandé. Le filtre est
  désormais composé dans la recherche, où il existe vraiment. La saisie est
  normalisée au passage — minuscules, sans schéma, sans `www.`, sans
  chemin — car l'opérateur exige le domaine exact et rend zéro **sans
  erreur** pour toute autre forme : coller une URL donnait un écran vide
  que rien n'expliquait. Mesuré de bout en bout : 12 210 → 64.

### Problèmes connus

- Écriture des surlignages, agent IA, moteur de règles et packaging
  restent hors périmètre de la Phase 1 (spécification §12).
