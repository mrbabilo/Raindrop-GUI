#!/usr/bin/env python3
"""Prépare une livraison de Raindrop GUI : build complet, puis archives.

Inspiré de `release.py` de StarHubTH. Deux différences assumées :

- **Pas de compteur de build séparé.** StarHubTH incrémente CFBundleVersion
  avant chaque build ; Tauri pose CFBundleVersion = version de
  tauri.conf.json, et patcher le plist après coup obligerait à re-signer.
  En Phase 1, sans mécanisme de mise à jour, la version lue suffit — le
  compteur reviendra le jour où deux livraisons de la même version devront
  se comparer.
- **L'envoi GitHub est demandé, jamais automatique** : ce dépôt ne pousse
  que sur demande explicite (CLAUDE.md) — le prompt y/n est la demande.

Usage :
    python3 scripts/release.py
"""
from __future__ import annotations

import json
import pathlib
import shutil
import subprocess
import sys

RACINE = pathlib.Path(__file__).resolve().parent.parent
BUNDLE_DIR = RACINE / "src-tauri" / "target" / "release" / "bundle"
ARCHIVES = RACINE / "bundles"
APP = "Raindrop GUI.app"
SUFFIXE_APP = f"{APP}_"


def info(msg: str) -> None:
    print(f"[INFO] {msg}")


def version_app() -> str:
    conf = json.loads((RACINE / "src-tauri" / "tauri.conf.json").read_text(encoding="utf-8"))
    return conf["version"]


def livrer() -> None:
    version = version_app()
    info(f"Livraison v{version} — build complet d'abord (tests compris)…")
    build = subprocess.run([sys.executable, str(RACINE / "scripts" / "build_app.py")], cwd=RACINE)
    if build.returncode != 0:
        print("[ERROR] Build en échec — livraison interrompue.")
        return

    source = BUNDLE_DIR / "macos" / APP
    if not source.is_dir():
        print(f"[ERROR] {source} introuvable après le build.")
        return

    ARCHIVES.mkdir(exist_ok=True)

    # `ditto` et pas `zip` : il préserve les forks de ressources et la
    # signature — une archive `zip` classique casse les deux (héritage du
    # modèle StarHubTH, pareil sous Tauri).
    zip_path = ARCHIVES / f"RaindropGUI_v{version}.zip"
    if zip_path.exists():
        zip_path.unlink()
    info(f"Archive du .app → {zip_path.name}…")
    if subprocess.run(["ditto", "-c", "-k", "--keepParent", str(source), str(zip_path)]).returncode != 0:
        print("[ERROR] ditto a échoué.")
        return

    dmg_source = next(iter((BUNDLE_DIR / "dmg").glob("*.dmg")), None)
    if dmg_source:
        dmg_dest = ARCHIVES / f"RaindropGUI_v{version}{dmg_source.suffix}"
        shutil.copy2(dmg_source, dmg_dest)
        info(f"Image disque copiée → {dmg_dest.name}")

    print("[SUCCESS] Livraison prête.")
    for f in sorted(ARCHIVES.iterdir()):
        print(f"[INFO]   {f.name} ({f.stat().st_size / 1e6:.0f} Mo)")

    reponse = input("[PROMPT] Envoyer cette livraison sur GitHub Releases ? (y/N) : ")
    if reponse.strip().lower() not in ("y", "yes", "o", "oui"):
        info("Envoi sauté — les archives restent dans bundles/ (gitignored).")
        return
    fichiers = [str(zip_path)] + ([str(dmg_dest)] if dmg_source else [])
    res = subprocess.run(
        ["gh", "release", "create", f"v{version}", *fichiers,
         "--title", f"Raindrop GUI v{version}",
         "--notes", f"Livraison Raindrop GUI v{version}."],
        cwd=RACINE, capture_output=True, text=True)
    if res.returncode == 0:
        info(f"Publié : {res.stdout.strip()}")
    else:
        print(f"[ERROR] Échec de l'envoi :\n{res.stderr.strip()}")


if __name__ == "__main__":
    livrer()
