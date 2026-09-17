mod commandes;
mod etat_connexion;
mod jeton;
mod node;
mod sidecar;
mod trousseau;
mod verrou;

use std::path::PathBuf;
use tauri::Manager;

use etat_connexion::Etat;

/// Racine des ressources : le dépôt en développement, le dossier embarqué
/// dans le .app une fois empaqueté (Task 12).
fn base(app: &tauri::AppHandle) -> PathBuf {
    if cfg!(debug_assertions) {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("src-tauri a un parent")
            .to_path_buf()
    } else {
        app.path()
            .resource_dir()
            .expect("dossier de ressources")
            .join("ressources")
    }
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commandes::etat_connexion,
            commandes::enregistrer_jeton,
            commandes::relancer
        ])
        .setup(|app| {
            let token_local = match jeton::engendrer() {
                Ok(t) => t,
                // Sans aléa système, rien de sûr n'est possible : mieux vaut
                // s'arrêter net que servir une superficie HTTP devinable.
                Err(e) => return Err(format!("aléa système illisible : {e}").into()),
            };
            let etat = Etat::new(token_local, base(app.handle()), verrou::dossier_donnees());
            app.manage(etat);

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
}
