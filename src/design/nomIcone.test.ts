import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { nomIcone } from "./nomIcone";

// DESIGN §9 : « une icône par geste », sans texte. À la souris, rien ne
// nommait alors un crayon, un marque-page ou un engrenage — l'aria-label ne
// sert que le lecteur d'écran. Chaque commande en icône seule porte donc
// aussi une INFOBULLE native (audit UX du 2026-09-23, proposition 1).
describe("nomIcone", () => {
  it("sans raccourci : `title` fait le nom ET l'infobulle — une seule source", () => {
    expect(nomIcone("Modifier")).toEqual({ title: "Modifier" });
  });

  it("avec raccourci : le nom reste nu, l'infobulle l'annonce", () => {
    expect(nomIcone("Réglages", "⌘,")).toEqual({ "aria-label": "Réglages", title: "Réglages (⌘,)" });
  });
});

// Garde de structure : une commande en icône seule (`btn-icone`, ou la
// constante `commande` de la TopBar) ne se nomme QUE par nomIcone — un
// `aria-label` nu remettrait un bouton sans infobulle.
describe("toute commande en icône seule a son infobulle", () => {
  const dossier = resolve(process.cwd(), "src/components");
  const sources = [
    ...readdirSync(dossier).filter((f) => f.endsWith(".tsx") && !f.includes(".test.")).map((f) => `${dossier}/${f}`),
    resolve(process.cwd(), "src/App.tsx"),
  ];
  /** Les balises ouvrantes de bouton, accolades JSX comprises. */
  function balises(src: string): string[] {
    const out: string[] = [];
    for (const m of src.matchAll(/<(button|ActionLigne)\b/g)) {
      let i = m.index! + m[0].length;
      let prof = 0;
      for (; i < src.length; i++) {
        if (src[i] === "{") prof++;
        else if (src[i] === "}") prof--;
        else if (src[i] === ">" && prof === 0) break;
      }
      out.push(src.slice(m.index, i));
    }
    return out;
  }
  it("aucune ne se nomme par un aria-label nu", () => {
    const fautifs: string[] = [];
    let vues = 0;
    for (const f of sources) {
      for (const b of balises(readFileSync(f, "utf8"))) {
        if (!/btn-icone|className=\{commande\}/.test(b)) continue;
        vues++;
        if (!b.includes("nomIcone(")) fautifs.push(`${f.split("/").pop()} : ${b.replace(/\s+/g, " ").slice(0, 90)}`);
      }
    }
    expect(fautifs).toEqual([]);
    expect(vues).toBeGreaterThan(20); // non-vacuité : le balayage voit bien les boutons
  });
});
