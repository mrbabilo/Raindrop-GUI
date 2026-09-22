// src/lib/lisibilite.test.ts
import { describe, it, expect } from "vitest";
import { lisibilite } from "./lisibilite";
import { raindrop } from "../test/fixtures";

// La règle du clic ET du bouton « Lire » (spec inversion §3) — extraite de
// ActionsLecture pour n'exister qu'UNE fois. Table des cas, dans l'ordre où
// la fonction les juge : archive locale, archivage en vol, copie prête,
// copie en échec, rien du tout.
describe("lisibilite", () => {
  it("archive locale : lisible, source locale", () => {
    expect(lisibilite(raindrop({ id: 1 }), true, false)).toEqual({ lisible: true, source: "locale" });
  });
  it("archive locale gagne même si un archivage est en vol", () => {
    expect(lisibilite(raindrop({ id: 1 }), true, true)).toEqual({ lisible: true, source: "locale" });
  });
  it("copie prête : lisible, source copie (téléchargement à la demande)", () => {
    expect(lisibilite(raindrop({ id: 1, cache: { status: "ready" } }), false, false))
      .toEqual({ lisible: true, source: "copie" });
  });
  it("archivage en vol : non lisible — la lecture échouerait, il n'y a pas d'archive", () => {
    expect(lisibilite(raindrop({ id: 1, cache: { status: "ready" } }), false, true))
      .toEqual({ lisible: false, motif: "enVol" });
  });
  it("copie en échec : non lisible, motif copieEchec", () => {
    expect(lisibilite(raindrop({ id: 1, cache: { status: "failed" } }), false, false))
      .toEqual({ lisible: false, motif: "copieEchec" });
  });
  it("rien du tout : non lisible, motif sansCopie", () => {
    expect(lisibilite(raindrop({ id: 1, cache: null }), false, false))
      .toEqual({ lisible: false, motif: "sansCopie" });
  });
});
