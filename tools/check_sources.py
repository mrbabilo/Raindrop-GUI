#!/usr/bin/env python3
"""Contrôle les sources externes dont Raindrop-GUI dépend.

Le pendant de `check_sources.py` de StarHubFR, pour ce qui vit **hors** du
dépôt : le serveur MCP épinglé qui porte tout l'accès Raindrop, le SDK et les
bibliothèques installées, la référence de l'API REST de repli. Même patron —
un relevé comparé à `.sources-baseline.json`, un `--update` explicite pour
assumer un changement, visible dans le diff. Ici, un écart n'est pas une
faute : c'est un **signal**. Le script dit ce qui a bougé, pas ce qui est
cassé.

Trois familles de sondes, un seul mécanisme (fetch → extraire → comparer) :
`repo` (dépôt GitHub : release filtrée par tag, ou dernier tag ; archive et
README pour le MCP épinglé), `page` (une URL téléchargée : code, taille,
empreinte du contenu utile) et `local` (l'épinglage du dépôt, lu sur le
disque — la sonde de `--offline` : attrape sans réseau le commit qui remplace
le pin exact par une plage).

Le **registre** des sources (ce qu'on surveille et pourquoi) est dans
`tools/sources_registry.py` ; ici vit la mécanique (sondes, comparaison, CLI).

Usage :
    python3 tools/check_sources.py              # relève et compare (sortie 1 si écart)
    python3 tools/check_sources.py --report     # relève et affiche, sans juger
    python3 tools/check_sources.py --update     # assume l'état courant comme référence
    python3 tools/check_sources.py --offline    # n'exécute que les contrôles locaux

Codes de sortie : 0 rien n'a bougé (ou --report / --update) ; 1 au moins une
source a changé ; 2 le script lui-même a échoué (référence illisible).

Les sources injoignables sont **signalées, pas comptées comme un écart** :
une panne de réseau ne doit pas se lire comme « le MCP a sorti une version ».
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINE = os.path.join(ROOT, ".sources-baseline.json")
TIMEOUT = 30
UA = "Raindrop-GUI-source-check/1.0 (+https://github.com/mrbabilo/Raindrop-GUI)"

# Le registre — ce qu'on surveille — vit à côté : un fichier de données. Le
# chemin est posé explicitement, pas hérité de sys.path[0] : cet import
# conditionne **tous** les modes, y compris `--offline` qui doit marcher sans
# rien supposer (appel par `-m`, par symlink dans le PATH, depuis ailleurs).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sources_registry import MCP_PACKAGE, SOURCES, UNPROBED  # noqa: E402


# ── Sortie ────────────────────────────────────────────────────────────────────

_c = lambda i: f"\033[{i}m" if sys.stdout.isatty() else ""


class C:
    """Couleurs ANSI, neutralisées hors terminal."""
    RED, YEL, GRN, DIM, BOLD, END = (_c(91), _c(93), _c(92), _c(2), _c(1), _c(0))


def say(msg=""):
    print(msg)


# ── Accès réseau et disque ────────────────────────────────────────────────────

def gh_api(path):
    """Interroge l'API GitHub, par `gh` si disponible (5 000/h) et par urllib
    sinon (60/h par IP — nos 5 appels passent, séquentiels)."""
    if shutil.which("gh"):
        try:
            out = subprocess.run(["gh", "api", path], capture_output=True, text=True,
                                 timeout=TIMEOUT, stdin=subprocess.DEVNULL)
            if out.returncode == 0:
                return json.loads(out.stdout)
            if "Not Found" in (out.stderr or ""):
                return None
        except Exception:
            pass
    req = urllib.request.Request("https://api.github.com" + path,
                                 headers={"User-Agent": UA,
                                          "Accept": "application/vnd.github+json"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 403 and b"rate limit" in (e.read() or b"").lower():
            raise RuntimeError("quota GitHub anonyme épuisé (60 req/h par IP) — "
                               "réessayer plus tard, ou `gh auth login` (5 000/h)") from e
        raise


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return r.status, r.read()


def dep_pin(name):
    """La version **épinglée** dans package.json — lue en direct, jamais codée ici."""
    try:
        pkg = json.load(open(os.path.join(ROOT, "package.json"), encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return (pkg.get("dependencies") or {}).get(name)


def lock_version(name):
    """La version **résolue** par package-lock.json (ce qui est réellement installé)."""
    try:
        lock = json.load(open(os.path.join(ROOT, "package-lock.json"), encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return ((lock.get("packages") or {}).get(f"node_modules/{name}") or {}).get("version")


# ── Sondes « repo » ───────────────────────────────────────────────────────────

def probe_repo(spec):
    """La version amont d'un dépôt GitHub, à côté de la version locale.

    Un seul appel `/releases?per_page=20` couvre les dépôts simples (hono,
    zod) et les monorepos par changesets (typescript-sdk) : la première
    release dont le tag répond au filtre est la nôtre. Les dépôts **sans**
    release (kud, archivé) sont suivis par leur dernier tag, croisé au pin.
    """
    state = {}
    if spec.get("meta"):
        meta = gh_api(f"/repos/{spec['repo']}") or {}
        state["archive"] = bool(meta.get("archived"))
        state["dernier_push"] = meta.get("pushed_at")
    if spec.get("tags"):
        tags = gh_api(f"/repos/{spec['repo']}/tags?per_page=1") or [{}]
        tag = tags[0].get("name")
        state["dernier_tag"] = tag
        pinned = dep_pin(spec["pin"])
        if tag and pinned and tag.lstrip("v") != pinned:
            state["alerte"] = (f"tag {tag} ≠ épinglé {pinned} — l'épinglage est "
                               f"délibéré (spec §3.1) : lire avant de décider")
    if spec.get("release_filter") or spec.get("lock"):
        rels = gh_api(f"/repos/{spec['repo']}/releases?per_page=20") or []
        pat = re.compile(spec.get("release_filter") or r"^v?\d")
        rel = next((r for r in rels if pat.match(r.get("tag_name") or "")), None)
        if rel:
            state["release"] = rel["tag_name"]
            state["released_at"] = rel.get("published_at")
            if spec.get("notes"):
                # Corps de release en lignes : le diff dira quelle ligne du
                # changelog est apparue. Réservé aux corps compacts (changesets).
                state["notes"] = [l.strip() for l in (rel.get("body") or "").splitlines()
                                  if l.strip()]
        else:
            state["release"] = None
            state["note"] = "aucune release publique ne répond au filtre de tags"
        if spec.get("lock"):
            state["installee"] = lock_version(spec["lock"])
    if spec.get("readme"):
        try:
            _, body = get(spec["readme"])
            state["readme_sha256"] = hashlib.sha256(body).hexdigest()[:16]
        except urllib.error.HTTPError as e:
            state["readme_sha256"] = None
            state["note_readme"] = f"HTTP {e.code} — le README a-t-il déménagé ?"
    return state


# ── Sondes « page » ───────────────────────────────────────────────────────────

def probe_page(spec):
    """Une URL téléchargée pour de vrai : code, taille, empreinte du contenu.

    L'empreinte porte sur le contenu **utile** : `<script>` et `<link>` sont
    retirés avant hachage — un site Docusaurus y embarque des noms de fichiers
    hashés par build, qui crieraient à chaque redéploiement. Un code d'erreur
    HTTP est un **état relevé**, pas une panne."""
    try:
        status, body = get(spec["url"])
    except urllib.error.HTTPError as e:
        body, status = e.read() or b"", e.code
    state = {"http": status, "octets": len(body)}
    if spec.get("hash_html"):
        text = body.decode("utf-8", "replace")
        text = re.sub(r"<(script|style)\b.*?</\1\s*>", " ", text, flags=re.S | re.I)
        text = re.sub(r"<!--.*?-->|<link\b[^>]*>", " ", text, flags=re.S | re.I)
        state["sha256"] = hashlib.sha256(text.encode()).hexdigest()[:16]
    return state


# ── Sonde « local » ───────────────────────────────────────────────────────────

def probe_pins(spec):
    """L'épinglage du dépôt, relevé sur le disque — la sonde de `--offline`.

    Le pin du MCP est une contrainte architecturale (CLAUDE.md, spec §3.1) :
    le contrôler hors réseau attrape le commit qui le remplacerait par une
    plage `^x.y.z`. La présence du JS spawné attrape un `npm install` manquant."""
    pin = dep_pin(spec["package"])
    state = {"epinglee": pin,
             "mcp_dist_presente": os.path.exists(os.path.join(
                 ROOT, "node_modules", spec["package"], "dist", "index.js"))}
    if pin and not pin[0].isdigit():
        state["alerte"] = f"« {pin} » n'est pas une version exacte — l'épinglage est une contrainte (CLAUDE.md)"
    return state


# ── Comparaison ───────────────────────────────────────────────────────────────

def flatten(prefix, value, out):
    """Aplatit un relevé en chemins → valeur, pour dire *quoi* a bougé plutôt
    que « cette source a changé »."""
    if isinstance(value, dict):
        for k in sorted(value):
            flatten(f"{prefix}.{k}" if prefix else k, value[k], out)
    elif isinstance(value, list):
        out[prefix] = json.dumps(value, ensure_ascii=False, sort_keys=True)
    else:
        out[prefix] = value
    return out


def diff(old, new):
    a, b = flatten("", old or {}, {}), flatten("", new or {}, {})
    return [(k, a.get(k), b.get(k))
            for k in sorted(set(a) | set(b)) if a.get(k) != b.get(k)]


def load_baseline():
    if not os.path.exists(BASELINE):
        return {}
    try:
        with open(BASELINE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        say(f"{C.RED}[ERREUR]{C.END} `{os.path.basename(BASELINE)}` illisible : {e}")
        say("         Le corriger, ou le régénérer par `--update` en connaissance de cause.")
        sys.exit(2)


def save_baseline(data):
    with open(BASELINE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")


# ── Programme ─────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(
        description="Relève l'état des sources externes de Raindrop-GUI.")
    ap.add_argument("--update", action="store_true",
                    help="assume l'état courant comme nouvelle référence")
    ap.add_argument("--report", action="store_true",
                    help="affiche le relevé sans juger (sortie 0)")
    ap.add_argument("--only", metavar="MOTIF",
                    help="ne sonde que les sources dont la clé contient MOTIF")
    ap.add_argument("--offline", action="store_true",
                    help="n'exécute que les contrôles qui ne sortent pas de la machine")
    args = ap.parse_args()

    baseline = load_baseline()
    observed, unreachable = {}, []

    selected = [s for s in SOURCES
                if (not args.only or args.only.lower() in s["key"].lower())
                and (not args.offline or s["kind"] == "local")]
    if not selected:
        say(f"{C.YEL}Aucune source ne correspond au filtre.{C.END}")
        return 0

    say(f"{C.BOLD}Sources externes — relevé{C.END}")
    say("")
    probes = {"repo": probe_repo, "page": probe_page, "local": probe_pins}
    for spec in selected:
        key = spec["key"]
        try:
            observed[key] = probes[spec["kind"]](spec)
            say(f"  {C.DIM}·{C.END} {key:22s} {C.DIM}{spec['role']}{C.END}")
        except Exception as e:
            unreachable.append((key, f"{type(e).__name__}: {e}"))
            say(f"  {C.YEL}?{C.END} {key:22s} {C.DIM}injoignable{C.END}")

    say("")

    if args.update:
        # Une source injoignable garde sa référence : l'écraser par du vide
        # ferait passer la panne pour un état, le retour du service pour un
        # changement.
        merged = dict(baseline)
        merged.update(observed)
        save_baseline(merged)
        say(f"{C.GRN}[OK]{C.END} Référence mise à jour "
            f"({len(observed)} source(s) relevée(s), "
            f"{len(unreachable)} conservée(s) telle(s) quelle(s)).")
        return 0

    drift = 0
    for key in sorted(observed):
        changes = diff(baseline.get(key), observed[key])
        if not changes:
            continue
        drift += 1
        known = key in baseline
        head = "NOUVELLE SOURCE" if not known else "A CHANGÉ"
        say(f"{C.YEL}[{head}]{C.END} {C.BOLD}{key}{C.END}")
        for path, was, now in changes:
            if known:
                say(f"    {path} : {C.DIM}{was}{C.END} → {C.BOLD}{now}{C.END}")
            else:
                say(f"    {path} = {now}")
        say("")

    for key, why in unreachable:
        say(f"{C.YEL}[INJOIGNABLE]{C.END} {key} — {why}")
    if unreachable:
        say(f"{C.DIM}    Une source injoignable n'est pas un écart : elle est "
            f"reportée, pas comptée.{C.END}")
        say("")

    if args.report:
        say(f"{C.BOLD}Relevé complet{C.END}")
        say(json.dumps(observed, ensure_ascii=False, indent=2, sort_keys=True))
        say("")
        say(f"{C.BOLD}Sources suivies à la main (pas de sonde){C.END}")
        for name, why, used in UNPROBED:
            say(f"  · {name} — {why}")
            say(f"    {C.DIM}{used}{C.END}")
        return 0

    if drift:
        say(f"{C.YEL}[ÉCART]{C.END} {drift} source(s) ont bougé depuis la référence.")
        say("        Regarder ce qui a changé, décider, puis `--update` pour l'assumer.")
        return 1

    say(f"{C.GRN}[OK]{C.END} Aucune source n'a bougé ({len(observed)} relevée(s)).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
