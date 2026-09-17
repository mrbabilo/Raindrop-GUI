pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("erreur au lancement de l'application Tauri");
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
