//! Le dossier de sauvegarde choisi par l'utilisateur (spec sélection §2).
//!
//! Un `reglages.json` à côté de `sidecar.json` — ce n'est PAS un secret
//! (pas le trousseau) : un chemin de dossier, rien d'autre. Illisible ou
//! corrompu = « aucun dossier », l'état normal du premier lancement, jamais
//! une panne.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize)]
struct Contenu {
    #[serde(rename = "dossierSauvegarde")]
    dossier_sauvegarde: String,
}

pub fn chemin(dossier: &Path) -> PathBuf {
    dossier.join("reglages.json")
}

/// `None` = aucun dossier configuré (absent, illisible, corrompu — un seul
/// et même état, et c'est voulu : le panneau ne distingue pas, il n'a pas à).
pub fn lire(dossier: &Path) -> Option<String> {
    let texte = std::fs::read_to_string(chemin(dossier)).ok()?;
    let contenu: Contenu = serde_json::from_str(&texte).ok()?;
    let vide = contenu.dossier_sauvegarde.trim().is_empty();
    (!vide).then_some(contenu.dossier_sauvegarde)
}

pub fn ecrire(dossier: &Path, valeur: Option<String>) -> Result<(), String> {
    let fichier = chemin(dossier);
    match valeur {
        // Retrait : le fichier disparaît, le sidecar relancé naîtra sans
        // BACKUP_DIR. Un fichier déjà absent n'est pas une erreur.
        None => match std::fs::remove_file(&fichier) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        },
        Some(v) if v.trim().is_empty() => Err("chemin vide".into()),
        Some(v) => {
            let contenu = Contenu { dossier_sauvegarde: v };
            serde_json::to_string(&contenu)
                .map_err(|e| e.to_string())
                .and_then(|json| std::fs::write(&fichier, json).map_err(|e| e.to_string()))
        }
    }
}

/// Configuré MAIS disparu depuis le dernier lancement (déménagé, volume
/// monté plus) — état distinct que le panneau dit (spec §2).
pub fn introuvable(dossier: &Path) -> bool {
    lire(dossier).is_some_and(|c| !Path::new(&c).is_dir())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dossier_temporaire(nom: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("reglages-{}-{nom}", std::process::id()));
        std::fs::create_dir_all(&d).expect("création");
        d
    }

    #[test]
    fn absent_vaut_aucun_dossier() {
        let d = dossier_temporaire("absent");
        assert_eq!(lire(&d), None);
        assert!(!introuvable(&d));
        assert!(ecrire(&d, None).is_ok()); // retirer ce qui n'est pas là
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn corrompu_vaut_aucun_dossier() {
        let d = dossier_temporaire("corrompu");
        std::fs::write(chemin(&d), "{pas du json").ok();
        assert_eq!(lire(&d), None);
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn ecrit_lit_et_retire() {
        let d = dossier_temporaire("roundtrip");
        ecrire(&d, Some(d.display().to_string())).expect("écriture");
        assert_eq!(lire(&d).as_deref(), Some(d.display().to_string().as_str()));
        assert!(!introuvable(&d)); // le dossier de test existe
        ecrire(&d, None).expect("retrait");
        assert_eq!(lire(&d), None);
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn configure_mais_disparu_est_un_etat_distinct() {
        let d = dossier_temporaire("disparu");
        // Un chemin qui n'existe pas (ni le fichier de réglages, ni la cible)
        ecrire(&d, Some("/raindrop-test-inexistant-9413/cible".into())).expect("écriture");
        assert_eq!(
            lire(&d).as_deref(),
            Some("/raindrop-test-inexistant-9413/cible")
        );
        assert!(introuvable(&d));
        ecrire(&d, None).expect("retrait");
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn chemin_vide_est_refuse() {
        let d = dossier_temporaire("vide");
        assert!(ecrire(&d, Some("   ".into())).is_err());
        std::fs::remove_dir_all(&d).ok();
    }
}
