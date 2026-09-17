//! Les commandes que le webview invoque. La séquence de démarrage elle-même
//! (stratégie Node/trousseau/sidecar) vit dans `crate::demarrage`. Le contrat sérialisé lui-même (`EtatConnexion`) et son
//! état de synchronisation (`Etat`) vivent dans `crate::etat_connexion`
//! (ronde de correction 1 : ce fichier dépassait le plafond dur de 400
//! lignes une fois les commandes passées en `async` et les tests de la ronde
//! ajoutés — découpé par frontière naturelle plutôt que tassé).

use tauri::{AppHandle, Manager};

use crate::demarrage::{lancer_sidecar, sequence, GRACE};
use crate::etat_connexion::{verdict_en_etat, Etat, EtatConnexion};
use crate::{node, trousseau, verrou};

/// `etat_connexion`, `relancer` et `enregistrer_jeton` sont `async` et
/// déplacent leur corps bloquant dans `tauri::async_runtime::spawn_blocking`
/// (ronde de correction 1, constat critique) : une commande Tauri `pub fn`
/// non-`async` est appelée EN LIGNE sur le thread principal — jusqu'au
/// délégué Objective-C de WebKit lui-même — donc `etat_connexion` (jusqu'à
/// 40 s) et `enregistrer_jeton` (jusqu'à 25 s) gelaient la fenêtre pendant
/// toute leur durée.
///
/// `State<'_, Etat>` n'est pas `Send` et ne peut pas traverser la frontière
/// `'static` de la closure passée à `spawn_blocking`. La forme retenue prend
/// `tauri::AppHandle` (`Send + Sync + 'static`, `Clone`) en paramètre de
/// commande, et récupère l'état par `app.state::<Etat>()` À L'INTÉRIEUR de la
/// closure — le `State` emprunté qui en résulte est créé et consommé
/// entièrement dans ce thread bloquant, sans jamais franchir de point de
/// suspension `async`.
///
/// Une tâche qui panique (`JoinError`) rend une `Panne` plutôt que de
/// propager le panic jusqu'à faire tomber le processus.
#[tauri::command]
pub async fn etat_connexion(app: AppHandle) -> EtatConnexion {
    tauri::async_runtime::spawn_blocking(move || {
        let etat = app.state::<Etat>();
        etat.attendre()
    })
    .await
    .unwrap_or_else(|e| EtatConnexion::Panne {
        detail: format!("tâche etat_connexion interrompue : {e}"),
    })
}

/// Rejoue la séquence entière.
///
/// INDISPENSABLE au bouton « Réessayer » des écrans d'amorçage : `attendre`
/// rend l'état DÉJÀ mémorisé, si bien qu'un réessai qui repasserait par
/// `etat_connexion` rendrait éternellement la même panne. C'est ce qui
/// transformerait l'écran de panne en cul-de-sac : une panne passagère, ou un
/// jeton refusé, enfermeraient l'utilisateur pour de bon.
#[tauri::command]
pub async fn relancer(app: AppHandle) -> EtatConnexion {
    tauri::async_runtime::spawn_blocking(move || {
        let etat = app.state::<Etat>();
        let e = sequence(&etat);
        etat.poser(e.clone());
        e
    })
    .await
    .unwrap_or_else(|e| EtatConnexion::Panne {
        detail: format!("tâche relancer interrompue : {e}"),
    })
}

/// Premier lancement (§6) : le token saisi est enregistré au trousseau, puis
/// le sidecar démarre. Sert aussi à REMPLACER un token refusé — la même
/// commande, le même chemin.
#[tauri::command]
pub async fn enregistrer_jeton(jeton_raindrop: String, app: AppHandle) -> EtatConnexion {
    tauri::async_runtime::spawn_blocking(move || {
        let etat = app.state::<Etat>();
        let jeton = jeton_raindrop.trim().to_string();
        if jeton.is_empty() {
            return EtatConnexion::Panne { detail: "token vide".into() };
        }
        if let Err(detail) = trousseau::ecrire(&jeton) {
            return EtatConnexion::Panne { detail };
        }
        let chemin_node = match node::resoudre() {
            node::Verdict::Trouve { chemin, .. } => chemin,
            autre => return verdict_en_etat(autre),
        };
        let e = lancer_sidecar(&etat, chemin_node, &jeton);
        etat.poser(e.clone());
        e
    })
    .await
    .unwrap_or_else(|e| EtatConnexion::Panne {
        detail: format!("tâche enregistrer_jeton interrompue : {e}"),
    })
}

/// Installe le runtime Node géré (amendement spec §3.2 du 2026-09-17),
/// PUIS rejoue la séquence entière — le même chemin que `relancer` : le
/// runtime fraîchement installé est résolu EN TÊTE (`node::candidats_
/// systeme`) et le sidecar démarre. Un échec d'installation est une `Panne`
/// qui porte les instructions manuelles (le repli hors-ligne).
#[tauri::command]
pub async fn installer_runtime(app: AppHandle) -> EtatConnexion {
    tauri::async_runtime::spawn_blocking(move || {
        let etat = app.state::<Etat>();
        etat.effacer_progression();
        // L'installation est sérialisée sous le MÊME verrou que le lancement
        // du sidecar : deux « Installer Node » simultanés (ou une course
        // avec « Réessayer ») ne doivent pas se marcher dessus. Relâché
        // AVANT `sequence()` — `lancer_sidecar` le reprend, et un
        // std::sync::Mutex n'est pas réentrant.
        let dossier = etat.dossier.clone();
        let ponton = app.clone();
        let installe = {
            let _garde = etat.verrou_lancement.lock().unwrap();
            crate::runtime::installer(&dossier, std::env::consts::ARCH, move |message| {
                if let Some(e) = ponton.try_state::<Etat>() {
                    e.poser_progression(message);
                }
            })
        };
        let e = match installe {
            Ok(_chemin) => sequence(&etat),
            Err(detail) => EtatConnexion::Panne {
                detail: format!(
                    "{detail} En repli, installez Node {} ou supérieur manuellement (par exemple « brew install node »), puis relancez l'application.",
                    node::MAJEURE_MINIMALE
                ),
            },
        };
        etat.poser(e.clone());
        e
    })
    .await
    .unwrap_or_else(|e| EtatConnexion::Panne {
        detail: format!("tâche installer_runtime interrompue : {e}"),
    })
}

/// Le poll du front pendant une installation : l'étape courante, ou `None`
/// (rien en cours). Lecture instantanée, pas d'événements Tauri.

/// Déconnexion (spec §6, réglages) : efface le jeton du trousseau et
/// arrête le sidecar — l'écran de premier lancement reprend la main.
/// L'effacement précède l'arrêt pour ce que lit le PROCHAIN lancement :
/// un trousseau vide y mène à l'écran d'accueil, quel que soit l'état du
/// sidecar. (Il ne protège pas d'un crash entre les deux — c'est même ce
/// qu'il rend possible ; le lockfile effacé et la décision D2 rattrapent
/// ce cas au lancement suivant.)
///
/// **Le verrou de lancement est tenu sur toute la fonction** : sans lui,
/// une déconnexion concurrente à un remplacement de jeton (fenêtre
/// réaliste — `lancer_sidecar` peut attendre jusqu'à 45 s) laisserait
/// `lancer_sidecar` installer un enfant que personne n'arrêterait, et le
/// dernier `poser()` gagnerait : trousseau effacé, sidecar vivant, état
/// mémorisé `Pret`. Même ordre de verrous que partout — `verrou_lancement`
/// puis `sidecar`, jamais l'inverse.
#[tauri::command]
pub async fn deconnecter(app: AppHandle) -> EtatConnexion {
    tauri::async_runtime::spawn_blocking(move || {
        let etat = app.state::<Etat>();
        let _garde = etat.verrou_lancement.lock().unwrap();
        if let Err(detail) = trousseau::effacer() {
            return EtatConnexion::Panne { detail };
        }
        etat.arreter_sidecar(GRACE);
        // Même garde que `lancer_sidecar` : un dossier indéterminable rend
        // un chemin RELATIF au répertoire courant, qu'il ne faut pas effacer.
        if verrou::verifier_dossier(&etat.dossier).is_ok() {
            let _ = std::fs::remove_file(verrou::chemin(&etat.dossier));
        }
        let e = EtatConnexion::JetonRequis;
        etat.poser(e.clone());
        e
    })
    .await
    .unwrap_or_else(|e| EtatConnexion::Panne {
        detail: format!("déconnexion interrompue : {e}"),
    })
}

#[tauri::command]
pub async fn progression_installation(app: AppHandle) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || app.state::<Etat>().lire_progression())
        .await
        .unwrap_or(None)
}
