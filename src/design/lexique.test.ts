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

  it("les thématiques de §3 ont chacune une teinte, toutes distinctes", () => {
    // Neuf depuis l'ajout d'`éducation` (2026-09-19). Le compte est assené
    // ici pour qu'une dixième ne s'ajoute pas sans qu'on ait revu l'écart
    // des teintes sur le cercle — c'est lui qui se resserre à chaque fois.
    expect(THEMATIQUES).toHaveLength(9);
    const teintes = THEMATIQUES.map((t) => teinte(t));
    expect(new Set(teintes).size).toBe(9);
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

// Le pluriel : de l'ORTHOGRAPHE, pas de la sémantique. Un pluriel signifie
// exactement ce que signifie son singulier — le §3 n'y perd rien. Sans cette
// règle, 92 % des étiquettes réelles d'une bibliothèque de 12 210 signets
// sortaient grises, dont « livres », « images » et « achats » alors que leurs
// singuliers étaient au lexique depuis le début.
describe("lexique — le pluriel", () => {
  it("retrouve le singulier d'un mot simple", () => {
    expect(thematique("livres")).toBe(thematique("livre"));
    expect(thematique("achats")).toBe("argent");
    expect(thematique("outils")).toBe("méthode");
  });

  it("accorde TOUS les mots d'un groupe, pas seulement un", () => {
    // « jeux vidéos » porte la marque deux fois : n'en retirer qu'une ne
    // retrouve ni « jeu vidéos » ni « jeux vidéo ».
    expect(thematique("jeux-vidéos")).toBe("culture");
    expect(thematique("bons-plans")).toBe("argent");
  });

  it("épargne les mots courts dont le `s` appartient au radical", () => {
    // « os » ne doit pas devenir « o ». Il est au lexique tel quel.
    expect(thematique("os")).toBe("technique");
  });

  it("n'invente pas une thématique pour un mot inconnu", () => {
    expect(thematique("xyzzys")).toBeNull();
  });
});

// Neuvième thématique (2026-09-19) : une bibliothèque d'enseignant range des
// dizaines d'étiquettes qu'aucune des huit autres ne décrivait sans la trahir.
describe("lexique — éducation", () => {
  it("range le vocabulaire scolaire", () => {
    for (const mot of ["école-primaire", "collège", "lycée", "maths", "svt", "exercices", "annales"]) {
      expect(thematique(mot), mot).toBe("éducation");
    }
  });

  it("porte une teinte à elle, distincte de ses voisines", () => {
    const h = teinte("éducation");
    expect(h).not.toBeNull();
    // Voisines sur le cercle : maison (62) et méthode (120).
    expect(h).not.toBe(teinte("maison"));
    expect(h).not.toBe(teinte("méthode"));
  });
});

// Le gris n'est pas un échec : il DÉSIGNE. Des étiquettes personnelles ou de
// tri courant n'ont pas de thématique, et leur en inventer une cacherait
// justement ce qu'il faut voir.
describe("lexique — ce qui reste gris à dessein", () => {
  it("laisse gris les marqueurs de tri et les noms propres", () => {
    for (const mot of ["à-trier", "à-lire", "à-voir", "babilosapiens"]) {
      expect(thematique(mot), mot).toBeNull();
    }
  });
});
