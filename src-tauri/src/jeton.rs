//! Token Bearer local, éphémère (spec §3.7).
//!
//! Il n'est JAMAIS écrit sur disque : il ne vit qu'en mémoire du processus
//! Tauri, dans l'environnement du sidecar qu'il lance, et dans le webview
//! auquel il le transmet par commande. Le lockfile ne le porte pas non plus
//! (`sidecar/lockfile.ts`, ruling R15).

use std::fmt::Write as _;
use std::fs::File;
use std::io::Read;

/// 32 octets : bien au-delà de ce qu'une superficie locale exige, et le coût
/// est nul.
const OCTETS: usize = 32;

/// Rend des octets en hexadécimal minuscule, deux caractères par octet.
pub fn en_hex(octets: &[u8]) -> String {
    let mut s = String::with_capacity(octets.len() * 2);
    for o in octets {
        // Écrire dans une String ne peut pas échouer.
        let _ = write!(s, "{o:02x}");
    }
    s
}

/// Engendre le token du lancement. `/dev/urandom` plutôt qu'un crate d'aléa :
/// une dépendance de moins pour trente-deux octets, et la source est celle
/// que le système offre de toute façon.
pub fn engendrer() -> std::io::Result<String> {
    let mut buf = [0u8; OCTETS];
    File::open("/dev/urandom")?.read_exact(&mut buf)?;
    Ok(en_hex(&buf))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_rend_deux_caracteres_par_octet_zero_compris() {
        // Le piège classique : un octet < 16 rendu sur un seul caractère
        // raccourcit le token sans que rien ne le signale.
        assert_eq!(en_hex(&[0x00, 0x0f, 0xa0, 0xff]), "000fa0ff");
    }

    #[test]
    fn le_token_fait_soixante_quatre_caracteres_hexadecimaux() {
        let t = engendrer().expect("aléa système lisible");
        assert_eq!(t.len(), 64, "32 octets → 64 caractères");
        assert!(t.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn deux_tokens_different() {
        // Éphémère veut dire « un par lancement » : un token constant
        // rendrait la superficie HTTP locale permanente (spec §3.7).
        assert_ne!(engendrer().unwrap(), engendrer().unwrap());
    }
}
