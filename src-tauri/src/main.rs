// Le binaire ne fait qu'appeler la bibliothèque : tout le code vit dans
// lib.rs, seul endroit que `cargo test` sait exercer.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    raindrop_gui_lib::run()
}
