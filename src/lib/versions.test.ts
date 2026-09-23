import { describe, it, expect } from "vitest";
import { comparerVersion, estPlusRecente } from "./versions";

describe("comparerVersion", () => {
  // LE piège : une comparaison lexicale dirait pre.9 > pre.10 — nos
  // versions se suivent d'un numéro et dépasseront vite 9.
  it("compare les numéros de prérelease NUMÉRIQUEMENT", () => {
    expect(comparerVersion("0.1.0-pre.2", "0.1.0-pre.10")).toBeLessThan(0);
    expect(comparerVersion("0.1.0-pre.16", "0.1.0-pre.15")).toBeGreaterThan(0);
  });

  it("une release (sans suffixe) est plus récente que n'importe quelle prérelease", () => {
    expect(comparerVersion("0.1.0", "0.1.0-pre.16")).toBeGreaterThan(0);
    expect(estPlusRecente("0.1.0-pre.16", "0.1.0")).toBe(false);
  });

  it("majeur/mineur/patch avant le suffixe", () => {
    expect(comparerVersion("0.2.0-pre.1", "0.1.0-pre.99")).toBeGreaterThan(0);
    expect(comparerVersion("0.1.1-pre.1", "0.1.0-pre.99")).toBeGreaterThan(0);
  });

  it("égalité", () => {
    expect(comparerVersion("0.1.0-pre.16", "v0.1.0-pre.16")).toBe(0);
    // Deux RELEASES égales : l'infini des deux côtés faisait NaN.
    expect(comparerVersion("v0.1.0", "0.1.0")).toBe(0);
  });

  it("une version indécomparable n'est ni plus récente ni plus ancienne", () => {
    // Un tag GitHub mal formé ne doit pas fabriquer un badge faux : 0 = pas
    // de différence, l'écran n'affiche pas de mise à jour.
    expect(comparerVersion("pas-une-version", "0.1.0-pre.16")).toBe(0);
    expect(estPlusRecente("pas-une-version", "0.1.0-pre.16")).toBe(false);
  });

  it("estPlusRecente : le cas d'usage réel du panneau Version", () => {
    expect(estPlusRecente("v0.1.0-pre.16", "0.1.0-pre.15")).toBe(true);
    expect(estPlusRecente("0.1.0-pre.15", "0.1.0-pre.15")).toBe(false);
  });
});
