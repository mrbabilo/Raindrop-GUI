import { describe, it, expect } from "vitest";
import { domaineRecherche, composerRecherche } from "./recherche.js";

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
