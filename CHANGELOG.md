# Changelog

Format [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versionnement [SemVer](https://semver.org/lang/fr/).

## [Unreleased]

L'application se construit depuis le dépôt (`npm run build:app`, archives
avec `npm run release`) et se lance en développement
(`./scripts/dev-sidecar.sh` puis `npm run dev`, ou `npm run tauri:dev`).
Rien n'est encore publié au sens releases : la signature est ad-hoc, sans
Developer ID.

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
- **Deux envois valent un.** Une double validation rapide créait deux fois
  le même signet, ou lançait deux renommages d'étiquette dont le second
  portait sur un nom qui n'existait plus. Renommer une étiquette vers le
  nom qu'elle porte déjà ne déclenche plus rien non plus.
- **Une URL collée en majuscules est analysée** comme les autres : elle ne
  l'était pas, donc ni titre prérempli, ni alerte de doublon.
- **Le sidecar ne suppose plus les formes.** Une collection sans
  identifiant dans la réponse MCP rendait 200 avec un `id: undefined` —
  elle rend désormais 502 avec la raison. Après un vidage de corbeille,
  la mémoire des origines est purgée : tout ce qu'elle gardait pointait
  vers des signets qui n'existent plus. Un échec d'écriture de cette
  mémoire (disque plein…) laisse désormais une trace au journal — il reste
  silencieux pour l'appelant, comme le veut le contrat. Et la lecture des
  flux de progression tient les fins de ligne CRLF et les données en
  plusieurs lignes que le protocole autorise.
- **La chute du sidecar ne se tait plus.** La bannière d'état ne savait
  dire que « pont MCP cassé » — quand le sidecar ENTIER était injoignable,
  son propre sondage échouait et elle se taisait, précisément quand tout
  était perdu. Un diagnostic propre lui est dédié, avec un bouton pour
  relancer le sondage.
- **Les vues de traitement sont navigables au clavier** sans un arrêt de
  tabulation par contrôle : la ligne est l'arrêt, Enter y entre et tabule
  ses actions (Restaurer, remplacer une URL, supprimer), Échap rend la
  ligne.
- **Un échec de chargement se dit.** La liste, les étiquettes et les vues
  de nettoyage affichaient « Rien ici » quand une requête échouait —
  « cette collection est vide » là où la vérité était « je n'ai pas pu
  regarder ». Elles montrent désormais l'erreur et un bouton pour
  réessayer.
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

#### Application macOS — shell Tauri — plan 3/3 (2026-09-17)

- **Raindrop GUI est une application.** Une fenêtre s'ouvre, lance son
  service local et l'arrête en partant — par ⌘Q comme par SIGTERM.
- **Premier lancement** : le jeton d'API se saisit une fois, est vérifié
  auprès de Raindrop — le compte détecté s'affiche — puis rejoint le
  **trousseau macOS**, dans le même enregistrement que le développement.
- **Si Node manque, l'application peut l'installer.** L'écran d'accueil
  propose « Installer Node » : téléchargement du tarball officiel épinglé
  (LTS 22), somme SHASUMS256 vérifiée avant toute extraction, installation
  dans le dossier de données de l'application — aucun droit administrateur.
  Une fois posé, le runtime géré passe devant le PATH. Les instructions
  manuelles restent le repli (hors-ligne, refus).
- **Un service local éphémère** : le token Bearer de l'API locale est
  régénéré à chaque lancement et jamais écrit sur disque ; un sidecar
  survivant d'un crash précédent est terminé, pas réutilisé — un ancien
  token rend 401, proprement.
- **Les écrans d'attente ont des issues** : « Réessayer » rejoue la
  séquence (il ne se contente pas de relire l'état qui a échoué), et
  « Saisir un autre jeton » reste la porte quand un jeton refusé est déjà
  au trousseau.
- **La bibliothèque n'apparaît que prête** : la validation du jeton
  attend que le pont MCP soit connecté — la course du premier lancement
  (« MCP indisponible » à chaque validation) est morte.
- **Réglages (⌘,)** : l'état de la connexion au pont Raindrop, le
  remplacement du jeton sans repasser par l'écran d'accueil, et la
  déconnexion — qui efface le jeton du trousseau et arrête le service
  local. Un jeton que Raindrop refuse le dit sur place, sans fermer
  l'écran ; une panne du service, elle, ramène à l'écran d'accueil, qui
  porte les issues.
- **Le compilateur** (`npm run build:app`, `npm run release`, inspiré du
  cliquet de StarHubTH) : vérifications qui échouent en deux secondes,
  cliquet de tailles, tests, puis contrôle du bundle — le sidecar est-il
  vraiment embarqué, le MCP à la version épinglée dedans. Livraison en
  `.app` et `.dmg`.

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

#### Sauvegarde locale de la bibliothèque (2026-09-18)

- **Réplication complète des métadonnées** dans un dossier choisi :
  instantanés horodatés (JSONL brut, fidèle au format de l'API), corbeille,
  arborescence complète des collections, surlignages et profil. Chaque
  instantané est autonome — l'incrémental ne produit pas un delta, sinon la
  rotation effacerait un maillon et rendrait illisibles tous les suivants.
- **Balayage complet réconcilié par identifiants**, et non par cardinalité :
  une suppression concurrente décale la pagination et fait sauter un élément,
  ce qu'un simple compte ne voit pas. Éprouvé en réel sur 12 210 signets en
  2 min 19.
- **Rafraîchissement incrémental** à repère temporel, avec page de
  recouvrement (l'ordre entre éléments de même seconde n'est pas garanti
  stable d'une requête à l'autre).
- **Manifeste atomique et rotation** : 7 derniers jours, puis une sauvegarde
  par semaine. La dernière sauvegarde valide n'est jamais évincée.
- **Archivage des copies permanentes Pro**, avec purge des orphelines et
  budget borné.

#### Le dossier de sauvegarde se choisit depuis l'application (2026-09-18)

- **Dialogue natif** dans les Réglages ; le chemin est retenu côté shell, et
  le webview ne nomme jamais un chemin d'écriture.
- **Panneau Sauvegarde** : chemin, dernière sauvegarde, instantanés, archives,
  progression en **compteur nommé** plutôt qu'en barre — le rejeu d'un
  balayage ramène le numérateur à zéro, ce qu'une barre traduirait en recul
  inexplicable.
- **La première sauvegarde est explicite** : choisir un dossier ne déclenche
  rien. L'automatisme des 24 h ne s'applique qu'ensuite.
- **Archivage sur sélection** via la Revue de l'action, depuis la liste ou la
  vue Liens morts. La Revue annonce avant d'agir combien de copies partent,
  combien sont déjà archivées, pour quel volume et quelle durée.
- **Marqueur « Archivé »** à trois états, distinguant l'archive locale de la
  copie permanente qui vit chez Raindrop.

#### La vue Tags se traverse au clavier (2026-09-19)

- **Elle demandait plus de mille deux cents arrêts de tabulation.** 317
  étiquettes à quatre contrôles chacune, et aucune navigation par zone : la
  traverser au clavier était impraticable. Elle ne prend plus qu'**un** arrêt,
  les flèches y circulent, Entrée ouvre les contrôles d'une ligne et Échap les
  referme — le comportement déjà en place dans la barre latérale, la liste et
  les vues de Nettoyage.

#### Les liens morts se voient enfin dans la liste (2026-09-19)

- **Un lien mort, une redirection ou un doublon borde désormais sa ligne**
  dans la liste principale, la mosaïque et la vue Collection. La marque
  existait dans le code depuis des semaines, sans personne pour l'alimenter :
  le diagnostic ne se voyait que dans les vues de Nettoyage, jamais là où
  l'on passe son temps.
- Une ligne ne porte qu'**une** marque, et « mort » l'emporte sur
  « doublon » : un lien cassé ne se répare pas en rangeant.
- **L'absence de marque ne certifie rien**, et c'est écrit dans la direction
  visuelle : elle recouvre « vérifié sain », « jamais vérifié » et « périmé ».
  La liste n'est pas un bilan de santé — le Nettoyage l'est, et lui dit
  honnêtement ce qui n'a jamais été mesuré.

#### Passe design — la barre de sélection (2026-09-19)

- **« Tout désélectionner » existe.** Une sélection ne pouvait pas se défaire
  autrement qu'en décochant chaque signet un par un. La commande vit en fin
  de barre, après les actions : elle défait, elle n'engage rien.
- **La barre ne s'affiche plus sur un ensemble vide.** Garder une sélection en
  changeant de vue est voulu ; mais arriver dans une collection qui n'en
  contient aucun montrait une barre « 0 sélectionnés » offrant corbeille et
  archivage sur du vide. La garde porte désormais sur ce qui est réellement
  actionnable ici.
- **Les étiquettes rognées restent lisibles.** Dans une ligne étroite, les
  pilules se comprimaient toutes ensemble jusqu'au moignon ; elles sont
  désormais rognées entières.

#### Barres de progression et temps restant (2026-09-19)

- **Les trois travaux longs — analyse, sauvegarde, archivage — montrent une
  barre et une estimation du temps restant.**
- **Une barre par ÉTAPE, jamais une barre du job entier.** Une analyse de liens
  en compte deux (lecture de la bibliothèque, puis vérification), une
  sauvegarde cinq, aux totaux sans rapport : une barre unique y sauterait en
  arrière sans explication. Chaque barre mesure l'étape que la phrase au-dessus
  d'elle nomme — et le nom de l'étape s'affiche désormais aussi pendant
  l'analyse, où il manquait.
- **L'estimation vient du débit observé**, jamais d'une durée écrite en dur :
  un réseau lent, une reprise après quota ou une bibliothèque deux fois plus
  grande la corrigent d'eux-mêmes. Elle se tait tant qu'elle ne vaut rien —
  mieux vaut ne rien annoncer qu'un temps calculé sur deux mesures collées — et
  s'exprime en ordres de grandeur, la précision à la seconde étant une
  exactitude qu'elle n'a pas.
- Un travail sans total connu n'affiche **aucune** barre : figée ou inventée,
  elle mentirait.

#### Filtre par plusieurs étiquettes (2026-09-19)

- **Une étiquette cliquée entre dans le filtre ; recliquée, elle en sort.**
  Jusqu'ici le clic *remplaçait* la recherche par `#tag` : une seconde
  étiquette écrasait la première, et il n'existait aucun moyen de croiser
  deux étiquettes. Le geste est le même partout — ligne de liste, fiche,
  vue Collection, vue Tags, barre latérale, palette ⌘K.
- **Les étiquettes retenues se lisent en rangée sous la recherche**, chacune
  retirable d'un clic, avec un « et » entre elles et un « tout retirer » à
  partir de deux. La pilule retenue **inverse ses valeurs en gardant sa
  teinte** : son rôle change, pas son identité.
- **La vue Tags sait filtrer sur les cases cochées** — elles ne servaient
  qu'à la fusion, alors que c'est le seul endroit de l'application qui
  ressemblait déjà à « cocher plusieurs étiquettes ».
- Le filtre vit dans un champ `tags` à part, composé en termes `#"…"` **par
  le sidecar** : le front ignore la syntaxe de recherche de Raindrop, et une
  étiquette se retire sans chirurgie de chaîne.

**Mesuré en réel avant d'écrire** (12 210 signets, lecture seule) : les
étiquettes s'intersectent (`#webdesign` 1713, `#code` 886, les deux **113** ;
trois → 1), l'opérateur ignore la casse, les guillemets sont transparents —
et **l'union n'existe pas** (`#a OR #b` rend 60, « OR » étant lu comme un mot).
L'interface ne propose donc aucun choix ET/OU : il n'y a rien derrière.
Vérifié ensuite de bout en bout à travers le sidecar : mêmes chiffres, au
signet près, y compris croisé avec le filtre de domaine.

#### Les trois dettes de taille, soldées (2026-09-19)

- **`runtime.rs` et `node.rs` étaient à 400 lignes pile** — le plafond dur :
  la prochaine ligne ajoutée dans l'un ou l'autre faisait échouer tout build.
  Découpés à leurs frontières naturelles **avant** la retouche, comme le veut
  la règle : la vérification SHASUMS dans `verification.rs`, la liste des
  endroits où chercher Node dans `candidats.rs`. 66 tests Rust au vert.
- **`sauvegarde.ts` au-dessus de la cible** : son contrat — quatre interfaces
  documentées — quitte l'orchestration pour `contrat-sauvegarde.ts`, que les
  consommateurs qui ne font que parler de sauvegardes importent sans la
  fabrique. 328 → 280.

#### Le retour d'usage sur les vues de Nettoyage (2026-09-20)

- **L'écran des doublons dit vrai après une suppression** : les copies
  corbeillées sortent des groupes immédiatement, et un groupe réduit à un
  exemplaire cesse d'être présenté comme un doublon — sans re-scan.
- **« Corbeille de la sélection (n) »** : des copies cochées dans
  *plusieurs* groupes partent en une seule Revue, chacune vers le gardé de
  son groupe. Les non-taggés ont aussi leur corbeille, à côté d'Étiqueter.
- **Un bouton Retour** sur chaque vue de traitement et dans la Revue —
  verrouillé pendant qu'un travail court.

#### L'en-tête plein-fond et le shell poli (2026-09-20)

- **Les pastilles macOS se posent sur notre en-tête** (`titleBarStyle:
  "Overlay"`), qui reste le nôtre — même surface, même filet, aucun chrome
  simulé. Les vides de l'en-tête traînent la fenêtre ; les contrôles restent
  des contrôles. La forme est écrite dans DESIGN.md §8bis.
- **Le thème `system` suit l'OS à chaud** : basculer macOS bascule
  l'application, sans rechargement. Un mode forcé (clair ou sombre) n'écoute
  pas — l'OS n'écrase pas un choix.
- **`prefers-reduced-motion` est respecté partout**, plus seulement sur la
  barre latérale : qui demande moins d'animation garde tous les états, sans
  mouvement.
- **Le premier rendu naît dans la surface de l'application**, pas dans le
  blanc WebKit (en sombre, l'éclair initial demeure — gardé pour quand il
  dérange).
- **Deux glyphes originaux** au trait de la maison : corbeille et restaurer,
  posés sur les seuls verbes qui détruisent ou exécutent.

#### Les vues de Nettoyage deviennent actionnables (2026-09-19)

- **Tout sélectionner (page)** et **mettre à la corbeille** depuis les liens
  morts — le même chemin que la liste principale : Revue, réversible,
  restaurable à l'origine.
- **Les doublons se trient.** Cases sur chaque copie, « Garder le meilleur »
  (la plus ancienne — l'original ; https en départage), corbeille du groupe,
  et **« Trier les doublons » global** d'un coup vers une seule Revue. Garde
  structurelle : **le dernier exemplaire d'un groupe ne peut pas être coché**
  — un groupe garde toujours un représentant.
- **Rien de ce qui distingue une copie ne meurt avec elle** : ses étiquettes
  remontent dans le gardé avant la corbeille (consolidation en job,
  progression visible). Les surlignages restent dans les copies — la
  corbeille est réversible, et le Phase 1 les tient en lecture seule.
- **Étiqueter les non-taggés** depuis leur vue, en masse, via la Revue.
- **Un tiers du flou était du bruit** : 163 des 551 signets flous étaient
  groupés par le seul titre d'interstitiel « Weiterleitungshinweis », à
  travers des pages sans rapport. Ces titres ne groupent plus — correction
  effective immédiatement, sans re-scan.

#### Le typecheck couvre désormais les tests (2026-09-19)

- `tsconfig.json` sert aussi de config de build, il excluait donc tests et
  tooling — et `npm run typecheck` avec lui. `tsconfig.check.json` reprend le
  même périmètre sans ces exclusions, chaîné dans `typecheck` : une erreur de
  type dans un `*.test.ts` casse désormais le typecheck (prouvé en plantant
  une erreur et en la voyant vue).
- **Les 30 erreurs que la cécité cachait étaient toutes réelles** : imports
  depuis un module qui n'exporte pas le symbole (tuant l'inférence des
  paramètres voisins), chemins erronés, helpers annotés d'un type qu'ils ne
  tenaient pas, fixtures incomplètes — et un type de production contredisant
  son propre runtime : `acquireLock` refusait `pid` que la transmission
  réelle honore et qu'un test dépend pour simuler un sidecar mort.

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

#### Le champ Domaine ne filtrait rien (2026-09-17)

- **La bibliothèque entière revenait**, quel que soit le domaine demandé : le
  pont MCP envoie `domain` en paramètre d'URL, que l'API Raindrop ignore. Le
  filtre est désormais composé dans la recherche, où il existe vraiment. La
  saisie est normalisée au passage — minuscules, sans schéma, sans `www.`, sans
  chemin — car l'opérateur exige le domaine exact et rend zéro **sans
  erreur** pour toute autre forme : coller une URL donnait un écran vide
  que rien n'expliquait. Mesuré de bout en bout : 12 210 → 64.

#### Nettoyage — sept défauts, tous mesurés (2026-09-19)

- **Un lien mort partagé par plusieurs signets n'apparaissait qu'une fois.**
  Les résultats d'analyse étaient rangés par adresse, pas par signet : sur la
  bibliothèque réelle, 430 signets partagent une URL au caractère près, soit
  jusqu'à **242 signets morts invisibles**. On réparait celui qu'on voyait, les
  autres restaient morts et rien ne l'aurait jamais signalé.
- **« Liens morts : 0 » ne s'affiche plus quand aucune analyse n'a tourné.**
  Trois compteurs se lisaient comme un bilan de santé là où personne n'avait
  regardé ; les vues disaient « Rien ici », c'est-à-dire « plus rien à
  réparer ». Elles annoncent maintenant l'absence d'analyse et portent le
  bouton qui la lance.
- **Une analyse en cours se suit et s'annule même après avoir quitté la vue.**
  Elle devenait invisible **et inarrêtable** : sur 12 210 liens, c'est long.
- **« À vérifier à la main » a son compteur et sa vue.** Les liens rendus
  indéterminés par un anti-bot ou un quota (401/403/429) existaient dans le
  code et dans la doctrine, mais rien ne les montrait — ni morts, ni sains,
  ni visibles.
- **Le compteur de doublons dit les deux nombres.** « 414 » se lisait
  « 414 signets en double » ; ce sont 414 groupes pour **1 032 signets**, dont
  **618 copies retirables** — le seul nombre qui dise ce qu'on gagne à
  nettoyer, et il n'apparaissait nulle part.
- **Une même adresse n'est plus vérifiée une fois par signet** : 11 968
  adresses distinctes pour 12 210 signets, soit 242 requêtes épargnées sans
  qu'aucun signet perde son diagnostic.
- **Une analyse interrompue reprend où elle en était, et le dit.** Elle le
  faisait déjà en silence, sous un écran qui annonçait « Dernier scan :
  jamais » au-dessus de milliers de liens déjà vérifiés.

#### Les archives : mémoire, budget et silence (2026-09-19)

- **Une copie permanente volumineuse ne passe plus entière en mémoire.** Elle
  était chargée d'un bloc puis recomprimée — deux allocations de 160 Mo pour la
  plus grosse mesurée. L'écriture se fait en flux, et par un fichier temporaire
  renommé à la fin : une connexion qui tombe ne laisse jamais une archive
  tronquée qui se présenterait comme bonne.
- **L'archivage s'arrête quand le budget est plein**, au lieu d'écrire jusqu'à
  1,6 Go d'un seul geste que l'éviction rongerait aussitôt. Les signets
  restants sont annoncés comme **non traités**, pas comme des échecs : ils
  n'ont pas raté, ils n'ont pas été essayés.
- **Le ménage des archives ne se fait plus en silence.** La purge des archives
  devenues inutiles et l'éviction faute de place tournent pendant une
  sauvegarde de fond que personne n'a demandée ; elles sont désormais comptées
  et affichées à la fin du job. Rien n'est affiché quand rien n'a été retiré.

Mesure à l'origine de ce lot : le budget de 5 Go avait été calibré sur « 2,1 Mo
par copie ». Sur les 8 875 copies réelles, la moyenne est de **3,18 Mo** (max
160,67) — le budget tient donc ~1 600 archives et non ~2 400, et l'éviction
n'est pas un cas limite mais une certitude.

#### La sauvegarde survit à un hoquet du réseau (2026-09-19)

- **Un 429 ou un timeout au milieu d'un balayage n'avorte plus le job.** Sur
  245 requêtes l'un comme l'autre sont routiniers ; jusqu'ici ils faisaient
  perdre tout le travail déjà fait, soit 2 min 20 à refaire pour un hoquet
  d'une seconde. La lecture du job est désormais enveloppée d'une reprise :
  429 → pause de 4, 8 puis 16 s ; 5xx et pannes réseau → 1, 2 puis 4 s.
- **Un jeton révoqué, lui, échoue tout de suite.** 401, 403 et 404 ne se
  retentent pas : les rejouer ferait d'une erreur claire une panne lente et
  inexplicable.
- **L'interface ne se fige pas pendant la pause** : l'attente a lieu hors du
  créneau de la file, le rang interactif passe devant comme d'habitude.
- **Annuler reste immédiat, et honnête.** La pause se dort par tranches, donc
  un « annuler » est vu en moins d'un quart de seconde ; et une erreur qui
  survient alors qu'on vient d'annuler se nomme « annulée », jamais
  « http 429 » — aux deux endroits où elle peut naître.

Lectures seulement, par construction : le module décore le canal de lecture,
qui n'expose que des GET. Rejouer une écriture dont on ignore si elle a abouti
la ferait potentiellement deux fois.

#### Interface — épure et corrections d'usage (2026-09-18 → 2026-09-19)

- **Panneaux rétractables** : la barre latérale se replie et s'en souvient ;
  le volet de détail ne s'affiche que sur un signet ouvert, et se referme par
  une croix ou par Échap. Occupé en permanence par « Sélectionnez un
  bookmark », il coûtait le tiers de la largeur utile pour ne rien dire.
- **Le texte devient l'exception** : neuf commandes passent en icône
  (pagination, éditer, enregistrer, annuler, renommer, effacer les filtres,
  fermer, exporter, choisir un dossier). Gardent leurs mots les verbes qui
  détruisent ou exécutent, et tout ce qui porte un compte — un nombre ne se
  dessine pas. Chaque icône conserve exactement le nom accessible du texte
  qu'elle remplace.
- **Poignée de déplacement** sur chaque ligne : rien n'annonçait qu'elle se
  tirait.
- **Toutes les étiquettes sont cliquables**, y compris dans la fiche et dans
  la vue Tags — une étiquette ressemble partout à la même chose, en rendre la
  moitié inerte fait douter de l'autre.
- **Lexique thématique** : de 63 à ~250 mots, **neuvième thématique
  `éducation`**, et le pluriel cesse de compter (« livres » vaut « livre »,
  « jeux vidéos » vaut « jeu vidéo »). Mesuré sur 317 étiquettes réelles :
  **75 % des étiquettes affichées sortaient grises, contre 3 % ensuite.**

#### Défauts trouvés à l'usage (2026-09-18 → 2026-09-19)

Tous trouvés **en usage réel ou sur données réelles**, aucun par la suite de
tests. C'est en soi l'enseignement de ces deux journées.

- **Les archives contenaient du HTML en clair** sous un nom `.html.gz` que
  `gunzip` refusait. L'objet S3 est annoncé `Content-Encoding: gzip`, et
  `fetch` le déplie de façon transparente : « écrire tel quel » écrivait
  5,6 Mo de clair là où l'objet stocké en fait 3,1. Le test ne l'avait pas
  vu parce que le faux serveur servait les octets gzippés **sans l'en-tête
  d'encodage** — un faux infidèle sur un seul en-tête rend aveugle le test
  qui prétend couvrir ce chemin.
- **Le compte de signets était un zéro inventé.** L'endpoint `/user` de
  Raindrop ne porte aucun compte, et un repli silencieux en fabriquait un :
  le premier lancement annonçait « — 0 signets » sur une bibliothèque de
  12 210. Le compte se dérive maintenant d'une lecture réelle, et reste
  **absent** plutôt que nul s'il est indisponible.
- **Un signet sans identifiant numérique était perdu en silence** — et
  définitivement : le rafraîchissement incrémental faisait avancer son repère
  temporel, donc l'élément n'aurait plus jamais été relu, puis le jetait faute
  de clé. La fusion le jetait aussi. Les deux le conservent désormais.
- **Les dossiers de sauvegarde orphelins fuyaient.** Un balayage interrompu
  laissait ~11 Mo que rien ne ramassait, et un manifeste corrompu rendait tous
  les dossiers antérieurs définitivement inatteignables. Une même
  réconciliation règle les deux : `meta.json` tranche — présent, l'instantané
  est ré-adopté ; absent, le dossier est ramassé, et c'est journalisé.
- **La sentinelle du défilement infini redemandait la même page cinq fois.**
  Mesuré dans la fenêtre Tauri. Son observateur est recréé à chaque rendu, or
  charger une page en provoque un : elle se réarmait et rappelait. La file du
  sidecar étant séquentielle, ces doublons affamaient le reste de l'écran —
  une fiche restait en « Chargement… » pendant que la liste se rattrapait.
- **Une fiche bloquée enfermait l'utilisateur** : le bouton de fermeture ne
  vivait que dans le rendu principal, absent des états de chargement et
  d'erreur.
- **L'icône des Réglages était un soleil** — un cercle et huit rayons droits,
  le même dessin que la bascule de thème posée juste à côté.
- **« 1 instantanés conservés »** : le dictionnaire ne savait pas accorder en
  nombre. Il le sait, avec la règle française — le singulier vaut pour 0 comme
  pour 1.
- **Aucun chiffre mesuré n'est plus écrit en dur dans l'interface** : une
  durée relevée sur une bibliothèque cesse d'être vraie pour une autre, et pour
  celle-là dès qu'elle change de taille.

### Pré-versions publiées

`v0.1.0-pre.1` (2026-09-17) à `v0.1.0-pre.5` (2026-09-19), macOS Apple
Silicon, signature ad-hoc. `pre.2` et `pre.3` ont vu leurs binaires
**remplacés** après publication, un défaut ayant été trouvé à l'usage dans
l'heure — les notes de chaque version le disent.

### Problèmes connus

- Écriture des surlignages, agent IA, moteur de règles et packaging
  restent hors périmètre de la Phase 1 (spécification §12).
- **Une sauvegarde interrompue par l'arrêt de l'application recommence de
  zéro.** La coupure *réseau*, elle, est rattrapée depuis le 2026-09-19 (voir
  plus haut) ; c'est la reprise à travers un redémarrage du processus qui reste
  différée — un arbitrage, pas un oubli : reprendre à la page N suppose que la
  pagination n'ait pas bougé, or l'écart entre deux lancements n'est pas borné,
  et le gain se chiffre à 2 min 20 de travail de fond.
- **L'automatisme de sauvegarde des 24 h reste dormant** tant qu'aucune
  sauvegarde n'a été lancée à la main — conséquence assumée du choix
  « première sauvegarde explicite ».
- **L'analyse des liens n'a jamais été exécutée en grand.** Elle vérifierait
  11 968 adresses distinctes auprès d'autant de serveurs tiers ; seuls ses
  mécanismes sont éprouvés — dédoublonnage confirmé sur le sidecar réel,
  reprise après interruption couverte par trois tests. Sa durée réelle, son
  taux de liens indéterminés et sa tenue sur la longueur restent inconnus.
- Le budget d'archives de 5 Go tient **~1 600 archives** et non ~2 400 : il
  avait été calibré sur « 2,1 Mo pièce », la mesure réelle donne 3,18 Mo en
  moyenne. Le nombre est inchangé — c'est un budget, pas une prédiction — mais
  l'éviction qu'il provoque est désormais annoncée.
