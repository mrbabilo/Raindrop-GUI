//! Le lockfile du sidecar, vu depuis Tauri.
//!
//! Écrit par `sidecar/lockfile.ts` dans le dossier app-data :
//! `{port, pid, startedAt}` — **jamais le token** (§3.7 prime sur §3.6).
//! `port: 0` = binding en cours.

use serde::Deserialize;
use std::path::{Path, PathBuf};

/// Le nom du fichier est fixé par `sidecar/lockfile.ts`. S'il change là-bas,
/// il doit changer ici : les deux moitiés se rencontrent sur ce nom.
const FICHIER: &str = "sidecar.json";

#[derive(Debug, Deserialize, PartialEq, Eq)]
pub struct Verrou {
    pub port: u16,
    pub pid: i32,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Decision {
    /// Rien à faire avant de lancer.
    Aucun,
    /// Un sidecar d'un lancement précédent est vivant : le terminer (D2).
    Terminer(i32),
}

/// Lit un lockfile. Tout échec rend `None` : un fichier corrompu fait
/// repartir de zéro, il ne fait pas tomber le démarrage (spec §7).
pub fn lire(texte: &str) -> Option<Verrou> {
    serde_json::from_str(texte).ok()
}

/// `port: 0` = binding en cours (spec §3.6) : le port n'est pas encore connu.
pub fn port_pret(v: &Verrou) -> Option<u16> {
    (v.port > 0).then_some(v.port)
}

/// Que faire du lockfile trouvé au démarrage. `vivant` est injecté (le test
/// n'a pas à fabriquer de vrais processus).
pub fn decider<F>(verrou: Option<&Verrou>, vivant: F) -> Decision
where
    F: Fn(i32) -> bool,
{
    match verrou {
        Some(v) if vivant(v.pid) => Decision::Terminer(v.pid),
        _ => Decision::Aucun,
    }
}

/// Le MÊME dossier que `sidecar/config.ts::appDataDir` — c'est là que le
/// lockfile s'écrit et se lit. Les deux doivent s'accorder ou rien ne se
/// trouve.
pub fn dossier_donnees() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    PathBuf::from(home).join("Library/Application Support/Raindrop-GUI")
}

pub fn chemin(dossier: &Path) -> PathBuf {
    dossier.join(FICHIER)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lit_le_lockfile_que_le_sidecar_ecrit_vraiment() {
        // Forme exacte de sidecar/lockfile.ts : startedAt en plus, et
        // AUCUN token (ruling R15) — le champ inconnu doit être ignoré,
        // pas faire échouer la lecture.
        let brut = r#"{"port":51234,"pid":4242,"startedAt":"2026-09-17T10:00:00.000Z"}"#;
        assert_eq!(lire(brut), Some(Verrou { port: 51234, pid: 4242 }));
    }

    #[test]
    fn un_lockfile_illisible_ne_fait_pas_tomber_le_demarrage() {
        // Spec §7, « port/lockfile corrompu » : on repart, on ne plante pas.
        assert_eq!(lire("{ pas du json"), None);
        assert_eq!(lire(""), None);
        assert_eq!(lire(r#"{"pid":1}"#), None); // port manquant
    }

    #[test]
    fn port_zero_veut_dire_binding_en_cours() {
        // Spec §3.6 : port 0 = le sidecar n'a pas encore son port.
        assert_eq!(port_pret(&Verrou { port: 0, pid: 1 }), None);
        assert_eq!(port_pret(&Verrou { port: 51234, pid: 1 }), Some(51234));
    }

    #[test]
    fn sans_lockfile_on_lance_simplement() {
        assert_eq!(decider(None, |_| true), Decision::Aucun);
    }

    #[test]
    fn un_pid_mort_ne_demande_rien() {
        // Lockfile resté d'un arrêt brutal : le sidecar l'écrasera.
        let v = Verrou { port: 51234, pid: 4242 };
        assert_eq!(decider(Some(&v), |_| false), Decision::Aucun);
    }

    // Le cœur de la décision D2 : un sidecar VIVANT d'un lancement précédent
    // écoute avec l'ANCIEN token local. Le réutiliser ferait répondre 401 à
    // toutes les requêtes, sans qu'un seul message ne l'explique.
    #[test]
    fn un_sidecar_survivant_est_termine_pas_reutilise() {
        let v = Verrou { port: 51234, pid: 4242 };
        assert_eq!(decider(Some(&v), |pid| pid == 4242), Decision::Terminer(4242));
    }
}
