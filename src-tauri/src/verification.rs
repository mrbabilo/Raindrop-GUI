//! La vérification SHASUMS256 d'un tarball Node — la moitié qui ne se
//! délègue PAS au shell. `curl` et `tar` système suffisent pour télécharger
//! et extraire, mais `/usr/bin/shasum` dépend des Command Line Tools et peut
//! être absent : le hachage se fait ici, par le crate `sha2`.
//!
//! Extraite de `runtime.rs` le 2026-09-19 — la vérification est une
//! responsabilité propre au fichier qui l'emploie, et `runtime.rs` touchait
//! le plafond dur de 400 lignes.

use std::fs;
use std::io::Read;
use std::path::Path;

use sha2::{Digest, Sha256};

/// La somme sha256 attendue pour `nom_fichier`, lue dans un SHASUMS256.txt.
/// Pur, testé : le fichier liste tout le dist/ — seule la ligne du tarball
/// compte. `None` = ligne absente (fichier tronqué, version inconnue) ;
/// l'installation est alors refusée, jamais passée sans vérification.
pub fn somme_de(texte: &str, nom_fichier: &str) -> Option<String> {
    texte.lines().find_map(|ligne| {
        let mut morceaux = ligne.split_whitespace();
        let somme = morceaux.next()?;
        let nom = morceaux.next()?;
        (nom == nom_fichier).then(|| somme.to_ascii_lowercase())
    })
}

/// La somme calculée est-elle bien celle attendue ? Pur, testé.
pub fn sommes_concordent(calculee: &str, attendue: &str) -> bool {
    calculee.eq_ignore_ascii_case(attendue)
}

/// sha256 d'un fichier, par blocs — le tarball fait ~25 Mo.
pub fn sha256_fichier(chemin: &Path) -> Result<String, String> {
    let mut fichier = fs::File::open(chemin)
        .map_err(|e| format!("tarball illisible ({}) : {e}", chemin.display()))?;
    let mut hacheur = Sha256::new();
    let mut tampon = [0u8; 64 * 1024];
    loop {
        let lus = fichier
            .read(&mut tampon)
            .map_err(|e| format!("lecture du tarball impossible : {e}"))?;
        if lus == 0 {
            break;
        }
        hacheur.update(&tampon[..lus]);
    }
    Ok(format!("{:x}", hacheur.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Lignes de https://nodejs.org/dist/v22.23.0/SHASUMS256.txt — les deux
    /// darwin sont RÉELLES (constat du 2026-09-17) ; la ligne linux est du
    /// rembourrage fabriqué (somme fictive) pour prouver que seules les
    /// lignes darwin comptent.
    const SHASUMS_REEL: &str = "\
e0f383a215dd3093de6d2c74f87056dc2306a2e09ad494cbffdba28f89046f56  node-v22.23.0-darwin-arm64.tar.gz
dc2ccab261fd70c347e4cc52085d8d226f471ccba1fc2a7252283949b31ca9f9  node-v22.23.0-darwin-x64.tar.gz
a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8  node-v22.23.0-linux-x64.tar.xz
";

    #[test]
    fn la_bonne_ligne_du_shasums_est_trouvee_parmi_les_autres() {
        let somme = somme_de(SHASUMS_REEL, "node-v22.23.0-darwin-x64.tar.gz");
        assert_eq!(
            somme.as_deref(),
            Some("dc2ccab261fd70c347e4cc52085d8d226f471ccba1fc2a7252283949b31ca9f9")
        );
        // L'arm64 aussi — chacun sa ligne, pas la première venue.
        assert_eq!(
            somme_de(SHASUMS_REEL, "node-v22.23.0-darwin-arm64.tar.gz").as_deref(),
            Some("e0f383a215dd3093de6d2c74f87056dc2306a2e09ad494cbffdba28f89046f56")
        );
    }

    #[test]
    fn un_shasums_sans_la_ligne_du_tarball_est_somme_none() {
        assert_eq!(somme_de(SHASUMS_REEL, "node-v22.23.0-darwin-arch-exotique.tar.gz"), None);
        assert_eq!(somme_de("", "node-v22.23.0-darwin-arm64.tar.gz"), None);
        // Une ligne tronquée (somme seule) ne doit pas panquer le parsing.
        assert_eq!(somme_de("deadbeef\n", "x"), None);
    }

    #[test]
    fn les_sommes_se_comparent_sans_egard_a_la_casse() {
        assert!(sommes_concordent("ABC123", "abc123"));
        assert!(!sommes_concordent("abc123", "abc124"));
        assert!(!sommes_concordent("", "abc123"));
    }

    #[test]
    fn le_sha256_d_un_fichier_connu_est_le_bon() {
        let chemin = std::env::temp_dir()
            .join(format!("raindrop-sha-{}-a.txt", std::process::id()));
        fs::write(&chemin, b"abc").expect("écriture du fichier de hachage");
        let somme = sha256_fichier(&chemin);
        let _ = fs::remove_file(&chemin);
        // Somme standard, publique, de « abc ».
        assert_eq!(
            somme.expect("le fichier se lit"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn un_fichier_absent_ne_hache_pas() {
        assert!(sha256_fichier(Path::new("/raindrop-n-existe-pas")).is_err());
    }
}
