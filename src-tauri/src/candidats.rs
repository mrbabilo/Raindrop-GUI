//! OÙ chercher un interpréteur Node : le PATH hérité, les emplacements
//! connus, le runtime géré par l'app — et dans quel ordre.
//!
//! MESURÉ le 2026-09-17 : une application lancée depuis le Finder reçoit
//! `/usr/gnu/bin:/usr/local/bin:/bin:/usr/bin:.`, où node est ABSENT —
//! sonder les candidats connus est la seule façon de ne pas échouer là où
//! l'utilisateur voit node marcher.
//!
//! Extraite de `node.rs` le 2026-09-19 : le OÙ et le QUEL sont deux
//! questions — `node.rs` garde la sonde et le verdict, ce fichier la liste
//! des endroits où sonder. Le QUEL gagnant peut être le runtime géré, d'où
//! la lecture de `runtime::chemin_runtime` ci-dessous (une seule direction :
//! `runtime` n'importe pas ce module).

use std::path::PathBuf;

/// Emplacements sondés en plus du PATH hérité, dans cet ordre.
pub const CANDIDATS: &[&str] = &[
    "/opt/homebrew/bin/node", // Homebrew, Apple Silicon
    "/usr/local/bin/node",    // Homebrew, Intel — et installeur officiel
    "/usr/bin/node",          // système, rare sur macOS
];

/// Les candidats à partir d'un PATH donné : d'abord le PATH hérité (le cas
/// du développeur, où `node` est celui qu'il utilise), puis les emplacements
/// connus — sans doublon si l'un d'eux y figure déjà. Pur, pour être
/// testable sans toucher au vrai environnement.
pub fn candidats_depuis(path: Option<&str>) -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Some(path) = path {
        for d in std::env::split_paths(path) {
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

/// Le runtime géré par l'app, s'il est installé, PASSE EN TÊTE (amendement
/// spec §3.2 du 2026-09-17) : un Node installé par l'app bat toujours ce
/// que le PATH propose — déterminisme. Pur, testé.
pub fn avec_runtime_en_tete(gere: Option<PathBuf>, mut candidats: Vec<PathBuf>) -> Vec<PathBuf> {
    if let Some(g) = gere {
        if !candidats.contains(&g) {
            candidats.insert(0, g);
        }
    }
    candidats
}

/// Les candidats réels : d'abord le runtime géré s'il existe dans le dossier
/// de données (`verrou::dossier_donnees()`, le même que le lockfile), puis le
/// PATH hérité et les emplacements connus.
pub fn candidats_systeme() -> Vec<PathBuf> {
    let dossier = crate::verrou::dossier_donnees();
    let gere = crate::runtime::chemin_runtime(&dossier);
    let present = !dossier.as_os_str().is_empty() && gere.exists();
    avec_runtime_en_tete(present.then_some(gere), candidats_depuis(std::env::var("PATH").ok().as_deref()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn p(s: &str) -> PathBuf {
        PathBuf::from(s)
    }

    #[test]
    fn le_path_precede_les_candidats_connus_dans_l_ordre() {
        let v = candidats_depuis(Some("/custom/bin"));
        assert_eq!(
            v,
            vec![
                p("/custom/bin/node"),
                p("/opt/homebrew/bin/node"),
                p("/usr/local/bin/node"),
                p("/usr/bin/node"),
            ]
        );
    }

    #[test]
    fn pas_de_doublon_quand_un_candidat_connu_est_deja_dans_le_path() {
        // /opt/homebrew/bin est déjà dans le PATH : il ne doit pas
        // réapparaître quand on ajoute les emplacements connus.
        let v = candidats_depuis(Some("/opt/homebrew/bin:/custom/bin"));
        assert_eq!(
            v,
            vec![
                p("/opt/homebrew/bin/node"),
                p("/custom/bin/node"),
                p("/usr/local/bin/node"),
                p("/usr/bin/node"),
            ]
        );
        assert_eq!(v.iter().filter(|c| **c == p("/opt/homebrew/bin/node")).count(), 1);
    }

    #[test]
    fn sans_path_les_candidats_connus_suffisent() {
        assert_eq!(
            candidats_depuis(None),
            vec![p("/opt/homebrew/bin/node"), p("/usr/local/bin/node"), p("/usr/bin/node")]
        );
    }

    // Le cas qui motive la task 13 : une fois installé par l'app, le runtime
    // géré gagne TOUJOURS — un Node vérifié par l'app bat ce que le PATH
    // propose, même un Node trop vieux placé plus tôt.
    #[test]
    fn le_runtime_gere_passe_en_tete_quand_il_existe() {
        let v = avec_runtime_en_tete(
            Some(p("/donnees/runtime/v22.23.0/bin/node")),
            vec![p("/usr/bin/node"), p("/opt/homebrew/bin/node")],
        );
        assert_eq!(
            v,
            vec![
                p("/donnees/runtime/v22.23.0/bin/node"),
                p("/usr/bin/node"),
                p("/opt/homebrew/bin/node"),
            ]
        );
    }

    #[test]
    fn sans_runtime_gere_ou_en_doublon_la_liste_reste_saine() {
        let candidats = vec![p("/usr/bin/node")];
        assert_eq!(avec_runtime_en_tete(None, candidats.clone()), candidats);
        let gere = p("/donnees/runtime/v22.23.0/bin/node");
        let v = avec_runtime_en_tete(Some(gere.clone()), vec![gere.clone(), p("/usr/bin/node")]);
        assert_eq!(v, vec![gere, p("/usr/bin/node")]);
    }
}
