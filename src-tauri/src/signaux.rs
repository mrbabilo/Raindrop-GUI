//! Interception de SIGTERM (constat 2 de la vérification T12).
//!
//! tao ne pose aucun handler pour SIGTERM : le défaut Unix tue le processus
//! sans passer par `RunEvent::Exit`, donc sans `arreter_sidecar` — chaque
//! déconnexion ou redémarrage de macOS (qui envoie SIGTERM aux apps)
//! laissait un sidecar derrière lui. On intercepte le signal et on rejoint
//! le MÊME chemin d'arrêt que la fermeture par la fenêtre (⌘Q, prouvé par
//! la vérification) : `arreter_sidecar(GRACE)` puis sortie du processus.
//!
//! Contrainte d'un handler de signal : il s'exécute sur un fil arbitraire
//! du processus, dans un contexte dit « async-signal-safe » où ni
//! l'allocation ni les verrous ne sont permis — un Mutex déjà tenu par le
//! fil interrompu serait un interblocage immédiat, et un panic dans un
//! handler vaut abort. Le handler se réduit donc à UN `store` atomique ;
//! l'attente, l'arrêt et la sortie se déroulent dans un fil observateur
//! ordinaire.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

/// Posé par le handler, lu par le fil observateur.
static SIGTERM_RECU: AtomicBool = AtomicBool::new(false);

/// Le handler lui-même : le store, et rien d'autre — c'est tout ce que le
/// contexte async-signal-safe permet.
extern "C" fn noter_sigterm(_: libc::c_int) {
    SIGTERM_RECU.store(true, Ordering::SeqCst);
}

/// Installe le handler puis démarre le fil observateur qui, au signal,
/// déroule `arreter` et quitte le processus.
///
/// `arreter` est le même geste que le branchement `RunEvent::Exit` de
/// `lib.rs` : `etat.arreter_sidecar(demarrage::GRACE)`. Borné (GRACE = 3 s
/// avant SIGKILL), il reste dans le budget que macOS accorde à une app
/// pendant une déconnexion.
///
/// À appeler une fois, au `setup` (il faut l'`AppHandle` pour rejoindre
/// l'état). Avant l'installation, un SIGTERM garde son comportement par
/// défaut : la fenêtre de course est de l'ordre du démarrage du processus,
/// et le lancement suivant auto-répare par D2 de toute façon.
pub fn intercepter(arreter: impl FnOnce() + Send + 'static) {
    let handler: libc::sighandler_t =
        noter_sigterm as extern "C" fn(libc::c_int) as libc::sighandler_t;
    // `signal` (sémantique BSD sur macOS) : le handler reste installé, un
    // second SIGTERM se contenterait de reposer le drapeau. `sigaction`
    // n'apporterait rien de plus ici.
    unsafe { libc::signal(libc::SIGTERM, handler) };

    std::thread::Builder::new()
        .name("sigterm".into())
        .spawn(move || {
            derouler(|| SIGTERM_RECU.load(Ordering::SeqCst), arreter);
            // L'observateur court à côté de la boucle d'événements de tao :
            // une fois le sidecar arrêté, on sort explicitement — tao n'a
            // rien reçu, il ne terminera pas tout seul.
            std::process::exit(0);
        })
        .expect("fil observateur de SIGTERM");
}

/// Attend le signal puis déroule l'arrêt. Découpé d'`intercepter` pour être
/// testable : un test ne peut ni émettre un vrai SIGTERM vers le harnais ni
/// survivre à `process::exit`, donc il n'exerce que cette boucle, drapeau
/// injecté.
fn derouler(recu: impl Fn() -> bool, arreter: impl FnOnce()) {
    while !recu() {
        std::thread::sleep(Duration::from_millis(50));
    }
    arreter();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;
    use std::sync::Arc;
    use std::time::Instant;

    #[test]
    fn le_handler_ne_pose_que_le_drapeau() {
        // Le handler s'exécute en contexte async-signal-safe : son contrat
        // est de poser le drapeau ET RIEN D'AUTRE (ni verrou, ni allocation,
        // ni panique). L'absence ne se prouve pas depuis Rust ; l'effet, si :
        // bas avant l'appel, levé après.
        assert!(!SIGTERM_RECU.load(Ordering::SeqCst));
        noter_sigterm(libc::SIGTERM);
        assert!(SIGTERM_RECU.load(Ordering::SeqCst));
    }

    #[test]
    fn derouler_attend_le_signal_puis_arrete_une_seule_fois() {
        let recu = Arc::new(AtomicBool::new(false));
        let appels = Arc::new(AtomicUsize::new(0));
        let (r, a) = (Arc::clone(&recu), Arc::clone(&appels));
        // Le « signal » se lève dans 80 ms, dans un autre fil — comme il le
        // serait par le vrai handler pendant que l'observateur dort.
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(80));
            r.store(true, Ordering::SeqCst);
        });

        let debut = Instant::now();
        derouler(
            || recu.load(Ordering::SeqCst),
            || {
                a.fetch_add(1, Ordering::SeqCst);
            },
        );
        let ecoule = debut.elapsed();

        // Un signal, un arrêt — un double `arreter_sidecar` serait sans
        // danger (take()), mais le contrat est d'appeler une seule fois.
        assert_eq!(appels.load(Ordering::SeqCst), 1);
        // L'attente a VRAIMENT attendu : le drapeau se lève à 80 ms, et la
        // sonde de 50 ms ne doit pas dépasser le raisonnable.
        assert!(ecoule >= Duration::from_millis(70), "rendu trop tôt : {ecoule:?}");
        assert!(ecoule < Duration::from_secs(5), "trop lent : {ecoule:?}");
    }
}
