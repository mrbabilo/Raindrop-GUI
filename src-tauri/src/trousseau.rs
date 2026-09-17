//! Le token Raindrop, au trousseau macOS (spec §6).
//!
//! La spec dit « plugin Tauri (Keychain) » ; il n'existe pas de plugin
//! officiel — la voie réelle est le crate `keyring`, dont la feature par
//! défaut `v1` tire `apple-native-keyring-store/keychain`. Le secret va bien
//! au trousseau macOS : c'est le vocabulaire qui est corrigé, pas le
//! comportement.
//!
//! Service et compte sont CEUX DU SCRIPT DE DEV (`scripts/dev-sidecar.sh`)
//! pour que les deux chemins partagent un seul enregistrement.

use keyring::{Entry, Error};

/// Doit rester identique à KEYCHAIN_SERVICE de scripts/dev-sidecar.sh.
pub const SERVICE: &str = "raindrop-api-token";

/// Le script utilise `-a "$USER"` : même convention, avec un repli.
///
/// Une application lancée par launchd (donc depuis le Finder) peut n'avoir
/// aucun `USER` dans son environnement. Sans repli, le compte serait vide,
/// l'entrée introuvable, et le symptôme serait l'écran de premier lancement
/// à CHAQUE ouverture — alors que le jeton est bien au trousseau.
pub fn compte() -> String {
    compte_depuis(
        std::env::var("USER").ok().as_deref(),
        std::env::var("HOME").ok().as_deref(),
    )
}

/// Pur, pour être testable sans toucher à l'environnement du test.
pub fn compte_depuis(user: Option<&str>, home: Option<&str>) -> String {
    if let Some(u) = user {
        if !u.is_empty() {
            return u.to_string();
        }
    }
    home.map(std::path::Path::new)
        .and_then(std::path::Path::file_name)
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Un compte vide chercherait au trousseau et rendrait « absent » —
/// indiscernable d'un premier lancement. On veut une panne qui se lit.
pub fn verifier_compte(c: &str) -> Result<(), String> {
    if c.is_empty() {
        return Err("compte utilisateur indéterminable (ni USER ni HOME)".into());
    }
    Ok(())
}

fn entree() -> Result<Entry, String> {
    let c = compte();
    verifier_compte(&c)?;
    Entry::new(SERVICE, &c).map_err(|e| format!("trousseau inaccessible : {e}"))
}

/// `Ok(None)` = aucun token enregistré (premier lancement, spec §6).
/// `Err` = panne réelle du trousseau — à ne pas confondre avec l'absence,
/// qui est un état normal et attendu.
pub fn lire() -> Result<Option<String>, String> {
    match entree()?.get_password() {
        Ok(t) => Ok(Some(t)),
        Err(Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("lecture du trousseau impossible : {e}")),
    }
}

pub fn ecrire(token: &str) -> Result<(), String> {
    entree()?
        .set_password(token)
        .map_err(|e| format!("écriture au trousseau impossible : {e}"))
}

/// Effacer un token absent n'est pas une erreur : le résultat voulu est
/// « plus de token », et il est atteint.
pub fn effacer() -> Result<(), String> {
    match entree()?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("effacement du trousseau impossible : {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn le_service_est_celui_du_script_de_dev() {
        // scripts/dev-sidecar.sh : KEYCHAIN_SERVICE="raindrop-api-token".
        // S'ils divergent, l'utilisateur saisit son token deux fois et une
        // rotation n'en change qu'un.
        assert_eq!(SERVICE, "raindrop-api-token");
    }

    // Test NON tautologique : comparer compte() à std::env::var("USER") ne
    // prouverait rien (toujours vrai dans un terminal) et tairait le cas qui
    // compte — une application lancée par launchd peut n'avoir AUCUN USER.
    // Sans repli, compte() rendrait "", l'entrée serait introuvable, et le
    // symptôme serait l'écran de premier lancement à CHAQUE lancement alors
    // que le jeton est bien au trousseau.
    #[test]
    fn le_compte_se_replie_sur_le_dossier_personnel() {
        assert_eq!(compte_depuis(Some("bob"), Some("/Users/alice")), "bob");
        assert_eq!(compte_depuis(None, Some("/Users/alice")), "alice");
        assert_eq!(compte_depuis(Some(""), Some("/Users/alice")), "alice");
        assert_eq!(compte_depuis(None, None), "");
    }

    #[test]
    fn un_compte_vide_est_refuse_au_lieu_d_etre_cherche() {
        // Chercher au trousseau avec un compte vide rendrait « absent » —
        // indiscernable d'un premier lancement. On veut une panne lisible.
        assert!(verifier_compte("").is_err());
        assert!(verifier_compte("alice").is_ok());
    }

    #[test]
    #[ignore = "touche le vrai trousseau : `cargo test -- --ignored`"]
    fn aller_retour_ecrire_lire_effacer() {
        let temoin = "jeton-de-test-ne-pas-utiliser";
        let avant = lire().expect("lecture possible");
        ecrire(temoin).expect("écriture possible");
        assert_eq!(lire().unwrap().as_deref(), Some(temoin));
        effacer().expect("effacement possible");
        assert_eq!(lire().unwrap(), None, "après effacement : absent, pas erreur");
        // Restaurer ce qui s'y trouvait, pour ne pas casser le dev.
        if let Some(t) = avant {
            ecrire(&t).expect("restauration");
        }
    }
}
