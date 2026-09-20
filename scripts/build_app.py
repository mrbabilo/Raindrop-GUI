#!/usr/bin/env python3
"""Compile l'application Raindrop GUI — le .app complet, prêt à lancer.

Inspiré de `build_app.py` de StarHubTH : vérifications qui ratent VITE et
clairement avant les longues étapes, puis build, puis contrôles du résultat.
La séquence de build elle-même appartient à `tauri.conf.json`
(`beforeBuildCommand` : front + `scripts/preparer-ressources.sh`) — ce
script est l'orchestrateur qui vérifie, déclenche et contrôle, pas un
second chemin de build : deux chemins finissent toujours par diverger.

Usage :
    python3 scripts/build_app.py                 # build complet
    python3 scripts/build_app.py --skip-tests    # itération : sans tests ni typechecks
"""
from __future__ import annotations

import json
import pathlib
import platform
import shutil
import subprocess
import sys

RACINE = pathlib.Path(__file__).resolve().parent.parent
BUNDLE_DIR = RACINE / "src-tauri" / "target" / "release" / "bundle"
RESSOURCES = RACINE / "src-tauri" / "ressources"
MCP_EPINGLE = "1.3.1"

# CLAUDE.md : cible ≤ 300 lignes, plafond dur 400 — « comme le cliquet de
# StarHubTH ». Le plafond est ici une BARRE dure (une violation échoue au
# build), la cible un avertissement.
#
# Les tests sont COMPTIS (lettre de CLAUDE.md : « tests compris ») —
# ré-armé le 2026-09-20 : l'exception front datait d'une dette soldée
# (`raindrops.test.ts` 430 lignes, découpé) ; au ré-armement, le plus gros
# test fait 397 (DetailPane.test.tsx), sous le plafond. Les harnais de test
# (sidecar/testing/, src/test/) restent hors compte : pas du code livré au
# sens du cliquet. Hors compte également : généré (dist*, target,
# ressources, node_modules), binaires, locks.
PLAFOND_DUR = 400
CIBLE = 300
MOTIFS_CODE = ["src/**/*.ts", "src/**/*.tsx", "sidecar/**/*.ts",
               "shared/**/*.ts", "src-tauri/src/**/*.rs"]
# Préfixes de chemins (relatifs à la racine, POSIX) exclus du compte : le
# généré, les icônes binaires — et les harnais de test, qui ne sont pas du
# code livré au sens du cliquet.
PREFIXES_EXCLUS = ("src-tauri/target/", "src-tauri/ressources/",
                   "src-tauri/icons/", "src/test/", "sidecar/testing/")


def info(msg: str) -> None:
    print(f"[INFO] {msg}")


def erreur(msg: str) -> None:
    print(f"[ERROR] {msg}")


def lancer(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=RACINE, check=False, **kw)


def version_app() -> str:
    conf = json.loads((RACINE / "src-tauri" / "tauri.conf.json").read_text(encoding="utf-8"))
    return conf["version"]


# ── Vérifications préalables — échouer en 2 s plutôt qu'en 4 minutes ────────

def verifier_epinglage_mcp() -> None:
    """Le MCP est épinglé à 1.3.1 (CLAUDE.md, contrainte non négociable).

    Contrôlé à DEUX endroits : package.json (la déclaration) et
    package-lock.json (ce que `npm ci` installera vraiment — une dérive du
    lock contre la déclaration produirait une ressource fausse, détectée
    trop tard par preparer-ressources.sh).
    """
    declare = json.loads((RACINE / "package.json").read_text(encoding="utf-8"))
    trouve = declare.get("dependencies", {}).get("@kud/mcp-raindrop-io")
    if trouve != MCP_EPINGLE:
        erreur(f"@kud/mcp-raindrop-io épinglé à {MCP_EPINGLE} dans package.json, trouvé {trouve!r}.")
        raise SystemExit(1)
    lock = json.loads((RACINE / "package-lock.json").read_text(encoding="utf-8"))
    verrou = lock.get("packages", {}).get("node_modules/@kud/mcp-raindrop-io", {}).get("version")
    if verrou != MCP_EPINGLE:
        erreur(f"package-lock.json porte @kud/mcp-raindrop-io {verrou!r} : le lock a dérivé de la déclaration.")
        raise SystemExit(1)


def resoudre_node() -> pathlib.Path:
    """Le node ≥ 20 que le sidecar exigera au lancement (spec §3.2).

    Mêmes candidats que src-tauri/src/node.rs — mesuré le 2026-09-17, une app
    lancée du Finder n'a PAS node sur son PATH ; ici c'est le BUILD qui en a
    besoin (npm, tsc, tauri CLI), et le PATH du terminal le porte presque
    toujours. La résolution explicite garde le diagnostic lisible quand même.
    """
    candidats = [pathlib.Path("/opt/homebrew/bin/node"),
                 pathlib.Path("/usr/local/bin/node"),
                 pathlib.Path("/usr/bin/node")]
    import shutil as sh
    dans_path = sh.which("node")
    if dans_path:
        candidats.insert(0, pathlib.Path(dans_path))
    for c in candidats:
        if not c.is_file():
            continue
        sortie = subprocess.run([str(c), "--version"], capture_output=True, text=True)
        if sortie.returncode != 0:
            continue
        v = sortie.stdout.strip().lstrip("v")
        try:
            majeure = int(v.split(".")[0])
        except ValueError:
            continue
        if majeure >= 20:
            info(f"node {v} ({c})")
            return c
    erreur("Node ≥ 20 introuvable (PATH et /opt/homebrew/bin, /usr/local/bin, /usr/bin sondés).")
    raise SystemExit(1)


def verifier_outils_rust() -> None:
    for outil in ("cargo", "rustc"):
        if shutil.which(outil) is None:
            erreur(f"{outil} introuvable dans le PATH — requis pour compiler le shell Tauri.")
            raise SystemExit(1)


# ── Le cliquet de taille (CLAUDE.md : cible 300, plafond dur 400) ───────────

def verifier_tailles() -> None:
    viols: list[tuple[str, int]] = []
    vues: set[str] = set()
    for motif in MOTIFS_CODE:
        for p in RACINE.glob(motif):
            rel = p.relative_to(RACINE).as_posix()
            if rel in vues or rel.startswith(PREFIXES_EXCLUS):
                continue
            vues.add(rel)
            n = len(p.read_text(encoding="utf-8").splitlines())
            if n > PLAFOND_DUR:
                viols.append((rel, n))
            elif n > CIBLE:
                print(f"[WARN] {rel} : {n} lignes (cible {CIBLE}, plafond {PLAFOND_DUR})")
    if viols:
        for rel, n in viols:
            erreur(f"{rel} : {n} lignes — plafond dur {PLAFOND_DUR} dépassé.")
        print("[ERROR] Le fichier se découpe selon ses frontières naturelles ou se signale, il ne grossit pas.")
        raise SystemExit(1)


# ── Tests — un build livré est vert, ou on le sait avant de compiler ────────

def lancer_tests() -> None:
    info("Tests vitest (node + front)…")
    if lancer(["npm", "test"]).returncode != 0:
        erreur("Tests en échec — voir la sortie ci-dessus.")
        raise SystemExit(1)
    for tsconfig, nom in (("tsconfig.json", "sidecar"), ("tsconfig.front.json", "front")):
        if lancer(["npm", "run", "typecheck" if nom == "sidecar" else "typecheck:front"]).returncode != 0:
            erreur(f"Typecheck {nom} en échec.")
            raise SystemExit(1)


# ── Build et contrôles du résultat ───────────────────────────────────────────

def construire() -> None:
    info("tauri build — front, ressources, Rust release, .app + .dmg…")
    if lancer(["npx", "tauri", "build"]).returncode != 0:
        erreur("tauri build a échoué — voir la sortie ci-dessus.")
        raise SystemExit(1)


def verifier_bundle(version: str) -> pathlib.Path:
    """Le .app existe-t-il, et porte-t-il VRAIMENT ses ressources ?

    C'est le contrôle qui attrape la classe « marche en dev, morte une fois
    empaquetée » : le sidecar embarqué, son entrée, et le MCP épinglé à la
    version exacte DANS le bundle.
    """
    app = BUNDLE_DIR / "macos" / "Raindrop GUI.app"
    if not app.is_dir():
        erreur(f"{app} introuvable après le build.")
        raise SystemExit(1)
    cote = sum(f.stat().st_size for f in app.rglob("*") if f.is_file())
    entree = app / "Contents" / "Resources" / "ressources" / "dist-sidecar" / "sidecar" / "index.js"
    if not entree.is_file():
        erreur(f"le sidecar n'est pas embarqué ({entree} absent) — bundle.resources manque ou preparer-ressources.sh n'a pas tourné.")
        raise SystemExit(1)
    mcp = app / "Contents" / "Resources" / "ressources" / "node_modules" / "@kud" / "mcp-raindrop-io" / "package.json"
    version_mcp = json.loads(mcp.read_text(encoding="utf-8"))["version"]
    if version_mcp != MCP_EPINGLE:
        erreur(f"MCP embarqué en {version_mcp}, attendu {MCP_EPINGLE}.")
        raise SystemExit(1)
    info(f".app vérifié : sidecar embarqué, MCP {version_mcp}, {cote / 1e6:.0f} Mo, version {version}")
    return app


def main() -> None:
    skip_tests = "--skip-tests" in sys.argv
    info(f"Build de Raindrop GUI v{version_app()} ({platform.machine()})…")
    verifier_epinglage_mcp()
    resoudre_node()
    verifier_outils_rust()
    verifier_tailles()
    if not skip_tests:
        lancer_tests()
    else:
        print("[WARN] Tests et typechecks sautés (--skip-tests) — ce build n'est pas livrable.")
    construire()
    verifier_bundle(version_app())
    dmg = next(iter((BUNDLE_DIR / "dmg").glob("*.dmg")), None)
    print("[SUCCESS] Build terminé.")
    print(f"[INFO] .app : {BUNDLE_DIR / 'macos' / 'Raindrop GUI.app'}")
    print(f"[INFO] .dmg : {dmg if dmg else '(absent)'}")
    print("[INFO] Signature ad-hoc : au premier lancement, Gatekeeper met l'app en")
    print("       quarantaine — `xattr -dr com.apple.quarantine '<chemin du .app>'` la lève.")


if __name__ == "__main__":
    main()
