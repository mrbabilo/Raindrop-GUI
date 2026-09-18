//! Cycle de vie du sidecar Node, vu depuis Tauri (spec §3.6).

use std::fs::File;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use crate::verrou;

/// `tsc` (outDir `dist-sidecar`, rootDir `.`) produit cette arborescence —
/// vérifié le 2026-09-17. Pas `dist-sidecar/index.js`.
pub fn entree(base: &Path) -> PathBuf {
    base.join("dist-sidecar/sidecar/index.js")
}

/// Le serveur MCP épinglé à 1.3.1 (CLAUDE.md) : spawn direct du JS.
pub fn entree_mcp(base: &Path) -> PathBuf {
    base.join("node_modules/@kud/mcp-raindrop-io/dist/index.js")
}

pub struct Reglages {
    /// Chemin absolu de l'interpréteur, résolu par `node::resoudre`.
    pub node: PathBuf,
    /// Racine du dépôt en dev, dossier de ressources du .app en production.
    pub base: PathBuf,
    pub token_raindrop: String,
    pub token_local: String,
    pub dossier_donnees: PathBuf,
    /// Le dossier de sauvegarde choisi par l'utilisateur (spec sélection §2) :
    /// transmis au sidecar en BACKUP_DIR. `None` = non configuré, le moteur
    /// naît inactif — c'est l'état normal du premier lancement.
    pub dossier_sauvegarde: Option<PathBuf>,
}

pub struct Sidecar {
    enfant: Child,
}

impl Sidecar {
    pub fn pid(&self) -> i32 {
        self.enfant.id() as i32
    }

    /// SIGTERM d'abord, et non `Child::kill()` (qui envoie SIGKILL) : le
    /// sidecar a un gestionnaire d'arrêt qui vide sa mémoire des origines et
    /// efface le lockfile. Le tuer net perdrait les deux.
    pub fn arreter(&mut self, grace: Duration) {
        terminer(self.pid(), grace);
        let _ = self.enfant.wait();
    }
}

/// Lance le sidecar. Les deux tokens passent par l'environnement : le token
/// Raindrop ne traverse jamais HTTP (spec §6), le token local n'est jamais
/// écrit sur disque (spec §3.7).
///
/// `RAINDROP_MCP_ENTRY` est transmis EXPLICITEMENT : son défaut, dans
/// `sidecar/config.ts`, est relatif au module du sidecar et ne survit pas à
/// l'empaquetage.
pub fn lancer(r: &Reglages) -> std::io::Result<Sidecar> {
    // stdout/stderr vers un fichier : le sidecar journalise en JSONL de son
    // côté, mais un échec AVANT que son journal n'existe (Node qui refuse le
    // fichier, import cassé) ne se lirait nulle part sans cela.
    std::fs::create_dir_all(r.dossier_donnees.join("logs"))?;
    let journal = r.dossier_donnees.join("logs/sidecar-stdio.log");
    let sortie = File::create(&journal)?;
    let erreurs = sortie.try_clone()?;

    let mut cmd = Command::new(&r.node);
    cmd.arg(entree(&r.base));
    for (cle, valeur) in env_args(r) {
        cmd.env(cle, valeur);
    }
    let enfant = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::from(sortie))
        .stderr(Stdio::from(erreurs))
        .spawn()?;
    Ok(Sidecar { enfant })
}

/// Les variables d'environnement du sidecar, en un seul endroit — pur, donc
/// testable sans lancer de processus (BACKUP_DIR n'est passé QUE si un
/// dossier de sauvegarde est configuré).
fn env_args(r: &Reglages) -> Vec<(String, String)> {
    let mut v = vec![
        ("MCP_RAINDROPIO_TOKEN".into(), r.token_raindrop.clone()),
        ("LOCAL_API_TOKEN".into(), r.token_local.clone()),
        ("RAINDROP_MCP_ENTRY".into(), entree_mcp(&r.base).display().to_string()),
        ("APPDATA_DIR".into(), r.dossier_donnees.display().to_string()),
    ];
    if let Some(d) = &r.dossier_sauvegarde {
        v.push(("BACKUP_DIR".into(), d.display().to_string()));
    }
    v
}

/// Attend que le lockfile porte un port > 0 (spec §3.6 : `port: 0` = binding
/// en cours).
///
/// ATTENTION : l'appelant DOIT avoir effacé un lockfile précédent, sinon le
/// port d'un sidecar mort est lu au premier tour et rendu comme s'il était
/// neuf.
pub fn attendre_port(dossier: &Path, delai: Duration) -> Option<u16> {
    let debut = Instant::now();
    loop {
        if let Ok(texte) = std::fs::read_to_string(verrou::chemin(dossier)) {
            if let Some(port) = verrou::lire(&texte).as_ref().and_then(verrou::port_pret) {
                return Some(port);
            }
        }
        if debut.elapsed() >= delai {
            return None;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

/// `kill -0` : le processus existe-t-il ? On passe par /bin/kill plutôt que
/// d'ajouter `libc` pour trois appels par lancement.
pub fn vivant(pid: i32) -> bool {
    Command::new("/bin/kill")
        .arg("-0")
        .arg(pid.to_string())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// SIGTERM, puis SIGKILL si le processus tient encore après `grace`.
pub fn terminer(pid: i32, grace: Duration) {
    let signal = |s: &str| {
        let _ = Command::new("/bin/kill")
            .arg(s)
            .arg(pid.to_string())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    };
    signal("-TERM");
    let debut = Instant::now();
    while debut.elapsed() < grace {
        if !vivant(pid) {
            return;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    signal("-KILL");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn l_entree_du_sidecar_est_celle_que_tsc_produit() {
        // Vérifié le 2026-09-17 : tsconfig.json a outDir "dist-sidecar" et
        // rootDir "." — l'entrée sort donc à dist-sidecar/sidecar/index.js,
        // et non dist-sidecar/index.js.
        assert_eq!(
            entree(&PathBuf::from("/base")),
            PathBuf::from("/base/dist-sidecar/sidecar/index.js")
        );
    }

    #[test]
    fn l_entree_mcp_pointe_le_paquet_epingle() {
        // CLAUDE.md : spawn direct du JS, jamais `npx @latest`.
        assert_eq!(
            entree_mcp(&PathBuf::from("/base")),
            PathBuf::from("/base/node_modules/@kud/mcp-raindrop-io/dist/index.js")
        );
    }

    #[test]
    fn backup_dir_n_est_passe_que_si_configure() {
        let base = Reglages {
            node: PathBuf::from("node"),
            base: PathBuf::from("/b"),
            token_raindrop: "r".into(),
            token_local: "l".into(),
            dossier_donnees: PathBuf::from("/d"),
            dossier_sauvegarde: None,
        };
        assert!(!env_args(&base).iter().any(|(k, _)| k == "BACKUP_DIR"));
        let avec = Reglages { dossier_sauvegarde: Some(PathBuf::from("/sauv")), ..base };
        assert!(env_args(&avec).iter().any(|(k, v)| k == "BACKUP_DIR" && v == "/sauv"));
    }
}
