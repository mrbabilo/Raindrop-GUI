//! L'état de la connexion locale, et les deux commandes du webview.

use std::path::{Path, PathBuf};
use std::sync::{Condvar, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::State;

use crate::{node, sidecar, trousseau, verrou};

/// Le sidecar a jusque-là pour publier son port. Large : au premier
/// lancement, Node compile et le serveur MCP se connecte.
const DELAI_PORT: Duration = Duration::from_secs(25);
/// Puis `etat_connexion` cesse d'attendre la séquence elle-même.
const DELAI_SEQUENCE: Duration = Duration::from_secs(40);
/// Laissé à un sidecar pour s'arrêter proprement avant SIGKILL.
const GRACE: Duration = Duration::from_secs(3);

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum EtatConnexion {
    Pret { port: u16, token: String },
    JetonRequis,
    NodeAbsent { detail: String },
    Panne { detail: String },
}

pub struct Etat {
    pub token_local: String,
    pub base: PathBuf,
    pub dossier: PathBuf,
    sidecar: Mutex<Option<sidecar::Sidecar>>,
    resolu: (Mutex<Option<EtatConnexion>>, Condvar),
}

impl Etat {
    pub fn new(token_local: String, base: PathBuf, dossier: PathBuf) -> Self {
        Self {
            token_local,
            base,
            dossier,
            sidecar: Mutex::new(None),
            resolu: (Mutex::new(None), Condvar::new()),
        }
    }

    pub fn poser(&self, e: EtatConnexion) {
        *self.resolu.0.lock().unwrap() = Some(e);
        self.resolu.1.notify_all();
    }

    /// Attend que la séquence de démarrage ait tranché.
    pub fn attendre(&self) -> EtatConnexion {
        let (m, cv) = &self.resolu;
        let mut g = m.lock().unwrap();
        while g.is_none() {
            let (suite, delai) = cv.wait_timeout(g, DELAI_SEQUENCE).unwrap();
            g = suite;
            if delai.timed_out() && g.is_none() {
                return EtatConnexion::Panne {
                    detail: "le sidecar local n'a pas démarré dans le temps imparti".into(),
                };
            }
        }
        g.clone().expect("posé")
    }

    /// Arrêt propre à la fermeture de l'application.
    pub fn arreter_sidecar(&self) {
        if let Some(mut s) = self.sidecar.lock().unwrap().take() {
            s.arreter(GRACE);
        }
    }
}

/// Traduit un verdict Node en état montrable. Pur — testé.
pub fn verdict_en_etat(v: node::Verdict) -> EtatConnexion {
    match v {
        node::Verdict::Trouve { .. } => EtatConnexion::Panne {
            detail: "verdict_en_etat appelé sur un node conforme".into(),
        },
        node::Verdict::TropVieux { chemin, version } => EtatConnexion::NodeAbsent {
            detail: format!(
                "Node {version} trouvé ({}), mais la version {} ou supérieure est requise.",
                chemin.display(),
                node::MAJEURE_MINIMALE
            ),
        },
        node::Verdict::Absent => EtatConnexion::NodeAbsent {
            detail: format!(
                "Aucun interpréteur Node n'a été trouvé. Node {} ou supérieur est requis.",
                node::MAJEURE_MINIMALE
            ),
        },
    }
}

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

fn lancer_sidecar(etat: &Etat, chemin_node: PathBuf, token_raindrop: &str) -> EtatConnexion {
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
    if let Some(mut ancien) = etat.sidecar.lock().unwrap().take() {
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
        Some(port) => EtatConnexion::Pret {
            port,
            token: etat.token_local.clone(),
        },
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

#[tauri::command]
pub fn etat_connexion(etat: State<'_, Etat>) -> EtatConnexion {
    etat.attendre()
}

/// Rejoue la séquence entière.
///
/// INDISPENSABLE au bouton « Réessayer » des écrans d'amorçage : `attendre`
/// rend l'état DÉJÀ mémorisé, si bien qu'un réessai qui repasserait par
/// `etat_connexion` rendrait éternellement la même panne. C'est ce qui
/// transformerait l'écran de panne en cul-de-sac : une panne passagère, ou un
/// jeton refusé, enfermeraient l'utilisateur pour de bon.
#[tauri::command]
pub fn relancer(etat: State<'_, Etat>) -> EtatConnexion {
    let e = sequence(&etat);
    etat.poser(e.clone());
    e
}

/// Premier lancement (§6) : le token saisi est enregistré au trousseau, puis
/// le sidecar démarre. Sert aussi à REMPLACER un token refusé — la même
/// commande, le même chemin.
#[tauri::command]
pub fn enregistrer_jeton(jeton_raindrop: String, etat: State<'_, Etat>) -> EtatConnexion {
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
}

#[cfg(test)]
mod tests {
    use super::*;

    fn json(e: &EtatConnexion) -> String {
        serde_json::to_string(e).unwrap()
    }

    #[test]
    fn pret_porte_son_port_et_son_token() {
        let e = EtatConnexion::Pret { port: 51234, token: "abc".into() };
        assert_eq!(json(&e), r#"{"kind":"pret","port":51234,"token":"abc"}"#);
    }

    #[test]
    fn les_etats_sans_donnee_ne_portent_que_leur_kind() {
        // Le front distingue les écrans sur `kind` seul : une faute ici est
        // invisible côté Rust et rend un écran blanc côté webview.
        assert_eq!(json(&EtatConnexion::JetonRequis), r#"{"kind":"jeton_requis"}"#);
    }

    #[test]
    fn node_absent_et_panne_portent_leur_detail() {
        let n = EtatConnexion::NodeAbsent { detail: "rien trouvé".into() };
        assert_eq!(json(&n), r#"{"kind":"node_absent","detail":"rien trouvé"}"#);
        let p = EtatConnexion::Panne { detail: "boum".into() };
        assert_eq!(json(&p), r#"{"kind":"panne","detail":"boum"}"#);
    }

    #[test]
    fn un_node_trop_vieux_dit_sa_version_et_le_plancher() {
        // Spec §3.2 et §7 : l'écran doit pouvoir écrire une instruction
        // utile, donc porter le constat, pas un « erreur ».
        let e = verdict_en_etat(crate::node::Verdict::TropVieux {
            chemin: "/usr/bin/node".into(),
            version: "v18.19.0".into(),
        });
        let EtatConnexion::NodeAbsent { detail } = e else { panic!("attendu node_absent") };
        assert!(detail.contains("v18.19.0"), "la version trouvée : {detail}");
        assert!(detail.contains("20"), "le plancher exigé : {detail}");
    }

    #[test]
    fn un_dossier_de_donnees_indeterminable_devient_une_panne() {
        // Décision de la ronde précédente : verifier_dossier() était sans
        // point d'appel. Sans lui, un dossier vide (ni APPDATA_DIR ni HOME)
        // se transformerait silencieusement en chemin relatif au répertoire
        // courant — tout le cycle de vie du sidecar se jouerait au mauvais
        // endroit, sans un mot.
        use std::path::PathBuf;
        let e = dossier_en_panne(&PathBuf::new());
        let Some(EtatConnexion::Panne { detail }) = e else {
            panic!("attendu Some(Panne) pour un dossier vide")
        };
        assert!(!detail.is_empty());
        assert!(dossier_en_panne(&PathBuf::from("/tmp/x")).is_none());
    }
}
