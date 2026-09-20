import { describe, it, expect } from "vitest";
import { domaineRecherche, composerRecherche, etiquettesRecherche } from "./recherche.js";

// Sondes réelles du 2026-09-17 qui fondent ces contrats (API Raindrop,
// GET /raindrops/0?search=…, lecture seule) :
//   domain:youtube.com            → 64      domain:youtube          → 0
//   domain:"youtube.com"          → 64      domain:YouTube.com      → 0
//   domain:"www.youtube.com"      → 0       domain:"https://…"      → 0
//   domain:"www.futura-sciences.com" → 0    domain:"futura-…"       → 13
// Autrement dit : domaine EXACT, en minuscules, sans www ni schéma — toute
// autre forme rend 0 SANS erreur, c'est-à-dire un écran vide inexplicable.
describe("domaineRecherche", () => {
  it("rend le domaine tel quel quand il est déjà propre", () => {
    expect(domaineRecherche("youtube.com")).toBe("youtube.com");
  });

  it("minuscule la saisie — Raindrop est sensible à la casse", () => {
    expect(domaineRecherche("YouTube.COM")).toBe("youtube.com");
  });

  it("retire le schéma, le www et le chemin d'une URL collée", () => {
    expect(domaineRecherche("https://www.youtube.com/watch?v=abc")).toBe("youtube.com");
    expect(domaineRecherche("http://example.org/")).toBe("example.org");
    expect(domaineRecherche("www.futura-sciences.com")).toBe("futura-sciences.com");
  });

  it("rend undefined pour une saisie vide ou blanche — rien à composer", () => {
    expect(domaineRecherche("")).toBeUndefined();
    expect(domaineRecherche("   ")).toBeUndefined();
    expect(domaineRecherche(undefined)).toBeUndefined();
  });

  it("retire les guillemets, qui casseraient le terme composé", () => {
    expect(domaineRecherche('you"tube.com')).toBe("youtube.com");
  });
});

describe("composerRecherche", () => {
  it("sans domaine, la recherche passe inchangée", () => {
    expect(composerRecherche("rust", undefined)).toBe("rust");
    expect(composerRecherche(undefined, undefined)).toBeUndefined();
  });

  it("sans recherche, le domaine devient le seul terme", () => {
    expect(composerRecherche(undefined, "youtube.com")).toBe('domain:"youtube.com"');
  });

  // Vérifié en réel : les termes s'INTERSECTENT (et ne s'unissent pas).
  //   #webdesign → 1713, domain:youtube.com → 64,
  //   « #webdesign domain:youtube.com » → 1.
  it("compose par une espace — les termes s'intersectent (vérifié en réel)", () => {
    expect(composerRecherche("rust", "youtube.com")).toBe('rust domain:"youtube.com"');
    expect(composerRecherche("#webdesign", "youtube.com")).toBe('#webdesign domain:"youtube.com"');
  });

  it("une saisie de domaine inutilisable ne pollue pas la recherche", () => {
    expect(composerRecherche("rust", "  ")).toBe("rust");
  });
});

// Sondes réelles du 2026-09-19 qui fondent ces contrats (mêmes conditions,
// lecture seule) :
//   #webdesign → 1713   #code → 886   #webdesign #code → 113
//   #webdesign #code #wordpress → 1   #WEBDESIGN → 1713 (casse ignorée)
//   #"webdesign" → 1713   #"webdesign" #"code" → 113 (guillemets transparents)
//   #webdesign OR #code → 60 (« OR » lu comme un mot : pas d'union)
//   tag:webdesign → 0   #webdes → 0 (pas de préfixe)
describe("etiquettesRecherche", () => {
  it("rend un terme #\"…\" par étiquette, guillemets compris", () => {
    expect(etiquettesRecherche(["webdesign", "code"])).toEqual(['#"webdesign"', '#"code"']);
  });

  it("les guillemets protègent l'étiquette qui porte un espace", () => {
    // Aucune n'en porte dans la bibliothèque sondée (0 sur 1 200) — un
    // renommage en fabrique une, et sans guillemets `#machine learning`
    // deviendrait « étiquette machine » ET « texte learning ».
    expect(etiquettesRecherche(["machine learning"])).toEqual(['#"machine learning"']);
  });

  it("dédoublonne SANS ÉGARD À LA CASSE — le filtre l'ignore (mesuré)", () => {
    expect(etiquettesRecherche(["Code", "code", "CODE"])).toEqual(['#"Code"']);
  });

  it("ignore le vide et le blanc — un #\"\" ne filtrerait rien de nommable", () => {
    expect(etiquettesRecherche(["", "   ", "code"])).toEqual(['#"code"']);
    expect(etiquettesRecherche(undefined)).toEqual([]);
    expect(etiquettesRecherche([])).toEqual([]);
  });

  it("retire le guillemet interne, qui refermerait le terme", () => {
    // `#"a"b"` ferait lire `b"` comme du texte libre : un filtre autre que
    // celui demandé, sans la moindre erreur.
    expect(etiquettesRecherche(['a"b'])).toEqual(['#"ab"']);
  });
});

describe("composerRecherche — étiquettes", () => {
  it("compose DEUX étiquettes, pas seulement la dernière", () => {
    expect(composerRecherche(undefined, undefined, ["webdesign", "code"])).toBe(
      '#"webdesign" #"code"',
    );
  });

  it("les étiquettes s'ajoutent à la recherche ET au domaine", () => {
    expect(composerRecherche("rust", "youtube.com", ["code"])).toBe(
      'rust domain:"youtube.com" #"code"',
    );
  });

  it("aucune étiquette : la composition reste celle d'avant", () => {
    expect(composerRecherche("rust", undefined, [])).toBe("rust");
    expect(composerRecherche(undefined, undefined, [])).toBeUndefined();
  });
});

describe("composerRecherche — la nature", () => {
  // La nature de Raindrop ne se filtre QUE par l'opérateur `type:` dans la
  // recherche (l'API n'a pas de paramètre `media` — même schéma que
  // `domain`, dont le paramètre mort faisait flotter le filtre).
  it("la nature devient un terme type: qui s'intersecte avec le reste", () => {
    expect(composerRecherche(undefined, undefined, undefined, "article")).toBe("type:article");
    expect(composerRecherche("rust", undefined, undefined, "video")).toBe("rust type:video");
    expect(composerRecherche("rust", "youtube.com", ["code"], "video")).toBe(
      'rust domain:"youtube.com" #"code" type:video',
    );
  });
});
