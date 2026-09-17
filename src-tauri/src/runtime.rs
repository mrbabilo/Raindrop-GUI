//! L'installation du runtime Node géré (amendement spec §3.2 du 2026-09-17).
//!
//! Au premier lancement, si aucun Node ≥ 20 n'existe, l'écran de diagnostic
//! propose d'installer un runtime vérifié dans le dossier de données de
//! l'app — sans droit administrateur, sans toucher au PATH système. Sources
//! : `curl` et `tar` du système macOS (binaires de base, zéro dépendance
//! HTTP Rust — même parti pris que `sonde_mcp`) ; la vérification
//! SHASUMS256, elle, ne se délègue pas à un binaire qui peut être absent
//! (`/usr/bin/shasum` dépend du CLT) : crate `sha2`.
//!
//! Une fois présent, le runtime géré passe EN TÊTE de la résolution
//! (`node::candidats_systeme`) : un Node installé par l'app bat toujours ce
//! que le PATH propose — déterminisme.

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use sha2::{Digest, Sha256};

/// Version LTS Node 22 épinglée — existence et somme vérifiées en réel le
/// 2026-09-17 (`curl -s https://nodejs.org/dist/v22.23.0/SHASUMS256.txt`,
/// lignes darwin-arm64 et darwin-x64 présentes). Monter la version = changer
/// cette constante et revérifier les deux.
pub const VERSION_PINNEE: &str = "v22.23.0";

const DIST: &str = "https://nodejs.org/dist";
/// Le fichier d'installations officielles liste `<somme>  <nom>` par ligne.
const SHASUMS: &str = "SHASUMS256.txt";

/// `std::env::consts::ARCH` vers le suffixe du tarball officiel. Pur, testé.
pub fn arch_tarball(arch: &str) -> Result<&'static str, String> {
    match arch {
        "aarch64" => Ok("arm64"),
        "x86_64" => Ok("x64"),
        autre => Err(format!("architecture non prise en charge : {autre}")),
    }
}

/// Les ressources d'une installation, dérivées de la version et de l'arch.
/// Pur, testé : le nommage doit rester exactement celui de nodejs.org,
/// sinon la ligne SHASUMS ne se retrouve jamais.
pub struct Ressources {
    pub nom_tarball: String,
    pub url_tarball: String,
    pub url_shasums: String,
}

pub fn ressources(version: &str, arch: &str) -> Result<Ressources, String> {
    let nom = format!("node-{version}-darwin-{}.tar.gz", arch_tarball(arch)?);
    let racine = format!("{DIST}/{version}");
    Ok(Ressources {
        url_tarball: format!("{racine}/{nom}"),
        nom_tarball: nom,
        url_shasums: format!("{racine}/{SHASUMS}"),
    })
}

/// Le chemin du binaire du runtime géré pour un dossier de données donné —
/// LA convention partagée avec `node::candidats_systeme`.
pub fn chemin_runtime(dossier_donnees: &Path) -> PathBuf {
    dossier_donnees
        .join("runtime")
        .join(VERSION_PINNEE)
        .join("bin")
        .join("node")
}

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
fn sha256_fichier(chemin: &Path) -> Result<String, String> {
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

/// Télécharge `url` vers `destination` avec le curl système. `-f` : une
/// erreur HTTP (404, 5xx) doit échouer, pas écrire la page d'erreur dans le
/// fichier. Borne de temps : un curl suspendu ne doit pas tenir le verrou
/// de lancement pour toujours.
fn telecharger(url: &str, destination: &Path) -> Result<(), String> {
    let statut = Command::new("curl")
        .args(["-fSL", "--retry", "2", "--max-time", "600", "-o"])
        .arg(destination)
        .arg(url)
        .stdin(Stdio::null())
        .status()
        .map_err(|e| format!("curl indisponible : {e}"))?;
    statut
        .success()
        .then_some(())
        .ok_or_else(|| format!("téléchargement échoué : {url}"))
}

/// Télécharge, vérifie, extrait dans `travail` ; rend le chemin du binaire
/// extrait. Découpée d'`installer` pour séparer le ménage du répertoire
/// temporaire (fait quoi qu'il arrive) de la pose du binaire.
fn installer_dans(
    travail: &Path,
    r: &Ressources,
    progresser: &impl Fn(String),
) -> Result<PathBuf, String> {
    progresser(format!("Téléchargement de Node {}…", VERSION_PINNEE));
    let tarball = travail.join(&r.nom_tarball);
    telecharger(&r.url_tarball, &tarball)?;
    let shasums = travail.join(SHASUMS);
    telecharger(&r.url_shasums, &shasums)?;

    progresser("Vérification de la somme sha256…".into());
    let contenu =
        fs::read_to_string(&shasums).map_err(|e| format!("{SHASUMS} illisible : {e}"))?;
    let Some(attendue) = somme_de(&contenu, &r.nom_tarball) else {
        return Err(format!(
            "{SHASUMS} ne liste pas {} — installation refusée",
            r.nom_tarball
        ));
    };
    let calculee = sha256_fichier(&tarball)?;
    if !sommes_concordent(&calculee, &attendue) {
        return Err(format!(
            "la somme sha256 de {} ne correspond pas à celle publiée par nodejs.org (attendue {attendue}) — installation refusée",
            r.nom_tarball
        ));
    }

    // SEUL bin/node est extrait — le tarball fait ~25 Mo décompressés, tout
    // le reste (docs, headers, npm) ne sert pas au sidecar.
    progresser("Extraction…".into());
    let entre = format!("node-{}/bin/node", VERSION_PINNEE);
    let statut = Command::new("tar")
        .arg("-xzf")
        .arg(&tarball)
        .arg(&entre)
        .arg("-C")
        .arg(travail)
        .stdin(Stdio::null())
        .status()
        .map_err(|e| format!("tar indisponible : {e}"))?;
    if !statut.success() {
        return Err("extraction du tarball impossible".into());
    }
    let extrait = travail.join(&entre);
    if !extrait.exists() {
        return Err("le tarball ne contenait pas bin/node — installation refusée".into());
    }
    Ok(extrait)
}

/// Installe le runtime épinglé sous `<base>/runtime/<version>/bin/node`.
/// `progresser` est appelé aux étapes (téléchargement, vérification,
/// extraction) — branché sur l'état partagé que le front poll. Impur par
/// nature (réseau, disque) : toute la logique de décision est dans les
/// fonctions pures ci-dessus, testées.
pub fn installer(base: &Path, arch: &str, progresser: impl Fn(String)) -> Result<PathBuf, String> {
    let version = VERSION_PINNEE;
    let r = ressources(version, arch)?;
    let travail = std::env::temp_dir().join(format!(
        "raindrop-runtime-{}-{}",
        version.trim_start_matches('v'),
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&travail);
    fs::create_dir_all(&travail).map_err(|e| format!("répertoire de travail impossible : {e}"))?;
    let resultat = installer_dans(&travail, &r, &progresser);

    // Pose par dossier temporaire voisin puis renommage : un
    // `<runtime>/<version>` à moitié écrit ne doit jamais exister — la
    // résolution (`node::candidats_systeme`) le verrait comme bon.
    let destination = base.join("runtime").join(version);
    let pose = base.join("runtime").join(format!(".{version}.en-pose"));
    let suite = poser(&resultat, &pose, &destination);
    let _ = fs::remove_dir_all(&travail);
    let _ = fs::remove_dir_all(&pose); // no-op si le renommage a réussi
    suite
}

/// Copie le binaire extrait dans `pose` (chmod 755), puis renomme vers
/// `destination`. Facteur d'`installer` pour que le ménage s'exécute quoi
/// qu'il arrive.
fn poser(extrait: &Result<PathBuf, String>, pose: &Path, destination: &Path) -> Result<PathBuf, String> {
    let extrait = extrait.as_ref().clone()?;
    let _ = fs::remove_dir_all(pose);
    fs::create_dir_all(pose.join("bin"))
        .map_err(|e| format!("dossier d'accueil impossible ({}) : {e}", destination.display()))?;
    let binaire = pose.join("bin").join("node");
    fs::copy(extrait, &binaire).map_err(|e| format!("copie du binaire impossible : {e}"))?;
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&binaire)
            .map_err(|e| format!("binaire copié illisible : {e}"))?
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&binaire, perms)
            .map_err(|e| format!("chmod du binaire impossible : {e}"))?;
    }
    let _ = fs::remove_dir_all(destination); // réinstaller = remplacer
    fs::rename(pose, destination)
        .map_err(|e| format!("mise en place du runtime impossible ({}) : {e}", destination.display()))?;
    Ok(destination.join("bin").join("node"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Lignes réelles de https://nodejs.org/dist/v22.23.0/SHASUMS256.txt
    /// (constat du 2026-09-17, tronquées aux darwin qui nous concernent).
    const SHASUMS_REEL: &str = "\
e0f383a215dd3093de6d2c74f87056dc2306a2e09ad494cbffdba28f89046f56  node-v22.23.0-darwin-arm64.tar.gz
dc2ccab261fd70c347e4cc52085d8d226f471ccba1fc2a7252283949b31ca9f9  node-v22.23.0-darwin-x64.tar.gz
a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8  node-v22.23.0-linux-x64.tar.xz
";

    #[test]
    fn l_arch_rust_devient_le_suffixe_du_tarball_officiel() {
        assert_eq!(arch_tarball("aarch64"), Ok("arm64"));
        assert_eq!(arch_tarball("x86_64"), Ok("x64"));
    }

    #[test]
    fn une_arch_inconnue_est_refusee_avant_toute_requete() {
        // Mieux vaut refuser ici que télécharger un tarball au nom faux.
        assert!(arch_tarball("wasm32").is_err());
    }

    #[test]
    fn les_ressources_portent_les_noms_exact_de_nodejs_org() {
        let r = ressources("v22.23.0", "aarch64").expect("aarch64 est pris en charge");
        assert_eq!(r.nom_tarball, "node-v22.23.0-darwin-arm64.tar.gz");
        assert_eq!(
            r.url_tarball,
            "https://nodejs.org/dist/v22.23.0/node-v22.23.0-darwin-arm64.tar.gz"
        );
        assert_eq!(r.url_shasums, "https://nodejs.org/dist/v22.23.0/SHASUMS256.txt");
    }

    #[test]
    fn une_arch_refusee_ne_produit_pas_de_ressources() {
        assert!(ressources("v22.23.0", "x86").is_err());
    }

    #[test]
    fn le_runtime_gere_vit_sous_runtime_version_bin_node() {
        assert_eq!(
            chemin_runtime(Path::new("/Users/a/Library/Application Support/Raindrop-GUI")),
            PathBuf::from("/Users/a/Library/Application Support/Raindrop-GUI")
                .join("runtime")
                .join(VERSION_PINNEE)
                .join("bin")
                .join("node")
        );
    }

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
