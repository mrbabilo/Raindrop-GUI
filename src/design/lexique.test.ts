import { describe, it, expect } from "vitest";
import * as lexique from "./lexique";
import { thematique, teinte, THEMATIQUES } from "./lexique";

// DESIGN.md §3 : la teinte vient de ce qu'un mot SIGNIFIE. Ce fichier couvre
// les quatre comportements qui comptent — casse, normalisation, gris hors
// lexique, et le fait qu'une thématique ne porte QUE de la teinte.
describe("lexique — thematique()", () => {
  it("est insensible à la casse", () => {
    expect(thematique("Python")).toBe("technique");
    expect(thematique("PYTHON")).toBe("technique");
    expect(thematique("python")).toBe("technique");
  });

  it("normalise accents et séparateurs avant de chercher", () => {
    expect(thematique("Typographie")).toBe("création");
    // `-`/`_` → espace, puis repli sur la forme recollée : « typo graphie »
    // ne doit pas manquer « typographie ».
    expect(thematique("typo-graphie")).toBe("création");
    expect(thematique("typo_graphie")).toBe("création");
    expect(thematique("web-design")).toBe("création");
    // Le nom de la thématique est lui-même un mot du lexique.
    expect(thematique("créATION")).toBe("création");
    // Mot-clé accenté DANS le lexique : la clé est normalisée à la
    // construction, sinon « hotel » ne trouverait jamais « hôtel ».
    expect(thematique("hotel")).toBe("lieux");
    expect(thematique("Hôtel")).toBe("lieux");
    expect(thematique("  Recette  ")).toBe("maison");
  });

  it("rend null hors lexique — le gris est le résultat attendu (§3)", () => {
    expect(thematique("zzz-inconnu")).toBeNull();
    expect(thematique("")).toBeNull();
    expect(thematique(undefined)).toBeNull();
    expect(teinte(null)).toBeNull();
    expect(teinte(thematique("zzz-inconnu"))).toBeNull();
  });
});

describe("lexique — teinte()", () => {
  it("ne rend qu'une teinte H : aucune clarté ni chroma par thématique (§3)", () => {
    // Surface d'export verrouillée : rien qui exposerait un L ou un C par
    // thématique ne peut apparaître ici sans casser ce test.
    expect(Object.keys(lexique).sort()).toEqual(["THEMATIQUES", "teinte", "thematique"]);
    for (const t of THEMATIQUES) {
      const h = teinte(t);
      expect(typeof h).toBe("number"); // un nombre nu, pas un objet {l, c, h}
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });

  it("les huit thématiques de §3 ont huit teintes distinctes", () => {
    expect(THEMATIQUES).toHaveLength(8);
    const teintes = THEMATIQUES.map((t) => teinte(t));
    expect(new Set(teintes).size).toBe(8);
    expect(teinte("technique")).toBe(250);
    expect(teinte("création")).toBe(300);
    expect(teinte("argent")).toBe(150);
    expect(teinte("maison")).toBe(62);
    expect(teinte("santé")).toBe(25);
    expect(teinte("lieux")).toBe(195);
    expect(teinte("culture")).toBe(345);
    expect(teinte("méthode")).toBe(120);
  });
});
