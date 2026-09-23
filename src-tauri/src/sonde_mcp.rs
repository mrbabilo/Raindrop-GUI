//! Sondage de santé du sidecar : après la publication du port, attendre que
//! le serveur MCP soit RÉELLEMENT connecté avant de rendre `Pret`.
//!
//! La course (constat vérifié du 2026-09-17) : `attendre_port` rend le port
//! dès sa publication, mais le MCP du sidecar ne se connecte que ~160 ms
//! plus tard — le front qui interroge `/api/user` aussitôt reçu `Pret`
//! tombait TOUJOURS dans la fenêtre « starting », et chaque « Valider »
//! rejouait le cycle. Ici, après le port, on sonde `GET /api/health`
//! jusqu'à `mcp: "connected"` — ou jusqu'à l'échéance : on rend alors la
//! main quand même (l'écran d'erreur d'appel côté front, comportement
//! d'avant, vaut mieux qu'un démarrage bloqué).
//!
//! Client HTTP : le `curl` système — binaires de base macOS, zéro
//! dépendance HTTP Rust (même parti pris que le plan pour l'installateur
//! de runtime). Bindé 127.0.0.1, auth Bearer avec le token LOCAL : le
//! token Raindrop ne traverse jamais HTTP (spec §3.7).

use std::io::Write;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// Entre deux sondages (constat : 250 ms).
const INTERVALLE: Duration = Duration::from_millis(250);
/// Borne d'UNE tentative (`curl -m`) : un curl suspendu ne doit pas faire
/// déborder l'échéance totale de plus d'un cran.
const MAX_TENTATIVE: &str = "2";

/// Décision, pure et testée : le corps d'une réponse `/api/health`
/// annonce-t-il `mcp: "connected"` ?
///
/// La forme réelle, côté sidecar (`sidecar/api/app.ts`) :
/// `{"status":"ok","mcp":…}` où `mcp` vaut l'un des cinq états de
/// `sidecar/mcp/lifecycle.ts` (`starting|connected|restarting|crashed|
/// stopped`). Tout le reste — corps non-JSON (401, page d'erreur), champ
/// absent, autre état, casse différente — veut dire « pas encore ».
pub fn connecte(corps: &str) -> bool {
    match serde_json::from_str::<serde_json::Value>(corps) {
        Ok(v) => v.get("mcp").and_then(|m| m.as_str()) == Some("connected"),
        Err(_) => false,
    }
}

/// La ligne de sondage, pure pour que le test prouve où passe le token :
/// NULLE PART dans la ligne de commande (audit du 2026-09-23). L'en-tête
/// `Authorization` était un argument de `curl` — visible par `ps` à tout
/// compte de la machine, à chaque tentative, pendant jusqu'à 20 s : un autre
/// utilisateur d'un Mac partagé lisait le jeton et pilotait l'API locale.
/// `-H @-` fait lire l'en-tête sur l'entrée standard (curl ≥ 7.55).
fn arguments(port: u16) -> Vec<String> {
    vec![
        "-s".into(),                  // silencieux : on décide sur le corps
        "-m".into(),                  // borne de la tentative
        MAX_TENTATIVE.into(),
        "-H".into(),
        "@-".into(),                  // l'en-tête arrive par l'entrée standard
        format!("http://127.0.0.1:{port}/api/health"),
    ]
}

/// L'en-tête d'authentification, écrit sur l'entrée standard de `curl`.
fn entete(token: &str) -> String {
    format!("Authorization: Bearer {token}\n")
}

/// Une tentative : `curl` lit l'en-tête sur son entrée, le jeton ne paraît
/// dans aucun argument.
fn tenter(args: &[String], entete: &str) -> Option<std::process::Output> {
    let mut enfant = Command::new("curl")
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    if let Some(mut entree) = enfant.stdin.take() {
        let _ = entree.write_all(entete.as_bytes());
    } // `entree` tombe ici : curl lit la fin de flux
    enfant.wait_with_output().ok()
}

/// Sonde jusqu'à `mcp: "connected"`, au plus `delai` (constat : ~20 s).
/// Bloquant — à appeler depuis le fil de fond de `lancer_sidecar`
/// uniquement, comme `sidecar::attendre_port`. Rend sans garantie au-delà
/// du délai : l'appelant rend alors `Pret` quand même (décision du constat).
pub fn attendre_connexion(port: u16, token: &str, delai: Duration) {
    let args = arguments(port);
    let entete = entete(token);
    let debut = Instant::now();
    while debut.elapsed() < delai {
        if let Some(sortie) = tenter(&args, &entete) {
            if sortie.status.success()
                && connecte(&String::from_utf8_lossy(&sortie.stdout))
            {
                return;
            }
        }
        std::thread::sleep(INTERVALLE);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_reponse_reelle_connectee_est_reconnue() {
        // Forme exacte produite par sidecar/api/app.ts, telle que vérifiée
        // au curl par le plan (task du démarrage).
        assert!(connecte(r#"{"status":"ok","mcp":"connected"}"#));
    }

    #[test]
    fn les_autres_etats_du_cycle_de_vie_ne_sont_pas_une_connexion() {
        // sidecar/mcp/lifecycle.ts : les cinq états possibles. « starting »
        // est précisément la fenêtre de course que la sonde doit franchir.
        for etat in ["starting", "restarting", "crashed", "stopped"] {
            let corps = format!(r#"{{"status":"ok","mcp":"{etat}"}}"#);
            assert!(!connecte(&corps), "état {etat} pris à tort pour connecté");
        }
    }

    #[test]
    fn un_corps_qui_ne_se_parse_pas_n_est_pas_une_connexion() {
        assert!(!connecte(""));
        assert!(!connecte("{ pas du json"));
        // Réponse 401 du sidecar si le token local ne collait pas — un
        // statut curl 200 avec ce corps ne doit jamais passer pour connecté.
        assert!(!connecte(
            r#"{"error":{"code":"INVALID_INPUT","message":"token local requis"}}"#
        ));
    }

    #[test]
    fn un_json_sans_un_mcp_connected_exact_n_est_pas_une_connexion() {
        assert!(!connecte(r#"{"status":"ok"}"#)); // champ absent
        assert!(!connecte(r#"{"mcp":"connecte"}"#)); // valeur voisine
        assert!(!connecte(r#"{"mcp":123}"#)); // pas une chaîne
        assert!(!connecte(r#"{"status":"ok","mcp":"Connected"}"#)); // casse
    }

    #[test]
    fn le_token_ne_parait_dans_aucun_argument_de_curl() {
        let args = arguments(51234);
        // Le jeton n'est pas un paramètre de la ligne de commande : `ps` ne
        // peut rien en montrer, quel que soit le compte qui regarde.
        assert!(args.iter().all(|a| !a.contains("Bearer")), "en-tête dans l'argv : {args:?}");
        assert!(args.windows(2).any(|w| w[0] == "-H" && w[1] == "@-"), "en-tête lu sur stdin : {args:?}");
        assert_eq!(entete("jeton-local-secret"), "Authorization: Bearer jeton-local-secret\n");
        let url = args.last().expect("l'URL en dernier argument");
        assert_eq!(url, "http://127.0.0.1:51234/api/health");
        // La borne par tentative est bien passée à curl : sans elle, un curl
        // suspendu ferait déborder l'échéance totale de la sonde.
        assert!(args.windows(2).any(|w| w[0] == "-m" && w[1] == MAX_TENTATIVE));
    }}
