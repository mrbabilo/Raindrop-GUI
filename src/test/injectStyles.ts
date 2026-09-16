import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Vitest tourne avec `css: false` (vite.config.ts) : aucune feuille n'atteint
// jsdom, donc `getComputedStyle` ne voit jamais nos classes. Pour les rares
// assertions qui portent sur une DÉCLARATION (et non sur une couleur ou une
// géométrie, que jsdom ne calcule pas), on injecte les règles voulues **lues
// dans le vrai `src/styles.css`** — jamais recopiées dans le test, sinon
// l'assertion ne vérifierait que sa propre copie.
// Chemin depuis la racine du dépôt : sous Vite, `import.meta.url` n'est pas
// une URL `file:` et ne peut pas servir à lire le disque.
const source = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

/** Injecte les règles dont le sélecteur est exactement l'un de ceux demandés. */
export function injecterRegles(...selecteurs: string[]): HTMLStyleElement {
  const regles: string[] = [];
  for (const sel of selecteurs) {
    const m = source.match(new RegExp("(^|\\})\\s*" + sel.replace(".", "\\.") + "\\s*\\{([^}]*)\\}", "m"));
    if (!m) throw new Error(`règle introuvable dans src/styles.css : ${sel}`);
    regles.push(`${sel}{${m[2]}}`);
  }
  const style = document.createElement("style");
  style.textContent = regles.join("\n");
  document.head.appendChild(style);
  return style;
}
