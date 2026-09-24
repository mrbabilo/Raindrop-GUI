// Textes de l'interface courante : navigation, liste, fiche, filtres,
// lecture, palette, états et erreurs, vues sauvegardées.
// Fusionnés par `../fr.ts` — une clé ne vit que dans UN fichier (fr.test.ts).
export const interfaceTextes = {
  "app.title": "Raindrop GUI",
  "nav.all": "Tous",
  // Remplace « Non-lus » (demande du 2026-09-20 : la bibliothèque n'a aucun
  // non-lu, l'entrée ne correspondait à rien). « Non classés » est la
  // collection -1 de Raindrop : réelle, listable, destination de dépôt.
  "nav.unsorted": "Non classés",
  "nav.favorites": "Favoris",
  "nav.trash": "Corbeille",
  "nav.untagged": "Sans étiquette",
  "nav.collections": "Collections",
  "nav.expand": "Déplier {title}",
  "nav.collapse": "Replier {title}",
  "nav.tags": "Étiquettes",
  "nav.replier": "Replier la barre latérale",
  "nav.deplier": "Déplier la barre latérale",
  "nav.cleanup": "Nettoyage",
  "collection.seeAll": "Voir les {n} →",
  "collection.direct": "Signets de cette collection",
  "search.placeholder": "Rechercher… (⌘F)",
  "search.placeholderDans": "Rechercher dans « {label} »… (⌘F)",
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
  "detail.largeur": "Largeur de la fiche",
  "drag.count": "{n} signet|{n} signets",
  // Ce qu'a fait un dépôt réussi (audit d'ergonomie du 2026-09-24).
  "drag.deplaces": "{n} signet déplacé|{n} signets déplacés",
  "drag.favoris": "{n} signet ajouté aux favoris|{n} signets ajoutés aux favoris",
  "drag.nonFavoris": "{n} signet retiré des favoris|{n} signets retirés des favoris",
  "drag.corbeilles": "{n} signet mis à la corbeille|{n} signets mis à la corbeille",
  "drag.etiquete": "« {tag} » posée sur {n} signet|« {tag} » posée sur {n} signets",
  "drag.annuler": "Annuler",
  "drag.fermerAvis": "Fermer l'avis",
  "list.loadingMore": "…",
  "list.vide": "Aucun signet ici — collez une URL ci-dessus pour en ajouter un.",
  "list.videCorbeille": "La corbeille est vide.",
  "list.videFiltre": "Aucun signet ne correspond à la recherche et aux filtres.",
  "list.effacerFiltres": "Effacer la recherche et les filtres",
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
  "detail.champExtrait": "Extrait",
  "detail.champNote": "Note",
  "detail.champCollection": "Collection",
  "detail.ajouterEtiquette": "Ajouter une étiquette",
  "detail.ajouterEtiquettePlaceholder": "Ajouter une étiquette…",
  "detail.favorite": "Favori",
  "detail.unfavorite": "Retirer des favoris",
  "detail.trash": "Mettre à la corbeille",
  // Le geste inverse, pour un signet DÉJÀ en corbeille (fiche, vue -99) :
  // re-corbeiller un corbeillé était le seul geste proposé — absurde.
  "detail.restore": "Restaurer",
  "detail.dansCorbeille": "Dans la corbeille — « Restaurer » le remet à sa place.",
  "detail.highlights": "Surlignages",
  "detail.guest": "Sélectionnez un signet pour voir le détail.",
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
  // CALCULÉ sur l'extraction (~220 mots/min) — jamais deviné, jamais en dur.
  "lecture.temps": "≈ {n} min de lecture",
  "lecture.telecharge": "Téléchargement de la copie permanente…",
  // Gestes de la fiche (spec lecture §1, §5) : « Voir la page » est aussi
  // l'issue de secours des échecs ; « Lire » désactivé nomme ce qui manque.
  "detail.voirPage": "Voir la page",
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
  "marque.archive": "Archivé",
  "marque.copiable": "Copie permanente disponible — pas encore archivée en local",
  "composer.placeholder": "Coller une URL à sauvegarder (⌘E)",
  "composer.exists": "Déjà sauvegardé",
  "composer.existsOuvrir": "Déjà sauvegardé — ouvrir la fiche",
  "composer.save": "Sauvegarder",
  "composer.titleAria": "Titre",
  "composer.urlAria": "URL à sauvegarder",
  "cmdk.placeholder": "Rechercher signets, collections, étiquettes, commandes…",
  "cmdk.hintBookmark": "Signet",
  "cmdk.hintCollection": "Collection",
  "cmdk.hintTag": "Étiquette",
  "cmdk.hintView": "Vue",
  "cmdk.titre": "Palette de commandes",
  "cmdk.aucun": "Aucun résultat pour « {q} »",
  // Le quatrième état d'une liste de diagnostic : jamais mesuré ≠ rien à
  // réparer. Sans lui, un écran vide se lisait comme un bilan de santé.
  "state.neverScanned": "Aucune analyse n'a encore été lancée : rien n'a été mesuré.",
  "tags.rename": "Renommer",
  "tags.merge": "Fusionner",
  "tags.delete": "Supprimer",
  "tags.newName": "Nouveau nom",
  "tags.renameField": "Nouveau nom de {name}",
  "tags.confirm": "Retirer de {n} signet|Retirer de {n} signets",
  "tags.filterSelection": "Filtrer sur cette étiquette|Filtrer sur ces {n} étiquettes",
  // Le sidecar ENTIER est injoignable : distinct du crash MCP (le sidecar
  // vit, le pont est tombé) — ici rien ne répond, données et écritures.
  "banner.unreachable": "Service local injoignable — aucune donnée ne peut être lue. S'il ne revient pas, relancez l'application.",
  "banner.crashed": "Connexion Raindrop interrompue",
  "banner.restart": "Redémarrer la connexion",
  "banner.offline": "Hors ligne — les données affichées peuvent dater, et les modifications sont suspendues jusqu'au retour du réseau.",
  "state.loading": "Chargement…",
  "state.empty": "Rien ici",
  "state.error": "Erreur : {message}",
  "state.retry": "Réessayer",
  // Les échecs d'API, dits avec la marche à suivre (§10) — lib/api.ts.
  "erreur.delaiRaindrop": "Raindrop n'a pas répondu à temps. Réessayez dans un instant.",
  "erreur.quota": "Trop de requêtes vers Raindrop : patientez une minute, puis réessayez.",
  "erreur.pont": "La connexion à Raindrop s'est interrompue. Redémarrez-la depuis la bannière, puis réessayez.",
  "erreur.refus": "Raindrop a refusé l'opération ({detail}).",
  "erreur.inattendue": "Le service local a répondu par une erreur inattendue ({detail}).",
  "erreur.horsLigne": "Hors ligne : la modification n'a pas été envoyée. Réessayez au retour du réseau.",
  "erreur.injoignable": "Le service local ne répond pas. S'il ne revient pas, relancez l'application.",
  "erreur.delaiLocal": "Le service local n'a pas répondu à temps. Réessayez dans un instant.",
  "theme.toDark": "Passer au thème sombre",
  "theme.toLight": "Passer au thème clair",
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
