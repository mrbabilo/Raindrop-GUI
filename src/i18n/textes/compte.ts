// Textes du compte et de la machine : premier lancement, Réglages,
// sauvegarde locale.
// Fusionnés par `../fr.ts` — une clé ne vit que dans UN fichier (fr.test.ts).
export const compte = {
  // La reprise, rendue visible. Aucun chiffre en dur : tout vient du cache.
  "sauvegarde.repriseLiens": "{verifies} / {total} liens déjà vérifiés — l'analyse reprendra les suivants.",
  // Le ménage des archives se dit : il efface, pendant une sauvegarde de fond,
  // des copies qu'on croyait gardées (§5.4 — encore faut-il le savoir).
  "sauvegarde.menageOrphelines": "{n} archive devenue inutile effacée|{n} archives devenues inutiles effacées",
  "sauvegarde.menageEvincees": "{n} archive évincée faute de place|{n} archives évincées faute de place",
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
  // Les raccourcis, écrits quelque part : ⌘K n'avait ni bouton ni mention.
  "reglages.raccourcis": "Raccourcis clavier",
  "raccourci.palette": "Palette de commandes",
  "raccourci.recherche": "Rechercher dans la vue",
  "raccourci.composer": "Sauvegarder une URL",
  "raccourci.reglages": "Réglages",
  "raccourci.reculer": "Vue précédente",
  "raccourci.avancer": "Vue suivante",
  "raccourci.relire": "Relire depuis Raindrop",
  "raccourci.corbeille": "Ligne active : mettre à la corbeille",
  "raccourci.favori": "Ligne active : favori ou non",
  "raccourci.editer": "Ligne active : modifier la fiche",
  "raccourci.echap": "Fermer, annuler l'édition, vider la recherche",
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
} as const;
