export const fr = {
  "app.title": "Raindrop GUI",
  "nav.all": "Tous",
  // Remplace « Non-lus » (demande du 2026-09-20 : la bibliothèque n'a aucun
  // non-lu, l'entrée ne correspondait à rien). « Non classés » est la
  // collection -1 de Raindrop : réelle, listable, destination de dépôt.
  "nav.unsorted": "Non classés",
  "nav.favorites": "Favoris",
  "nav.trash": "Corbeille",
  "nav.untagged": "Non-taggés",
  "nav.collections": "Collections",
  "nav.expand": "Déplier {title}",
  "nav.collapse": "Replier {title}",
  "nav.tags": "Tags",
  "nav.replier": "Replier la barre latérale",
  "nav.deplier": "Déplier la barre latérale",
  "nav.cleanup": "Nettoyage",
  "collection.seeAll": "Voir les {n} →",
  "collection.direct": "Signets de cette collection",
  "search.placeholder": "Rechercher…",
  // Nom accessible du champ : un placeholder ne fait un nom qu'en dernier
  // recours, et disparaît dès qu'on saisit.
  "search.label": "Rechercher",
  "sort.created-desc": "Récents",
  "sort.created-asc": "Anciens",
  "sort.title-asc": "Titre A→Z",
  "sort.title-desc": "Titre Z→A",
  "sort.domain-asc": "Domaine",
  // §9 « une icône par geste » : la bascule d'affichage est une seule icône,
  // nommée par le mode VERS LEQUEL elle bascule.
  "view.showList": "Afficher en liste",
  "view.showMosaic": "Afficher en mosaïque",
  "list.select": "Sélectionner {title}",
  "list.deplacer": "Déplacer {title}",
  "detail.fermer": "Fermer le détail",
  "drag.count": "{n} signet|{n} signets",
  "list.loadingMore": "…",
  "filter.sort": "Tri",
  "filter.domain": "Domaine",
  "filter.domainPlaceholder": "domaine",
  "filter.from": "Depuis",
  "filter.to": "Jusqu'à",
  // §9 « révélé, pas posé » : domaine et dates se déplient depuis la barre.
  "filter.advanced": "Filtres avancés",
  "filter.clear": "Effacer les filtres",
  // Le filtre par étiquettes. « Retenue » plutôt que « sélectionnée » : la
  // sélection, dans cette interface, désigne les SIGNETS cochés (BulkBar) —
  // deux sélections concurrentes à l'écran auraient porté le même nom.
  "filter.tagsLabel": "Étiquette retenue|Étiquettes retenues",
  "filter.removeTag": "Retirer l'étiquette {name}",
  "filter.clearTags": "Retirer toutes les étiquettes",
  // L'intersection n'est pas un choix d'interface : l'API n'offre que ça
  // (`OR` n'est pas un opérateur — mesuré). Le dire évite de chercher le
  // réglage qui n'existe pas.
  "filter.tagsEt": "et",
  "nature.link": "Liens",
  "nature.article": "Articles",
  "nature.image": "Images",
  "nature.video": "Vidéos",
  "nature.document": "Documents",
  "nature.audio": "Audio",
  "detail.edit": "Modifier",
  "detail.save": "Enregistrer",
  "detail.cancel": "Annuler",
  "detail.favorite": "Favori",
  "detail.unfavorite": "Retirer des favoris",
  "detail.trash": "Mettre à la corbeille",
  // Le geste inverse, pour un signet DÉJÀ en corbeille (fiche, vue -99) :
  // re-corbeiller un corbeillé était le seul geste proposé — absurde.
  "detail.restore": "Restaurer",
  "bulk.restore": "Restaurer ({n})",
  // Les corbeillés SANS origine mémorisée : non restaurés par le bloc, et
  // jamais confondus avec des restaurés (§5 : l'état se dit tel quel).
  "bulk.restore.unknown": "{n} élément sans origine connue — non restauré|{n} éléments sans origine connue — non restaurés",
  "detail.highlights": "Surlignages",
  "detail.guest": "Sélectionnez un bookmark pour voir le détail.",
  "detail.breadcrumb": "Fil d'Ariane",
  // Lecture du contenu archivé (spec lecture §3) — chaque état porte SA
  // raison, jamais un « http 404 » nu (§5).
  "lecture.fermer": "Fermer la lecture",
  "lecture.badgeLocale": "Archive locale",
  "lecture.badgeCopie": "Copie permanente",
  "lecture.date": "Archive du {date}",
  "lecture.introuvable": "L'archive a disparu entre l'affichage de la fiche et votre clic.",
  "lecture.tropVolumineuse": "Cette archive dépasse la taille maximale lisible (64 Mo décompressés).",
  "lecture.illisible": "L'archive n'a pas pu être lue — elle est peut-être défectueuse.",
  "lecture.extractionVide": "Aucun texte n'a pu être extrait de cette archive.",
  // Le temps de lecture, CALCULÉ sur l'extraction (~220 mots/min) — jamais
  // deviné, jamais en dur.
  "lecture.temps": "≈ {n} min de lecture",
  "lecture.telecharge": "Téléchargement de la copie permanente…",
  // L'issue de secours des états d'échec (§5) — posée ICI car la vue la
  // rend dès cette tâche ; les autres gestes de la fiche viennent à la
  // tâche suivante.
  "detail.voirPage": "Voir la page",
  // Les gestes de la fiche (spec lecture §1 et §5) : « Lire » nomme ce qui
  // manque quand il est désactivé. « Voir la page » est DÉJÀ posé (Task 6 —
  // la vue lecture l'utilise comme issue de secours).
  "detail.lire": "Lire",
  "detail.lireSansCopie": "Ni archive locale ni copie permanente : rien à lire hors ligne.",
  "detail.lireCopieEchec": "Copie permanente en échec côté Raindrop ({raison}).",
  "detail.lireAttente": "Un archivage est déjà en cours — la lecture sera possible une fois terminé.",
  // Les six états de `cache.status`, TRADUITS (jamais un identifiant brut à
  // l'écran — même motif que LABELS_PROGRESSION).
  "copie.retry": "nouvel essai programmé",
  "copie.failed": "échec",
  "copie.invalidOrigin": "origine invalide",
  "copie.invalidTimeout": "délai dépassé",
  "copie.invalidSize": "taille invalide",
  "copie.inconnue": "état inconnu",
  "bulk.selected": "{n} sélectionné(s)",
  "bulk.trash": "Corbeille",
  "bulk.move": "Déplacer",
  "bulk.tag": "Tagger",
  "bulk.selection": "sélection",
  "bulk.destination": "Destination",
  // §9 « un seul point d'entrée par geste » : le verbe reste au bouton — ni
  // l'option muette du select, ni le champ d'étiquettes ne le répètent.
  "bulk.chooseCollection": "Choisir une collection…",
  "bulk.tagField": "Étiquettes à ajouter",
  "bulk.tagPlaceholder": "séparées par des virgules",
  "bulk.review": "Revue de l'action",
  "bulk.archive": "Archiver la copie",
  "cleanup.archiver": "Archiver la copie ({n})",
  "marque.archive": "Archivé",
  "marque.copiable": "Copie permanente disponible — pas encore archivée en local",
  "composer.placeholder": "Coller une URL à sauvegarder (⌘E)",
  "composer.exists": "Déjà sauvegardé",
  "composer.save": "Sauvegarder",
  "composer.titleAria": "Titre",
  "cmdk.placeholder": "Rechercher bookmarks, collections, tags, commandes…",
  "cmdk.hintBookmark": "Bookmark",
  "cmdk.hintCollection": "Collection",
  "cmdk.hintTag": "Tag",
  "cmdk.hintView": "Vue",
  "bulk.clear": "Tout désélectionner",
  "cleanup.title": "Nettoyage",
  "cleanup.dead": "Liens morts",
  "cleanup.redirects": "Redirections",
  // DOMAINE.md : 401/403/429 — anti-bot, quota. « Jamais classé mort » : le
  // libellé nomme donc ce qu'il reste à faire, pas un verdict.
  "cleanup.indeterminate": "À vérifier à la main",
  "cleanup.duplicates": "Doublons",
  // Le compteur dit les DEUX nombres : « 414 » seul se lisait « 414 signets en
  // double », alors que ce sont 414 groupes pour 1 032 signets concernés.
  "cleanup.duplicatesCount": "{n} groupe · {items} signets|{n} groupes · {items} signets",
  "cleanup.dupDetail": "{items} signet(s) · {retirables} copie retirable|{items} signet(s) · {retirables} copies retirables",
  "cleanup.untagged": "Non-taggés",
  "cleanup.empty-collections": "Collections vides",
  "cleanup.trash": "Corbeille",
  "cleanup.lastScan": "Dernier scan",
  // L'estimation du temps restant. « environ » et non un chiffre exact : elle
  // repose sur un débit observé, qui varie.
  "progress.label": "Progression",
  "eta.moinsDUneMinute": "moins d'une minute",
  "eta.minutes": "environ {n} minute|environ {n} minutes",
  "eta.heures": "environ {n} h {minutes}",
  "eta.restant": "{duree} restante|{duree} restantes",
  // Le quatrième état d'une liste de diagnostic : jamais mesuré ≠ rien à
  // réparer. Sans lui, un écran vide se lisait comme un bilan de santé.
  "state.neverScanned": "Aucune analyse n'a encore été lancée : rien n'a été mesuré.",
  "cleanup.jamaisAnalyse": "jamais analysé",
  // La reprise, rendue visible. Aucun chiffre en dur : tout vient du cache.
  "sauvegarde.repriseLiens": "{verifies} / {total} liens déjà vérifiés — l'analyse reprendra les suivants.",
  "cleanup.never": "jamais",
  "cleanup.scan": "Lancer l'analyse",
  "cleanup.rescan": "Relancer",
  "cleanup.cancel": "Annuler le scan",
  "cleanup.scanRunning": "Analyse en cours",
  "cleanup.scanning": "Analyse en cours… {done}/{total}",
  "cleanup.reverifier": "Revérifier ({n})",
  "cleanup.rechecking": "Revérification… {done}/{total}",
  "cleanup.replace-url": "Remplacer par l'URL finale",
  "cleanup.restore": "Restaurer",
  "cleanup.unknown-origin": "Origine inconnue — choisir une destination",
  "cleanup.empty-trash": "Vider la corbeille",
  "cleanup.delete-empty": "Supprimer les collections vides",
  "cleanup.wayback": "Chercher une copie archivée",
  "cleanup.orphelin": "Signet disparu de la bibliothèque — la ligne se garde, ses actions de masse ne s'y appliquent plus",
  "cleanup.dup-exact": "Doublons exacts",
  "cleanup.dup-normalized": "Doublons normalisés",
  "cleanup.dup-fuzzy": "Doublons flous",
  "cleanup.redirect-permanent": "redirection permanente",
  "cleanup.redirect-temporary": "redirection temporaire",
  "cleanup.prev": "Précédente",
  "cleanup.next": "Suivante",
  "cleanup.page": "Page {n}/{total}",
  "cleanup.delete-collection": "Supprimer la collection",
  // Les actions du Nettoyage (lot 2026-09-19, « les vues deviennent
  // actionnables »).
  "cleanup.toutSelectionner": "Tout sélectionner (page)",
  "cleanup.corbeille": "Mettre à la corbeille ({n})",
  "cleanup.dupCoche": "Mettre « {title} » à la corbeille",
  // La règle du gardé, dite en une ligne : qui reste, et pourquoi (§10).
  "cleanup.dupRegle": "Gardée : {titre} (la plus ancienne)",
  "cleanup.dupMeilleur": "Garder le meilleur",
  "cleanup.dupCorbeille": "Corbeille ({n})",
  "cleanup.trierDoublons": "Trier les doublons ({n})",
  "cleanup.etiqueter": "Étiqueter ({n})",
  "cleanup.retour": "Retour",
  "cleanup.selectionCorbeille": "Corbeille de la sélection ({n})",
  "cleanup.selectionCorbeilleGarde": "Chaque groupe garde son exemplaire le plus ancien non coché",
  "review.dedupe": "Trier les doublons",
  // Ce qui va arriver, dit en toutes lettres — et ce qui N'arrive pas : les
  // surlignages restent dans les copies (Phase 1 lecture seule, corbeille
  // réversible).
  "review.dedupeNote": "Les étiquettes de chaque copie remontent dans le gardé (le plus ancien), puis les copies partent à la corbeille — réversible. Les surlignages restent dans la corbeille.",
  "review.dedupeGarde": "→ gardé : {titre}",
  "review.dedupeEnCours": "Consolidation et mise à la corbeille…",
  // Le terme du job dedupe est DIT : le silence a déjà caché une corbeille
  // entière qui ne faisait rien (défaut du 2026-09-20). Règle du `|` : `n`
  // porte l'accord (le singulier vaut pour 0), `etiquettes`/`raisons` en `(s)`.
  "review.dedupe.termine": "Terminé : {n} copie corbeillée · {etiquettes} étiquette(s) récupérée(s).|Terminé : {n} copies corbeillées · {etiquettes} étiquette(s) récupérée(s).",
  "review.dedupe.echec": "{n} copie NON corbeillée : {raisons}|{n} copies NON corbeillées : {raisons}",
  "review.dedupe.nonFusionnees": "{n} copie corbeillée sans ses étiquettes (lecture impossible) : {raisons}|{n} copies corbeillées sans leurs étiquettes (lecture impossible) : {raisons}",
  "tags.rename": "Renommer",
  "tags.merge": "Fusionner",
  "tags.delete": "Supprimer",
  "tags.newName": "Nouveau nom",
  "tags.renameField": "Nouveau nom de {name}",
  "tags.confirm": "Confirmer",
  // Le ménage des archives, porté jusqu'à l'écran : il tourne pendant une
  // sauvegarde de fond que l'utilisateur n'a pas demandée, et efface des
  // copies permanentes qu'il croyait gardées. §5.4 assume qu'une archive
  // évincée se recrée à la demande — encore faut-il savoir qu'elle a disparu.
  "sauvegarde.menageOrphelines": "{n} archive devenue inutile effacée|{n} archives devenues inutiles effacées",
  "sauvegarde.menageEvincees": "{n} archive évincée faute de place|{n} archives évincées faute de place",
  // L'archivage s'arrête au budget : ce qui reste n'a pas ÉCHOUÉ, il n'a pas
  // été tenté — deux choses que l'écran ne doit pas confondre.
  "review.archive.arret": "{n} signet non traité : {raison}|{n} signets non traités : {raison}",
  "tags.filterSelection": "Filtrer sur cette étiquette|Filtrer sur ces {n} étiquettes",
  "review.title": "Revue de l'action",
  "review.count": "{n} item(s) affecté(s)",
  "review.deselect": "Tout désélectionner",
  "review.filterPlaceholder": "Filtrer dans l'aperçu…",
  "review.export": "Exporter en CSV",
  "review.confirmL1": "Je confirme l'action sur {n} item(s)",
  "review.execute": "Exécuter",
  "review.typeDelete": "Tapez SUPPRIMER pour confirmer",
  "review.archive.annonce": "{n} copie(s) à archiver · {deja} déjà archivée(s), ignorée(s) · {sans} sans copie permanente.",
  "review.archive.volume": "Environ {volume}, {duree}.",
  "review.archive.inconnu": "Cette vue ne connaît pas l'état des copies : les signets qui n'en ont pas seront comptés en échec.",
  "review.archive.borne": "{n} sélectionné : la borne est de {borne} par archivage.|{n} sélectionnés : la borne est de {borne} par archivage.",
  "review.archive.lancement": "Lancement de l'archivage…",
  "review.archive.envol": "Archivage : {done} / {total} copies",
  "review.archive.termine": "Terminé : {reussis} archivée(s), {echoues} en échec.",
  "review.archive.annule": "Archivage annulé — ce qui est écrit reste.",
  // Premier lancement (spec §6) et écrans d'amorçage.
  "boot.title": "Connecter votre compte Raindrop",
  "boot.explain": "Raindrop GUI a besoin d'un jeton d'API pour lire votre bibliothèque. Il est conservé dans le trousseau macOS et ne quitte jamais cet ordinateur.",
  "boot.where": "Raindrop.io → Settings → Integrations → Create new app → Test token",
  "boot.tokenLabel": "Jeton d'API Raindrop",
  "boot.validate": "Valider",
  "boot.checking": "Vérification…",
  "boot.account": "Compte détecté : {name} ({email}) — {n} signet|Compte détecté : {name} ({email}) — {n} signets",
  "boot.accountSansCompte": "Compte détecté : {name} ({email})",
  "boot.enter": "Ouvrir la bibliothèque",
  // Réglages (spec §6) — remplacer le jeton, voir l'état de la connexion.
  "reglages.titre": "Réglages",
  "reglages.connexion": "Connexion",
  "reglages.pont": "Pont Raindrop",
  "reglages.note": "Le jeton est conservé dans le trousseau macOS et ne quitte jamais cet ordinateur.",
  "reglages.remplacer": "Remplacer le jeton",
  "reglages.deconnecter": "Déconnecter",
  "reglages.fermer": "Fermer",
  "reglages.refuse": "Ce jeton n'a pas été accepté par Raindrop.",
  // La version et le suivi des publications (2026-09-21).
  "reglages.version": "Version",
  "reglages.version.installee": "Installée :",
  "reglages.version.derniere": "Dernière :",
  "reglages.version.dispo": "mise à jour disponible",
  // Le journal consultable (2026-09-20) : une action « qui n'a rien fait »
  // se vérifie là, sans quitter l'application.
  "reglages.journal": "Journal",
  "reglages.journal.vide": "Rien encore aujourd'hui.",
  "reglages.journal.rafraichir": "Rafraîchir",
  "reglages.journal.copier": "Copier",
  "reglages.journal.copie": "Copié",
  // Les cinq états de lifecycle.ts, en français. Le front ne montre jamais
  // les identifiants internes.
  "reglages.mcp.connected": "Connecté",
  "reglages.mcp.starting": "Démarrage…",
  "reglages.mcp.restarting": "Reconnexion…",
  "reglages.mcp.crashed": "Interrompu",
  "reglages.mcp.stopped": "Arrêté",
  "reglages.mcp.inconnu": "—",
  "boot.nodeTitle": "Node est introuvable",
  // Amendement spec §3.2 (2026-09-17) : le geste principal est l'installation
  // du runtime géré ; les instructions manuelles restent le repli.
  "boot.nodeHelp": "Un runtime Node vérifié peut être installé dans le dossier de données de l'application. En repli, installez Node 20 ou supérieur manuellement (par exemple « brew install node »), puis relancez l'application.",
  "boot.installNode": "Installer Node",
  "boot.installing": "Installation de Node…",
  "boot.panneTitle": "Le service local n'a pas démarré",
  "boot.panneHelp": "Relancez l'application. Si le problème persiste, le journal de démarrage se trouve dans le dossier de données de l'application.",
  "boot.retrySaisie": "Saisir un autre jeton",
  // Le sidecar ENTIER est injoignable : distinct du crash MCP (le sidecar
  // vit, le pont est tombé) — ici rien ne répond, données et écritures.
  "banner.unreachable": "Sidecar local injoignable — aucune donnée ne peut être lue",
  "banner.crashed": "Connexion Raindrop interrompue",
  "banner.restart": "Redémarrer la connexion",
  "banner.offline": "Hors-ligne — lecture du cache seule, écritures désactivées",
  "state.loading": "Chargement…",
  "state.empty": "Rien ici",
  "state.error": "Erreur : {message}",
  "state.retry": "Réessayer",
  "theme.toDark": "Passer au thème sombre",
  "theme.toLight": "Passer au thème clair",

  // ─── Sauvegarde locale (spec sélection) ──────────────────────────────────
  // Les clés de progression sont celles qu'ÉMET le sidecar (stables, jamais
  // du français) — même motif que les états du pont : le front traduit, une
  // clé inconnue tombe sur le libellé neutre plutôt que de s'afficher brute.
  "sauvegarde.progress.bookmarks": "signets",
  "sauvegarde.progress.modifies": "éléments modifiés",
  "sauvegarde.progress.corbeille": "corbeille",
  "sauvegarde.progress.collections": "collections",
  "sauvegarde.progress.surlignages": "surlignages",
  "sauvegarde.progress.profil": "profil",
  "sauvegarde.progress.neutre": "Sauvegarde en cours…",
  "sauvegarde.duree.s": "environ {n} s",
  "sauvegarde.duree.min": "environ {n} min",

  "sauvegarde.titre": "Sauvegarde locale",
  "sauvegarde.aucun": "Aucun dossier choisi.",
  "sauvegarde.dossier": "Dossier :",
  "sauvegarde.introuvable": "Dossier configuré mais introuvable : {chemin}",
  "sauvegarde.introuvable.aide": "Le volume est peut-être absent. Choisissez un autre dossier, ou rebranchez celui-ci.",
  "sauvegarde.dernier": "Dernière sauvegarde : {date}",
  "sauvegarde.complet": "balayage complet",
  "sauvegarde.incremental": "incrémental",
  "sauvegarde.jamais": "Aucune sauvegarde encore.",
  "sauvegarde.instantanes": "{n} instantané conservé|{n} instantanés conservés",
  "sauvegarde.archives": "{n} copie archivée ({volume})|{n} copies archivées ({volume})",
  "sauvegarde.premiere": "La première sauvegarde est un balayage complet : {duree} et {requetes} requêtes pour {signets} signet.|La première sauvegarde est un balayage complet : {duree} et {requetes} requêtes pour {signets} signets.",
  // Repli quand la taille de la bibliothèque n'est pas encore connue : dire
  // ce que c'est, sans inventer un chiffre.
  "sauvegarde.premiere.sansCompte": "La première sauvegarde est un balayage complet : elle lit toute la bibliothèque.",
  "sauvegarde.choisir": "Choisir un dossier…",
  "sauvegarde.changer": "Changer de dossier…",
  "sauvegarde.retirer": "Retirer",
  "sauvegarde.retirer.note": "Retirer le dossier n'efface rien : le contenu reste sur le disque.",
  "sauvegarde.lancer": "Sauvegarder maintenant",
  "sauvegarde.annuler": "Annuler",
  "sauvegarde.compteur": "{done} / {total} {quoi}",
  "sauvegarde.reprise": "Reprise du balayage…",
  "sauvegarde.termine": "Sauvegarde terminée.",
  "sauvegarde.bascule": "Balayage complet : {raison}",
  "sauvegarde.annulee": "Sauvegarde annulée — elle n'est pas comptée comme valide.",

  // ─── Vues sauvegardées (smart lists, spec 2026-09-22) ────────────────────
  // La section de la barre latérale : les entrées, leurs commandes au
  // survol, et l'état d'échec du chargement (comme les autres requêtes).
  "smartlist.section": "Vues sauvegardées",
  "smartlist.renameAria": "Renommer la vue {name}",
  "smartlist.deleteAria": "Supprimer la vue {name}",
  "smartlist.renameField": "Nouveau nom de la vue",
  "smartlist.indisponible": "Vues sauvegardées indisponibles",
  // Le geste de création (TopBar, spec §4) : visible seulement quand un
  // filtre est actif ; le champ est prérempli de la recherche ou de la
  // première étiquette retenue.
  "smartlist.saveView": "Sauvegarder la vue",
  "smartlist.nameAria": "Nom de la vue sauvegardée",
  "smartlist.pose": "Enregistrer cette vue",
} as const;

export type FrKey = keyof typeof fr;

/** Une clé du dictionnaire, rien d'autre : le repli « rend la clé »
 *  masquait les fautes — une chaîne absente s'affichait brute à l'écran
 *  au lieu d'être refusée au typecheck. Les usages DYNAMIQUES (les seuls
 *  à ne pas pouvoir être vérifiés ici) construisent leur objet de clés en
 *  `as const` au lieu de caster (voir NatureChips). */
/**
 * Une valeur peut porter DEUX formes séparées par `|` — singulier puis
 * pluriel — choisies sur la variable `n` :
 *
 *     "{n} instantané conservé|{n} instantanés conservés"
 *
 * Règle française, et c'est là qu'elle diffère de l'anglais : **le singulier
 * vaut pour 0 comme pour 1** (« 0 instantané », « 1 instantané »), le pluriel
 * à partir de 2. Sans ce mécanisme on écrivait « 1 instantanés conservés ».
 *
 * Une chaîne à DEUX comptes variables ne s'accorde pas ainsi : elle passe `n`
 * pour celui qui porte l'accord, et garde la forme `(s)` pour l'autre.
 */
export function t(key: FrKey, vars?: Record<string, string | number>): string {
  const brut: string = fr[key];
  const formes = brut.split("|");
  // `n` absent sur une clé à deux formes : le singulier, qui est le repli le
  // moins faux — jamais un « {n} » laissé à l'écran.
  const nombre = typeof vars?.n === "number" ? vars.n : Number(vars?.n ?? 1);
  let s = formes.length === 2 ? (Math.abs(nombre) >= 2 ? formes[1]! : formes[0]!) : brut;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
