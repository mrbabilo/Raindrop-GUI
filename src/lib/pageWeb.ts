// La page web RÉELLE (spec lecture §4) : sous l'origine Tauri, la commande
// du shell — fenêtre dédiée, ZÉRO capability ; hors Tauri (dev navigateur,
// tests), window.open. Un seul helper : jamais un site dans l'iframe de
// l'app (X-Frame-Options y bloquerait les gros sites, et l'origine de l'app
// y serait exposée).
export async function ouvrirPageWeb(url: string): Promise<void> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("ouvrir_page_web", { url });
    return;
  }
  window.open(url, "_blank", "noopener");
}
