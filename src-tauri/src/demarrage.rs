//! La séquence de démarrage du sidecar, extraite de `commandes.rs`
//! (retouche déclenchée par la Task « Réglages » : le fichier touchait la
//! cible de 300 lignes). Ici : la stratégie — résoudre Node, lire le
//! trousseau, lancer, attendre port + MCP connecté. Les commandes du
//! webview restent dans `commandes.rs`.

use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::etat_connexion::{verdict_en_etat, Etat, EtatConnexion};
use crate::{node, sidecar, sonde_mcp, trousseau, verrou};

/// Le sidecar a jusque-là pour publier son port. Large : au premier
/// lancement, Node compile et le serveur MCP se connecte.
const DELAI_PORT: Duration = Duration::from_secs(25);
/// Après le port, le temps laissé au serveur MCP du sidecar pour se
/// connecter — ~160 ms en réel (constat du 2026-09-17), 20 s = marge large
/// avant de rendre `Pret` sans MCP (voir l'appel à `sonde_mcp`).
const DELAI_MCP: Duration = Duration::from_secs(20);
/// Laissé à un sidecar pour s'arrêter proprement avant SIGKILL. `pub(crate)`
/// : `lib.rs` le réutilise pour `Etat::arreter_sidecar` à la fermeture, afin
/// de ne pas dupliquer la constante dans `etat_connexion`.
pub(crate) const GRACE: Duration = Duration::from_secs(3);

/// Décision explicite (ronde de relecture du 2026-09-17, absente du brief) :
/// `verrou::verifier_dossier` était sans point d'appel. Sans lui,
/// `dossier_donnees()` peut rendre un `PathBuf` vide, que `verrou::chemin`
/// transforme silencieusement en `sidecar.json` RELATIF au répertoire
/// courant — tout le cycle de vie du sidecar se jouerait au mauvais endroit,
/// sans un mot. `None` = dossier utilisable, rien à faire.
///
/// Pure — testée sans toucher au système de fichiers.
fn dossier_en_panne(d: &Path) -> Option<EtatConnexion> {
    verrou::verifier_dossier(d)
        .err()
        .map(|detail| EtatConnexion::Panne { detail })
}

/// La séquence complète. Rendue dans un fil de fond au démarrage.
pub fn sequence(etat: &Etat) -> EtatConnexion {
    let chemin_node = match node::resoudre() {
        node::Verdict::Trouve { chemin, .. } => chemin,
        autre => return verdict_en_etat(autre),
    };
    let token_raindrop = match trousseau::lire() {
        Ok(Some(t)) => t,
        Ok(None) => return EtatConnexion::JetonRequis, // premier lancement (§6)
        Err(detail) => return EtatConnexion::Panne { detail },
    };
    lancer_sidecar(etat, chemin_node, &token_raindrop)
}

pub(crate) fn lancer_sidecar(etat: &Etat, chemin_node: PathBuf, token_raindrop: &str) -> EtatConnexion {
    // Exclusion mutuelle sur la fonction ENTIÈRE (constat important, couplé
    // au constat critique du gel — voir la doc du champ
    // `etat_connexion::Etat::verrou_lancement`). Tenue jusqu'à la fin de la
    // fonction, tous les `return` inclus : le garde est une variable locale
    // de cette portée, il se relâche au drop de fin de portée quel que soit
    // le chemin de sortie.
    let _garde = etat.verrou_lancement.lock().unwrap();

    // Vérifié avant toute utilisation du dossier — c'est aussi le chemin de
    // `enregistrer_jeton`, qui appelle `lancer_sidecar` directement sans
    // passer par `sequence()` : un contrôle placé seulement dans `sequence()`
    // laisserait le premier lancement sans garde.
    if let Some(panne) = dossier_en_panne(&etat.dossier) {
        return panne;
    }

    // Divergence assumée par rapport au brief : celui-ci remplace le champ
    // `sidecar` de `Etat` par le nouvel enfant sans jamais arrêter l'ancien.
    // `std::process::Child` n'a pas de `Drop` qui tue ou attend son
    // processus — un `relancer()` répété laisserait le sidecar précédent
    // devenir un zombie (SIGTERM par PID via `decider`, jamais `wait()`é),
    // que `vivant()` (`kill -0`) continuerait de voir comme vivant : chaque
    // réessai buterait sur le GRACE complet avant de SIGKILL un cadavre. On
    // arrête proprement NOTRE ancien enfant ici, avant de considérer un
    // éventuel survivant d'un lancement précédent de l'application (D2).
    //
    // Constat court n°1 : `take()` d'abord, `if let` ensuite — pas
    // `if let Some(..) = etat.sidecar.lock().unwrap().take()`, dont
    // l'extension de portée des temporaires garderait le MutexGuard verrouillé
    // pendant tout `arreter()` (jusqu'à 3 s).
    let ancien = etat.sidecar.lock().unwrap().take();
    if let Some(mut ancien) = ancien {
        ancien.arreter(GRACE);
    }

    let fichier = verrou::chemin(&etat.dossier);

    // Décision D2 : un sidecar survivant écoute avec l'ANCIEN token local.
    let precedent = std::fs::read_to_string(&fichier)
        .ok()
        .and_then(|t| verrou::lire(&t));
    if let verrou::Decision::Terminer(pid) = verrou::decider(precedent.as_ref(), sidecar::vivant) {
        sidecar::terminer(pid, GRACE);
    }
    // INDISPENSABLE : sans cet effacement, attendre_port lit au premier tour
    // le port du sidecar qu'on vient de tuer et le rend comme s'il était neuf.
    let _ = std::fs::remove_file(&fichier);

    let reglages = sidecar::Reglages {
        node: chemin_node,
        base: etat.base.clone(),
        token_raindrop: token_raindrop.to_string(),
        token_local: etat.token_local.clone(),
        dossier_donnees: etat.dossier.clone(),
    };
    let enfant = match sidecar::lancer(&reglages) {
        Ok(s) => s,
        Err(e) => {
            return EtatConnexion::Panne {
                detail: format!("lancement du sidecar impossible : {e}"),
            }
        }
    };
    let pid = enfant.pid();
    *etat.sidecar.lock().unwrap() = Some(enfant);

    match sidecar::attendre_port(&etat.dossier, DELAI_PORT) {
        Some(port) => {
            // Le port publié ne garantit pas le MCP : en réel, il se connecte
            // ~160 ms plus tard (constat du 2026-09-17), et un `Pret` rendu
            // trop tôt faisait interroger `/api/user` par le front dans la
            // fenêtre « starting » — erreur affichée à CHAQUE validation du
            // jeton, chaque clic rejouant le cycle. On sonde `/api/health`
            // jusqu'à `mcp: "connected"` ; à l'échéance, on rend `Pret`
            // quand même : l'écran d'erreur d'appel (comportement d'avant)
            // vaut mieux qu'un démarrage bloqué, et la course systématique
            // a disparu.
            sonde_mcp::attendre_connexion(port, &etat.token_local, DELAI_MCP);
            EtatConnexion::Pret {
                port,
                token: etat.token_local.clone(),
            }
        }
        None => {
            sidecar::terminer(pid, GRACE);
            EtatConnexion::Panne {
                detail: format!(
                    "le sidecar n'a pas publié de port. Journal : {}",
                    etat.dossier.join("logs/sidecar-stdio.log").display()
                ),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn un_dossier_de_donnees_indeterminable_devient_une_panne() {
        // Décision de la ronde précédente : verifier_dossier() était sans
        // point d'appel. Sans lui, un dossier vide (ni APPDATA_DIR ni HOME)
        // se transformerait silencieusement en chemin relatif au répertoire
        // courant — tout le cycle de vie du sidecar se jouerait au mauvais
        // endroit, sans un mot.
        let e = dossier_en_panne(&PathBuf::new());
        let Some(EtatConnexion::Panne { detail }) = e else {
            panic!("attendu Some(Panne) pour un dossier vide")
        };
        assert!(!detail.is_empty());
        assert!(dossier_en_panne(&PathBuf::from("/tmp/x")).is_none());
    }

    #[test]
    fn le_verrou_de_lancement_serialise_les_executions_concurrentes() {
        // Constat important : `verrou_lancement` doit empêcher deux
        // exécutions de `lancer_sidecar` de s'entrelacer. `lancer_sidecar`
        // prend ce même verrou comme toute première instruction de son
        // corps (voir son commentaire) et le tient jusqu'à la fin de la
        // fonction — ce test prouve le mécanisme d'exclusion mutuelle
        // lui-même : un `attendre_port()` ou un spawn de process réels dans
        // un test rendrait la preuve directe sur `lancer_sidecar` beaucoup
        // trop lente (`DELAI_PORT` = 25 s, non paramétrable pour les tests).
        use std::sync::Arc;
        let etat = Arc::new(Etat::new("t".into(), PathBuf::new(), PathBuf::new()));
        let e2 = Arc::clone(&etat);

        let debut = Instant::now();
        let garde = etat.verrou_lancement.lock().unwrap();
        let poignee = std::thread::spawn(move || {
            let _g2 = e2.verrou_lancement.lock().unwrap();
            debut.elapsed()
        });
        std::thread::sleep(Duration::from_millis(100));
        drop(garde);
        let ecoule_avant_acquisition = poignee.join().unwrap();
        assert!(
            ecoule_avant_acquisition >= Duration::from_millis(90),
            "le second thread a acquis le verrou avant sa libération : {ecoule_avant_acquisition:?}"
        );
    }
}
