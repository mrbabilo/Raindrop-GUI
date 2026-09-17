//! L'état de la connexion locale au sidecar : le contrat sérialisé que lit
//! le webview (Task 7), et sa synchronisation entre le fil de démarrage et
//! les commandes qui l'attendent.
//!
//! Extrait de `commandes.rs` (ronde de correction 1) : une fois les
//! commandes passées en `async` et les tests de la ronde ajoutés, le fichier
//! dépassait le plafond dur de 400 lignes — découpé par frontière naturelle
//! (le contrat d'état d'un côté, l'orchestration de l'autre) plutôt que
//! tassé.

use std::path::PathBuf;
use std::sync::{Condvar, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::{node, sidecar};

/// Puis `etat_connexion` cesse d'attendre la séquence elle-même.
const DELAI_SEQUENCE: Duration = Duration::from_secs(40);

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum EtatConnexion {
    Pret { port: u16, token: String },
    JetonRequis,
    NodeAbsent { detail: String },
    Panne { detail: String },
}

/// Implémentation manuelle (ronde de correction 1, constat court n°3) :
/// `Pret` porte le token Bearer local, qui ne doit jamais s'écrire en clair
/// (CLAUDE.md) — pas même dans un `{:?}` de secours ou de journal futur.
impl std::fmt::Debug for EtatConnexion {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EtatConnexion::Pret { port, .. } => f
                .debug_struct("Pret")
                .field("port", port)
                .field("token", &"<masqué>")
                .finish(),
            EtatConnexion::JetonRequis => write!(f, "JetonRequis"),
            EtatConnexion::NodeAbsent { detail } => {
                f.debug_struct("NodeAbsent").field("detail", detail).finish()
            }
            EtatConnexion::Panne { detail } => {
                f.debug_struct("Panne").field("detail", detail).finish()
            }
        }
    }
}

pub struct Etat {
    pub token_local: String,
    pub base: PathBuf,
    pub dossier: PathBuf,
    pub(crate) sidecar: Mutex<Option<sidecar::Sidecar>>,
    resolu: (Mutex<Option<EtatConnexion>>, Condvar),
    /// Exclusion mutuelle sur `commandes::lancer_sidecar` en entier (ronde de
    /// correction 1, constat important) : couplé au passage des commandes en
    /// `async` — sans ce verrou, deux exécutions entrelacées de la séquence
    /// de démarrage peuvent chacune décider qu'aucun sidecar ne tourne,
    /// lancer chacune le leur, et le perdant de la course sur
    /// `*etat.sidecar.lock().unwrap() = Some(enfant)` écrase silencieusement
    /// le `Sidecar` du gagnant — sans `arreter`, sans `wait()`. Ce n'était
    /// pas dangereux tant que le thread principal sérialisait tout ; ça
    /// l'est dès que les commandes tournent sur le pool de tâches
    /// bloquantes.
    pub(crate) verrou_lancement: Mutex<()>,
    /// Progression d'une installation de runtime (task 13), lue par le poll
    /// du front (`progression_installation` — même modèle que
    /// `etat_connexion`, PAS d'événements Tauri). `None` = rien en cours.
    progression: Mutex<Option<String>>,
}

impl Etat {
    pub fn new(token_local: String, base: PathBuf, dossier: PathBuf) -> Self {
        Self {
            token_local,
            base,
            dossier,
            sidecar: Mutex::new(None),
            resolu: (Mutex::new(None), Condvar::new()),
            verrou_lancement: Mutex::new(()),
            progression: Mutex::new(None),
        }
    }

    /// Étape d'installation à montrer au front (téléchargement,
    /// vérification, extraction…).
    pub fn poser_progression(&self, message: String) {
        *self.progression.lock().unwrap() = Some(message);
    }

    /// Le poll du front. Une copie : le message reste lisible après coup,
    /// le front cesse de sonder quand l'état d'amorce change.
    pub fn lire_progression(&self) -> Option<String> {
        self.progression.lock().unwrap().clone()
    }

    /// Au début d'une installation : les messages d'une précédente ne
    /// doivent pas se superposer.
    pub fn effacer_progression(&self) {
        *self.progression.lock().unwrap() = None;
    }

    pub fn poser(&self, e: EtatConnexion) {
        *self.resolu.0.lock().unwrap() = Some(e);
        self.resolu.1.notify_all();
    }

    /// Attend que la séquence de démarrage ait tranché.
    pub fn attendre(&self) -> EtatConnexion {
        self.attendre_avec_delai(DELAI_SEQUENCE)
    }

    /// Cœur testable d'`attendre` : le délai est un paramètre pour que les
    /// tests n'aient pas à patienter les 40 s réelles de `DELAI_SEQUENCE`.
    fn attendre_avec_delai(&self, delai: Duration) -> EtatConnexion {
        let (m, cv) = &self.resolu;
        let mut g = m.lock().unwrap();
        // Échéance calculée UNE fois (constat court n°4) : sans cela,
        // `cv.wait_timeout` relancé avec le délai complet à chaque réveil —
        // parasite compris — ne décompte jamais le budget déjà écoulé.
        let echeance = Instant::now() + delai;
        loop {
            if let Some(e) = g.clone() {
                return e;
            }
            let reste = echeance.saturating_duration_since(Instant::now());
            if reste.is_zero() {
                // Mémoriser la panne (constat court n°2) : sans ce `*g = …`,
                // un second appel referait une attente complète au lieu de
                // rendre tout de suite la panne déjà connue. On écrit
                // directement dans `g` plutôt que d'appeler `self.poser()`,
                // qui re-verrouillerait le même Mutex déjà tenu ici — un
                // std::sync::Mutex n'est pas réentrant, ce serait un
                // interblocage.
                let panne = EtatConnexion::Panne {
                    detail: "le sidecar local n'a pas démarré dans le temps imparti".into(),
                };
                *g = Some(panne.clone());
                cv.notify_all();
                return panne;
            }
            let (suite, _) = cv.wait_timeout(g, reste).unwrap();
            g = suite;
        }
    }

    /// Arrêt propre à la fermeture de l'application. `grace` vient de
    /// l'appelant (`crate::demarrage::GRACE`), pour ne pas dupliquer la
    /// constante de délai entre les deux modules.
    pub fn arreter_sidecar(&self, grace: Duration) {
        if let Some(mut s) = self.sidecar.lock().unwrap().take() {
            s.arreter(grace);
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
    fn le_debug_de_pret_masque_le_token() {
        // Constat court n°3 : le token Bearer local ne doit jamais s'écrire
        // en clair, pas même dans un `{:?}` de secours.
        let e = EtatConnexion::Pret {
            port: 51234,
            token: "secret-token-abc".into(),
        };
        let rendu = format!("{e:?}");
        assert!(!rendu.contains("secret-token-abc"), "le token a fuité : {rendu}");
        assert!(rendu.contains("masqué"), "le masquage attendu est absent : {rendu}");
    }

    #[test]
    fn le_delai_depasse_memorise_la_panne_pour_le_prochain_appel() {
        // Constat court n°2 : sans `poser()` (ou son équivalent direct sur le
        // Mutex déjà tenu), un second appel referait une attente complète.
        let etat = Etat::new("t".into(), PathBuf::new(), PathBuf::new());
        let e1 = etat.attendre_avec_delai(Duration::from_millis(30));
        assert!(matches!(e1, EtatConnexion::Panne { .. }));

        let debut = Instant::now();
        let e2 = etat.attendre_avec_delai(Duration::from_secs(40));
        assert!(
            debut.elapsed() < Duration::from_millis(200),
            "le second appel a réattendu au lieu de rendre la panne mémorisée : {:?}",
            debut.elapsed()
        );
        assert!(matches!(e2, EtatConnexion::Panne { .. }));
    }

    #[test]
    fn les_reveils_parasites_ne_relancent_pas_le_delai_complet() {
        // Constat court n°4 : le budget doit se décompter à travers les
        // réveils de la condvar, réveil parasite (sans `poser()`) compris.
        use std::sync::Arc;
        let etat = Arc::new(Etat::new("t".into(), PathBuf::new(), PathBuf::new()));
        let e2 = Arc::clone(&etat);
        std::thread::spawn(move || {
            for _ in 0..5 {
                std::thread::sleep(Duration::from_millis(30));
                e2.resolu.1.notify_all();
            }
        });
        let debut = Instant::now();
        let e = etat.attendre_avec_delai(Duration::from_millis(200));
        let ecoule = debut.elapsed();
        assert!(matches!(e, EtatConnexion::Panne { .. }));
        // Si le budget était relancé à chaque réveil, on dépasserait
        // largement 200 ms (5 réveils, un budget relancé donnerait ~1 s).
        assert!(ecoule < Duration::from_millis(500), "écoulé : {ecoule:?}");
    }

    #[test]
    fn la_progression_se_pose_se_lit_et_s_efface() {
        let etat = Etat::new("t".into(), PathBuf::new(), PathBuf::new());
        assert_eq!(etat.lire_progression(), None, "rien en cours au départ");
        etat.poser_progression("Téléchargement…".into());
        assert_eq!(etat.lire_progression(), Some("Téléchargement…".into()));
        etat.effacer_progression();
        assert_eq!(etat.lire_progression(), None);
    }
}
