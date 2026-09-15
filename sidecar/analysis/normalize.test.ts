import { describe, it, expect } from "vitest";
import { normalizeUrl, fuzzyKey } from "./normalize.js";

describe("normalizeUrl", () => {
  it("unifie http→https, retire slash final et fragment", () => {
    expect(normalizeUrl("http://Example.com/a/#section")).toBe("https://example.com/a");
  });

  it("retire les paramètres de tracking et trie le reste", () => {
    expect(normalizeUrl("https://example.com/p?b=2&utm_source=x&a=1&utm_campaign=y")).toBe(
      "https://example.com/p?a=1&b=2",
    );
  });

  it("retire fbclid/gclid et garde la racine telle quelle", () => {
    expect(normalizeUrl("https://example.com/?fbclid=abc")).toBe("https://example.com");
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com");
  });

  it("ne touche pas localhost et gère les URLs imparsables", () => {
    expect(normalizeUrl("http://localhost:5173/a")).toBe("http://localhost:5173/a");
    expect(normalizeUrl("   pas une url ")).toBe("pas une url");
  });

  it("deux URLs de doublons connus convergent", () => {
    expect(normalizeUrl("http://example.com/page-0")).toBe(normalizeUrl("https://example.com/page-0/"));
  });
});

describe("fuzzyKey", () => {
  it("identique à casse/accents/ponctuation près", () => {
    expect(fuzzyKey("Example.com", "Le Guide de l'API !")).toBe(fuzzyKey("example.com", "le guide de lapi"));
  });
});
