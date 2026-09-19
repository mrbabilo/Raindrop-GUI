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
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use crate::verification::{sha256_fichier, sommes_concordent, somme_de};

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

/// Le membre à extraire du tarball. Pur, testé — LE test qui aurait attrapé
/// le défaut du premier jet : les archives nodejs.org s'archivent sous
/// `node-<version>-<plateforme>/` (constat du 2026-09-17, `tar -tzf`), et
/// bsdtar exige `-C <dir>` AVANT le membre (voir `extraire`).
pub fn membre_bin_node(version: &str, arch: &str) -> Result<String, String> {
    Ok(format!("node-{version}-darwin-{}/bin/node", arch_tarball(arch)?))
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

/// Extrait UN membre du tarball vers `travail`. L'ordre n'est pas décoratif :
/// bsdtar lit les opérandes dans l'ordre — un `-C` après le membre est pris
/// pour un nom de membre (« -C: Not found in archive », reproduit le 2026-09-17).
fn extraire(tarball: &Path, travail: &Path, membre: &str) -> Result<(), String> {
    let statut = Command::new("tar")
        .arg("-xzf")
        .arg(tarball)
        .arg("-C")
        .arg(travail)
        .arg(membre)
        .stdin(Stdio::null())
        .status()
        .map_err(|e| format!("tar indisponible : {e}"))?;
    if !statut.success() {
        return Err("extraction du tarball impossible".into());
    }
    Ok(())
}

/// Télécharge, vérifie, extrait dans `travail` ; rend le chemin du binaire
/// extrait. Découpée d'`installer` pour séparer le ménage du répertoire
/// temporaire (fait quoi qu'il arrive) de la pose du binaire.
fn installer_dans(
    travail: &Path,
    r: &Ressources,
    arch: &str,
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
    let entre = membre_bin_node(VERSION_PINNEE, arch)?;
    extraire(&tarball, travail, &entre)?;
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
    let resultat = installer_dans(&travail, &r, arch, &progresser);

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

    // LE test qui aurait attrapé le défaut du premier jet (remonté en réel
    // par l'utilisateur, reproduit en shell le 2026-09-17) : le préfixe des
    // archives nodejs.org INCLUT la plateforme — `node-v22.23.0/bin/node`
    // n'existe dans aucun tarball, « Not found in archive » à l'extraction.
    #[test]
    fn le_membre_extrait_porte_la_plateforme_dans_son_prefixe() {
        assert_eq!(
            membre_bin_node("v22.23.0", "aarch64").as_deref(),
            Ok("node-v22.23.0-darwin-arm64/bin/node")
        );
        assert_eq!(
            membre_bin_node("v22.23.0", "x86_64").as_deref(),
            Ok("node-v22.23.0-darwin-x64/bin/node")
        );
        assert!(membre_bin_node("v22.23.0", "wasm32").is_err());
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

    // Le test de régression sur l'ORDRE des arguments, contre un vrai tar
    // local (aucun réseau) : membre avant `-C`, bsdtar lit `-C` comme un
    // nom de membre — l'erreur vue par l'utilisateur le 2026-09-17.
    #[test]
    fn l_extraction_place_le_membre_sous_le_repertoire_cible_et_refuse_un_membre_absent() {
        let base = std::env::temp_dir().join(format!("raindrop-tar-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let source = base.join("src");
        let racine = "node-v22.23.0-darwin-arm64";
        fs::create_dir_all(source.join(racine).join("bin")).expect("arborescence à archiver");
        fs::write(source.join(racine).join("bin/node"), b"#!/bin/sh\n").expect("faux binaire");
        let statut = Command::new("tar")
            .args(["-czf"])
            .arg(base.join("t.tar.gz"))
            .arg(racine)
            .current_dir(&source)
            .status()
            .expect("tar disponible");
        assert!(statut.success(), "création du tarball de test");
        let cible = base.join("out");
        fs::create_dir_all(&cible).expect("répertoire cible");

        extraire(&base.join("t.tar.gz"), &cible, &format!("{racine}/bin/node"))
            .expect("le membre correct s'extrait sous la cible");
        assert_eq!(
            fs::read_to_string(cible.join(racine).join("bin/node")).expect("binaire extrait"),
            "#!/bin/sh\n"
        );
        // Le membre sans plateforme doit être un ÉCHEC — pas un succès
        // mensonger suivi d'un « binaire introuvable » plus loin.
        assert!(extraire(&base.join("t.tar.gz"), &cible, "node-v22.23.0/bin/node").is_err());
        let _ = fs::remove_dir_all(&base);
    }
}
