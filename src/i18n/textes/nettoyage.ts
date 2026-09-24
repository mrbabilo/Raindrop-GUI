// Textes du Nettoyage, de la barre de sélection et de la Revue de l'action.
// Fusionnés par `../fr.ts` — une clé ne vit que dans UN fichier (fr.test.ts).
export const nettoyage = {
  "bulk.restore": "Restaurer ({n})",
  // Les corbeillés SANS origine mémorisée : non restaurés par le bloc, et
  // jamais confondus avec des restaurés (§5 : l'état se dit tel quel).
  "bulk.restore.unknown": "{n} élément sans origine connue — non restauré|{n} éléments sans origine connue — non restaurés",
  "bulk.selected": "{n} sélectionné|{n} sélectionnés",
  "bulk.trash": "Mettre à la corbeille",
  "bulk.move": "Déplacer",
  "bulk.tag": "Étiqueter",
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
  "bulk.clear": "Tout désélectionner",
  "bulk.toutSelectionner": "Tout sélectionner ({n})",
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
  "cleanup.untagged": "Sans étiquette",
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
  "cleanup.jamaisAnalyse": "jamais analysé",
  "cleanup.never": "jamais",
  "cleanup.scan": "Lancer l'analyse",
  // L'annonce avant l'analyse des liens (proposition 3) : ce qui va PARTIR.
  "scan.annonce": "L'analyse lit la bibliothèque ({duree}, {requetes} requêtes à Raindrop), puis envoie une requête au site de {adresses} adresse à vérifier.|L'analyse lit la bibliothèque ({duree}, {requetes} requêtes à Raindrop), puis envoie une requête au site de chacune des {adresses} adresses à vérifier.",
  "scan.annonceSansCompte": "L'analyse lit la bibliothèque, puis envoie une requête au site de chaque adresse à vérifier.",
  "scan.confirmer": "Lancer la vérification",
  "scan.renoncer": "Ne pas lancer",
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
  // L'archivage s'arrête au budget : ce qui reste n'a pas ÉCHOUÉ, il n'a pas
  // été tenté — deux choses que l'écran ne doit pas confondre.
  "review.archive.arret": "{n} signet non traité : {raison}|{n} signets non traités : {raison}",
  "review.title": "Revue de l'action",
  "review.count": "{n} élément concerné|{n} éléments concernés",
  "review.deselect": "Tout désélectionner",
  "review.reselect": "Tout sélectionner",
  "review.filterPlaceholder": "Filtrer dans l'aperçu…",
  "review.filterAria": "Filtrer dans l'aperçu",
  "review.export": "Exporter en CSV",
  "review.confirmL1": "Je confirme l'action sur {n} élément|Je confirme l'action sur {n} éléments",
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
} as const;
