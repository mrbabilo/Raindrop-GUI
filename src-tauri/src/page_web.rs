//! La fenêtre de la page web RÉELLE (spec lecture §4).
//!
//! Un site dans cette fenêtre est un ŒIL, pas une main : `capabilities/
//! default.json` ne liste que `main`, la fenêtre créée ici (étiquette
//! `page-…`) ne matche AUCUNE capability — zéro IPC, zéro plugin. C'est le
//! point de sécurité de tout le lot : le test
//! `les_capabilities_ne_listent_que_la_fenetre_principale` verrouille le
//! fichier contre un `"*"` futur, qui réintégrerait la fenêtre en silence.

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Validation AU BORD (spec lecture §4) : schémas http et https, jamais
/// `file://`, jamais `javascript:`, jamais l'origine de l'app. Une URL
/// refusée rend une ERREUR NOMMÉE, pas un panique. Pur : testé en bas de
/// fichier, le reste du module ne crée rien tant que cette fonction n'a
/// pas dit oui.
pub fn valider(url_brute: &str) -> Result<String, String> {
    let u = url::Url::parse(url_brute).map_err(|e| format!("URL illisible : {e}"))?;
    match u.scheme() {
        "http" | "https" => {}
        autre => {
            return Err(format!(
                "schéma refusé : {autre}:// — seuls http et https s'ouvrent ici"
            ))
        }
    }
    if u.host_str() == Some("tauri.localhost") {
        return Err(
            "l'origine de l'application ne s'ouvre pas dans la fenêtre page web".into(),
        );
    }
    Ok(u.to_string())
}

/// Étiquette de fenêtre STABLE par URL : rouvrir la MÊME URL concentre la
/// fenêtre existante au lieu d'en multiplier (spec lecture §4). Empreinte
/// SHA-256 tronquée à 16 hex — les étiquettes Tauri n'admettent que
/// lettres, chiffres, `-`, `/`, `:`, `_`.
fn empreinte(url: &str) -> String {
    let d = Sha256::digest(url.as_bytes());
    d.iter().take(8).map(|b| format!("{b:02x}")).collect()
}

/// Deux URL différentes au caractère près sont deux pages : l'empreinte
/// porte l'URL normalisée de `valider`, pas la saisie brute.
fn etiquette_de(url_normale: &str) -> String {
    format!("page-{}", empreinte(url_normale))
}

#[tauri::command]
pub async fn ouvrir_page_web(app: AppHandle, url: String) -> Result<(), String> {
    let url = valider(&url)?;
    let label = etiquette_de(&url);
    // Déjà ouverte pour CETTE URL : concentrer au lieu de multiplier.
    if let Some(fenetre) = app.get_webview_window(&label) {
        let _ = fenetre.unminimize();
        let _ = fenetre.set_focus();
        return Ok(());
    }
    // Le titre naît une fois : le site ne peut pas le changer (aucun JS
    // n'est injecté, aucun IPC — c'est un œil, pas une main).
    let titre = url
        .parse::<url::Url>()
        .ok()
        .and_then(|u| u.host_str().map(str::to_string))
        .unwrap_or_else(|| "Page web".into());
    // La création d'une fenêtre WebKit se fait sur le thread principal
    // (constat plan 3 : tout ce qui touche la fenêtre y vit) ; une commande
    // async y échappe. Le builder passe donc par `run_on_main_thread`, et
    // la commande attend le verdict par canal — le geste est bref
    // (millisecondes), l'attente n'est pas un travail bloquant long.
    let (tx, rx) = std::sync::mpsc::channel();
    let app_pour_fenetre = app.clone();
    let label_pour_fenetre = label.clone();
    let url_pour_fenetre = url.clone();
    app.run_on_main_thread(move || {
        let resultat = url_pour_fenetre
            .parse()
            .map_err(|e| format!("URL refusée par le webview : {e}"))
            .and_then(|cible| {
                WebviewWindowBuilder::new(
                    &app_pour_fenetre,
                    label_pour_fenetre.clone(),
                    WebviewUrl::External(cible),
                )
                .title(titre)
                .inner_size(1024.0, 768.0)
                .build()
                .map(|_| ())
                .map_err(|e| format!("fenêtre non créée : {e}"))
            });
        let _ = tx.send(resultat);
    })
    .map_err(|e| format!("thread principal injoignable : {e}"))?;
    rx.recv()
        .map_err(|e| format!("création de fenêtre interrompue : {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn http_et_https_passent() {
        assert!(valider("http://exemple.fr/page").is_ok());
        assert!(valider("https://exemple.fr/page?a=1").is_ok());
    }

    #[test]
    fn tout_autre_schema_est_refuse_par_son_nom() {
        // Le message NOMME le schéma : une erreur qu'on comprend, pas un
        // « invalid url » nu.
        let e = valider("file:///etc/passwd").unwrap_err();
        assert!(e.contains("file"), "le refus nomme le schéma : {e}");
        assert!(valider("javascript:alert(1)").is_err());
        assert!(valider("data:text/html,<h1>x</h1>").is_err());
    }

    #[test]
    fn l_origine_de_l_app_est_refusee_explicitement() {
        // `tauri://localhost` est refusé par son schéma ; MAIS
        // `https://tauri.localhost` est un VRAI https — sans la garde sur
        // l'hôte, elle passerait. Le test porte les deux.
        assert!(valider("tauri://localhost/").is_err());
        let e = valider("https://tauri.localhost/index.html").unwrap_err();
        assert!(e.contains("origine"), "le refus nomme l'origine : {e}");
    }

    #[test]
    fn une_url_illisible_est_une_erreur_nommee() {
        assert!(valider(":::").is_err());
    }

    #[test]
    fn l_empreinte_est_stable_et_discriminante() {
        assert_eq!(empreinte("https://a.fr"), empreinte("https://a.fr"));
        assert_ne!(empreinte("https://a.fr"), empreinte("https://b.fr"));
        assert_eq!(empreinte("https://a.fr").len(), 16);
    }

    #[test]
    fn l_etiquette_est_prefixee_et_valide_pour_tauri() {
        let etiquette = etiquette_de("https://exemple.fr/page");
        assert!(etiquette.starts_with("page-"));
        assert!(etiquette
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-/_:".contains(c)));
    }

    #[test]
    fn les_capabilities_ne_listent_que_la_fenetre_principale() {
        // Point de sécurité du lot (spec lecture §4, À VÉRIFIER, pas à
        // présumer) : la fenêtre `page-…` ne doit JAMAIS matcher une
        // capability. Un `"*"` ou un préfixe glob dans la liste la
        // réintégreraient en silence — ce test tire avant.
        let chemin = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("capabilities/default.json");
        let brut = std::fs::read_to_string(chemin).expect("capabilities/default.json lisible");
        let v: serde_json::Value =
            serde_json::from_str(&brut).expect("capabilities/default.json est du JSON");
        let fenetres = v["windows"].as_array().expect("windows est une liste");
        assert_eq!(fenetres.len(), 1, "une seule fenêtre listée : main");
        assert_eq!(fenetres[0].as_str(), Some("main"));
    }
}
