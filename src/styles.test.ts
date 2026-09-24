import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { injecterRegles } from "./test/injectStyles";

// Les règles de la FEUILLE elle-même, celles qu'aucun composant ne porte seul
// (audit UX du 2026-09-23). Lues dans le vrai src/styles.css — jamais
// recopiées (voir injectStyles.ts).

const source = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

afterEach(() => {
  document.head.querySelectorAll("style").forEach((s) => s.remove());
  document.body.innerHTML = "";
});

describe("styles.css — un bouton désactivé se VOIT désactivé", () => {
  // Le preflight de Tailwind v4 pose `opacity: 1` sur tout bouton désactivé
  // (« consistent opacity ») et `.btn` impose sa couleur d'encre et le
  // curseur-main : sans règle `:disabled`, « Exécuter » avant la frappe
  // SUPPRIMER, « Précédente » en page 1 ou « Lancer l'analyse » pendant un
  // scan étaient IDENTIQUES à des boutons actifs — un clic qui ne fait rien,
  // sans que rien ne l'annonce.
  it("un .btn désactivé est estompé et perd le curseur-main ; actif, il les garde", () => {
    injecterRegles(".btn", ".btn:disabled");
    document.body.innerHTML = '<button class="btn" disabled>a</button><button class="btn">b</button>';
    const [inerte, actif] = [...document.querySelectorAll("button")];
    expect(getComputedStyle(inerte!).opacity).toBe("0.4");
    expect(getComputedStyle(inerte!).cursor).toBe("default");
    // Témoin : la règle ne frappe pas un bouton actif.
    expect(getComputedStyle(actif!).opacity).not.toBe("0.4");
    expect(getComputedStyle(actif!).cursor).toBe("pointer");
  });
});

// Luminance relative WCAG d'une couleur #RRGGBB.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const contraste = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
/** Les jetons d'un bloc (`@theme {…}` ou `.dark {…}`) : nom → #hex. */
function jetons(bloc: string): Record<string, string> {
  const m = source.match(new RegExp(bloc.replace(/[.@]/g, "\\$&") + "\\s*\\{([^}]*)\\}"));
  if (!m) throw new Error(`bloc introuvable : ${bloc}`);
  return Object.fromEntries([...m[1]!.matchAll(/(--color-app[\w-]*):\s*(#[0-9A-Fa-f]{6})/g)].map((x) => [x[1], x[2]]));
}

describe("styles.css — le filet « vérification impossible » tient 3:1", () => {
  // WCAG 1.4.11 : un indicateur graphique porteur de sens tient 3:1 contre
  // ce qui l'entoure. Le filet `unsure` (pointillé 1 px / 2 px, §5) mesurait
  // 2,82:1 sur le panneau et 2,46:1 sur une ligne SÉLECTIONNÉE en clair —
  // le seul des trois diagnostics qu'on ne voyait pas, alors que sa forme
  // (le plus fin des motifs) l'affaiblit déjà.
  for (const [theme, bloc] of [["clair", "@theme"], ["sombre", ".dark"]] as const) {
    it(`thème ${theme} : unsure ≥ 3:1 sur app, panel, sel et hover`, () => {
      const j = jetons(bloc);
      const unsure = j["--color-app-unsure"]!;
      for (const fond of ["--color-app", "--color-app-panel", "--color-app-sel", "--color-app-hover"]) {
        expect(contraste(unsure, j[fond]!), `${fond} ${j[fond]}`).toBeGreaterThanOrEqual(3);
      }
    });
  }
});

describe("styles.css — les primitives se laissent AJUSTER par un utilitaire", () => {
  // Tailwind v4 range ses utilitaires dans `@layer utilities` ; une règle
  // HORS couche l'emporte sur toute règle en couche, quelle que soit sa
  // spécificité. `.btn` et `.input` écrits hors couche écrasaient donc
  // `h-[38px] bg-app-sel px-4` (« Exécuter » de la Revue, mesuré à 28 px sur
  // fond transparent dans Chromium), le rouge `border-app-broken
  // text-app-broken` et la bordure rouge du champ SUPPRIMER.
  /** Le nom de la couche qui ENGLOBE la première règle `sel {`, ou null. */
  // Commentaires blanchis à longueur égale : un `{` cité dans un commentaire
  // fausserait la pile, et les index doivent rester ceux de la source.
  const sansCommentaires = source.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
  function coucheDe(sel: string): string | null {
    const i = sansCommentaires.search(new RegExp("(^|\\})\\s*" + sel.replace(/[.:]/g, "\\$&") + "\\s*\\{", "m"));
    if (i < 0) throw new Error(`règle introuvable : ${sel}`);
    const pile: (string | null)[] = [];
    for (const m of sansCommentaires.slice(0, i).matchAll(/@layer\s+([\w-]+)\s*\{|\{|\}/g)) {
      if (m[0].startsWith("@layer")) pile.push(m[1]!);
      else if (m[0] === "{") pile.push(null);
      else pile.pop();
    }
    return pile.filter((x) => x !== null).at(-1) ?? null;
  }
  for (const sel of [".btn", ".btn-icone", ".btn:hover", ".btn:disabled", ".input", ".input:focus", ".panel"]) {
    it(`${sel} vit dans @layer components`, () => {
      expect(coucheDe(sel)).toBe("components");
    });
  }
});
