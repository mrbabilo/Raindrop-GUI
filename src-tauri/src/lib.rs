mod commandes;
mod etat_connexion;
mod jeton;
mod node;
mod runtime;
mod sidecar;
mod signaux;
mod sonde_mcp;
mod trousseau;
mod verrou;

use std::path::{Path, PathBuf};
use tauri::Manager;

use etat_connexion::Etat;

/// Racine des ressources : le dépôt en développement, le dossier embarqué
/// dans le .app une fois empaqueté (Task 12).
///
/// Le lancement DIRECT du binaire (hors LaunchServices) rend
/// `resource_dir()` en `Err(UnknownPath)` — constat T12, défaut 1 : l'ancien
/// `.expect()` tuait l'app sans un mot. `resource_dir()` reste le chemin
/// primaire (c'est lui qui suit les conventions Tauri) ; en cas d'échec on
/// dérive les ressources du binaire lui-même, et si rien ne colle on rend
/// une erreur propre — le `setup` la remonte en diagnostic, la fenêtre ne
/// s'ouvre pas, mais avec un message au lieu d'une panique.
fn base(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        return Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("src-tauri a un parent")
            .to_path_buf());
    }
    match app.path().resource_dir() {
        Ok(d) => Ok(d.join("ressources")),
        Err(origine) => {
            let exe = std::env::current_exe().map_err(|e| {
                format!("dossier de ressources indisponible ({origine}), et le binaire lui-même est illisible : {e}")
            })?;
            ressources_depuis_exe(&exe).ok_or_else(|| {
                format!(
                    "dossier de ressources indisponible ({origine}), et {} n'est pas dans un bundle .app (…/Contents/MacOS/<binaire>)",
                    exe.display()
                )
            })
        }
    }
}

/// Pur : du chemin du binaire vers les ressources embarquées, si la
/// disposition est bien celle d'un bundle. Un binaire nu (par exemple
/// `target/release/raindrop-gui` sans empaquetage) rend `None` — erreur
/// propre dans `base()`, plutôt qu'un chemin fantôme
/// `<parent>/Contents/Resources/ressources` qui ne mènerait nulle part.
fn ressources_depuis_exe(exe: &Path) -> Option<PathBuf> {
    let macos = exe.parent()?; // <bundle>/Contents/MacOS
    let contents = macos.parent()?; // <bundle>/Contents
    let ressources = contents.join("Resources/ressources");
    ressources.is_dir().then_some(ressources)
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commandes::etat_connexion,
            commandes::enregistrer_jeton,
            commandes::relancer,
            commandes::installer_runtime,
            commandes::progression_installation
        ])
        .setup(|app| {
            let token_local = match jeton::engendrer() {
                Ok(t) => t,
                // Sans aléa système, rien de sûr n'est possible : mieux vaut
                // s'arrêter net que servir une superficie HTTP devinable.
                Err(e) => return Err(format!("aléa système illisible : {e}").into()),
            };
            let racine = match base(app.handle()) {
                Ok(r) => r,
                Err(e) => return Err(e.into()),
            };
            let etat = Etat::new(token_local, racine, verrou::dossier_donnees());
            app.manage(etat);

            // SIGTERM (déconnexion, redémarrage, `kill`) ne traverse aucun
            // `RunEvent` : on le fait rejoindre le MÊME arrêt que ⌘Q — chemin
            // prouvé par la vérification T12, ne pas y toucher. L'arrêt est
            // borné (GRACE) et le handler du signal ne fait rien d'autre
            // qu'un store atomique (voir `signaux`).
            let handle_sigterm = app.handle().clone();
            signaux::intercepter(move || {
                if let Some(etat) = handle_sigterm.try_state::<Etat>() {
                    etat.arreter_sidecar(commandes::GRACE);
                }
            });

            // La séquence tourne à côté : la fenêtre paraît tout de suite, et
            // `etat_connexion` attend le verdict (appel `await` côté JS).
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let etat = handle.state::<Etat>();
                let resultat = commandes::sequence(&etat);
                etat.poser(resultat);
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("erreur au lancement de l'application Tauri")
        .run(|app, evenement| {
            // Le sidecar est notre enfant : le laisser derrière laisserait un
            // port ouvert et un lockfile menteur.
            if let tauri::RunEvent::Exit = evenement {
                if let Some(etat) = app.try_state::<Etat>() {
                    etat.arreter_sidecar(commandes::GRACE);
                }
            }
        });
}

#[cfg(test)]
mod tests {
    // Harnais : les tasks suivantes déposent ici leurs modules purs. Ce
    // premier test ne prouve qu'une chose — `cargo test` compile et tourne
    // sur ce crate — mais c'est la marche sur laquelle tout le reste monte.
    #[test]
    fn le_harnais_de_test_tourne() {
        assert_eq!(2 + 2, 4);
    }

    use super::*;
    use std::fs;

    /// Factise un .app empaqueté : `…/Contents/MacOS/<binaire>` +
    /// `…/Contents/Resources/ressources`, la disposition produite par
    /// l'empaquetage (constat T12 : le sidecar y vit). Rend la racine.
    fn bundle_factice(nom: &str) -> PathBuf {
        let racine =
            std::env::temp_dir().join(format!("raindrop-bundle-{}-{nom}", std::process::id()));
        let contents = racine.join("Raindrop GUI.app/Contents");
        fs::create_dir_all(contents.join("MacOS")).expect("création MacOS");
        fs::create_dir_all(contents.join("Resources/ressources")).expect("création Resources");
        fs::write(contents.join("MacOS/raindrop-gui"), b"").expect("écriture du binaire");
        racine
    }

    #[test]
    fn le_binaire_du_bundle_mene_aux_ressources_embarquees() {
        // Constat T12, défaut 1 : lancé hors LaunchServices, `resource_dir()`
        // rend UnknownPath — le repli doit retrouver
        // <bundle>/Contents/Resources/ressources depuis
        // <bundle>/Contents/MacOS/<binaire>.
        let racine = bundle_factice("direct");
        let binaire = racine.join("Raindrop GUI.app/Contents/MacOS/raindrop-gui");
        let trouve = ressources_depuis_exe(&binaire)
            .expect("la disposition du bundle doit être reconnue");
        assert_eq!(trouve, racine.join("Raindrop GUI.app/Contents/Resources/ressources"));
        let _ = fs::remove_dir_all(&racine);
    }

    #[test]
    fn un_binaire_hors_bundle_rend_none_plutot_qu_un_chemin_menteur() {
        // <depot>/target/release/raindrop-gui : …/target/Contents/Resources
        // n'existe pas. `None` (donc erreur propre dans `base()`) plutôt
        // qu'un chemin fantôme qui ne se découvrirait faux que plus tard.
        let binaire = Path::new("/depot/target/release/raindrop-gui");
        assert_eq!(ressources_depuis_exe(binaire), None);
    }
}
