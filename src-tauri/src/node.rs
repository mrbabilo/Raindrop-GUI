//! Résolution de l'interpréteur Node (spec §3.2, §7).
//!
//! MESURÉ le 2026-09-17 : une application lancée depuis le Finder reçoit
//! `/usr/gnu/bin:/usr/local/bin:/bin:/usr/bin:.`, où node est ABSENT — il est
//! installé en `/opt/homebrew/bin/node`. Un `Command::new("node")` marche donc
//! en `tauri dev` (qui hérite du PATH du terminal) et échoue dans
//! l'application livrée. On sonde, on ne suppose pas.

use std::path::{Path, PathBuf};
use std::process::Command;

/// Version minimale exigée par le sidecar et le serveur MCP (spec §3.2).
pub const MAJEURE_MINIMALE: u32 = 20;

/// Emplacements sondés en plus du PATH hérité, dans cet ordre.
pub const CANDIDATS: &[&str] = &[
    "/opt/homebrew/bin/node", // Homebrew, Apple Silicon
    "/usr/local/bin/node",    // Homebrew, Intel — et installeur officiel
    "/usr/bin/node",          // système, rare sur macOS
];

#[derive(Debug, PartialEq, Eq)]
pub enum Verdict {
    Trouve { chemin: PathBuf, version: String },
    /// Présent mais sous le plancher : le dire évite d'envoyer l'utilisateur
    /// installer ce qu'il a déjà.
    TropVieux { chemin: PathBuf, version: String },
    Absent,
}

/// Majeure d'une sortie `node --version` (« v20.11.1 » → 20).
pub fn majeure(sortie: &str) -> Option<u32> {
    sortie
        .trim()
        .trim_start_matches('v')
        .split('.')
        .next()?
        .parse()
        .ok()
}

/// Choisit parmi des candidats, `sonder` rendant la version annoncée par un
/// chemin (ou `None` s'il n'est pas exécutable). Pur : c'est ici que vivent
/// les règles, la sonde système est injectée.
pub fn choisir<F>(candidats: &[PathBuf], sonder: F) -> Verdict
where
    F: Fn(&Path) -> Option<String>,
{
    let mut trop_vieux: Option<(PathBuf, String)> = None;
    for c in candidats {
        let Some(version) = sonder(c) else { continue };
        let Some(m) = majeure(&version) else { continue };
        if m >= MAJEURE_MINIMALE {
            return Verdict::Trouve { chemin: c.clone(), version };
        }
        // On garde le premier trop vieux, mais on continue : un node
        // conforme plus loin dans la liste doit l'emporter.
        if trop_vieux.is_none() {
            trop_vieux = Some((c.clone(), version));
        }
    }
    match trop_vieux {
        Some((chemin, version)) => Verdict::TropVieux { chemin, version },
        None => Verdict::Absent,
    }
}

/// Les candidats réels : d'abord le PATH hérité (le cas du développeur, où
/// `node` est celui qu'il utilise), puis les emplacements connus.
pub fn candidats_systeme() -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Ok(path) = std::env::var("PATH") {
        for d in std::env::split_paths(&path) {
            v.push(d.join("node"));
        }
    }
    for c in CANDIDATS {
        let c = PathBuf::from(c);
        if !v.contains(&c) {
            v.push(c);
        }
    }
    v
}

/// Sonde le système. Impur — la logique est dans `choisir`.
pub fn resoudre() -> Verdict {
    choisir(&candidats_systeme(), |chemin| {
        let sortie = Command::new(chemin).arg("--version").output().ok()?;
        sortie
            .status
            .success()
            .then(|| String::from_utf8_lossy(&sortie.stdout).trim().to_string())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn p(s: &str) -> PathBuf {
        PathBuf::from(s)
    }

    #[test]
    fn la_majeure_se_lit_avec_ou_sans_v() {
        assert_eq!(majeure("v20.11.1"), Some(20));
        assert_eq!(majeure("22.3.0\n"), Some(22));
        assert_eq!(majeure("  v26.8.2  "), Some(26));
        assert_eq!(majeure("pas une version"), None);
        assert_eq!(majeure(""), None);
    }

    #[test]
    fn le_premier_candidat_conforme_gagne() {
        let candidats = vec![p("/absent/node"), p("/opt/homebrew/bin/node")];
        let v = choisir(&candidats, |c| {
            (c == p("/opt/homebrew/bin/node").as_path()).then(|| "v26.8.2".to_string())
        });
        assert_eq!(
            v,
            Verdict::Trouve { chemin: p("/opt/homebrew/bin/node"), version: "v26.8.2".into() }
        );
    }

    // Le cas qui motive toute cette task : mesuré le 2026-09-17, une app
    // lancée du Finder reçoit un PATH où node est ABSENT, alors qu'il est
    // installé en /opt/homebrew/bin. Sonder les candidats connus est la
    // seule façon de ne pas échouer là où l'utilisateur voit node marcher.
    #[test]
    fn aucun_candidat_ne_repond_absent() {
        assert_eq!(choisir(&[p("/a"), p("/b")], |_| None), Verdict::Absent);
    }

    #[test]
    fn un_node_trop_vieux_est_distingue_d_une_absence() {
        // Spec §3.2 : Node >= 20. Dire « absent » quand il est seulement
        // trop vieux enverrait l'utilisateur installer ce qu'il a déjà.
        let v = choisir(&[p("/usr/bin/node")], |_| Some("v18.19.0".to_string()));
        assert_eq!(
            v,
            Verdict::TropVieux { chemin: p("/usr/bin/node"), version: "v18.19.0".into() }
        );
    }

    #[test]
    fn un_conforme_plus_loin_bat_un_trop_vieux_plus_tot() {
        let candidats = vec![p("/usr/bin/node"), p("/opt/homebrew/bin/node")];
        let v = choisir(&candidats, |c| {
            Some(if c == p("/usr/bin/node").as_path() { "v18.0.0" } else { "v20.0.0" }.to_string())
        });
        assert_eq!(
            v,
            Verdict::Trouve { chemin: p("/opt/homebrew/bin/node"), version: "v20.0.0".into() }
        );
    }
}

#[cfg(test)]
mod sonde_reelle {
    #[test]
    #[ignore = "sonde la machine : `cargo test -- --ignored` pour l'exécuter"]
    fn ou_est_node_sur_cette_machine() {
        println!("{:?}", super::resoudre());
    }
}
