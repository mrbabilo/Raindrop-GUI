import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { writeFile, readFile } from "node:fs/promises";
import { repertoireTemporaire } from "../testing/tmp.js";
import { ouvrirJsonl, sha256Fichier, verifierJsonl, horodatage } from "./instantane.js";

const dir = () => repertoireTemporaire("backup-instantane-");

describe("instantané", () => {
  it("écrit une ligne par objet, et rend le compte et l'empreinte", async () => {
    const f = join(dir(), "r.jsonl");
    const e = await ouvrirJsonl(f);
    await e.ligne({ _id: 1, titre: "un" });
    await e.ligne({ _id: 2, titre: "deux" });
    const { lignes, sha256 } = await e.fermer();
    expect(lignes).toBe(2);
    expect(sha256).toMatch(/^[0-9a-f]{64}$/);
    const brut = await readFile(f, "utf8");
    expect(brut.trimEnd().split("\n")).toHaveLength(2);
    expect(JSON.parse(brut.split("\n")[0]!)).toEqual({ _id: 1, titre: "un" });
    expect(await sha256Fichier(f)).toBe(sha256);
  });

  // Le contrat que §6 exige : ce qui a été écrit est relu, tout de suite.
  it("un fichier intact est vérifié bon", async () => {
    const f = join(dir(), "ok.jsonl");
    const e = await ouvrirJsonl(f);
    await e.ligne({ a: 1 });
    const attendu = await e.fermer();
    expect(await verifierJsonl(f, attendu)).toMatchObject({ ok: true, lignes: 1 });
  });

  it("une ligne tronquée est détectée, pas avalée", async () => {
    const f = join(dir(), "tronque.jsonl");
    const e = await ouvrirJsonl(f);
    await e.ligne({ a: 1 });
    const attendu = await e.fermer();
    await writeFile(f, '{"a": 1}\n{"b": ', "utf8");
    const v = await verifierJsonl(f, attendu);
    expect(v.ok).toBe(false);
    expect(v.raison).toMatch(/ligne 2/);
  });

  it("une empreinte qui ne correspond plus est détectée", async () => {
    const f = join(dir(), "altere.jsonl");
    const e = await ouvrirJsonl(f);
    await e.ligne({ a: 1 });
    const attendu = await e.fermer();
    await writeFile(f, '{"a": 2}\n', "utf8");   // même nombre de lignes, JSON valide
    const v = await verifierJsonl(f, attendu);
    expect(v.ok).toBe(false);
    expect(v.raison).toMatch(/empreinte/);
  });

  it("un rejeu réécrit le fichier, pas en append", async () => {
    // Les Tasks 4/5 rejouent un balayage en réécrivant le MÊME chemin.
    const f = join(dir(), "rejeu.jsonl");

    // Premier balayage
    let e = await ouvrirJsonl(f);
    await e.ligne({ version: 1, data: "premier" });
    let attendu = await e.fermer();

    // Vérification que c'est écrit. (Deux `toMatch(/version/)` et `toMatch(/1/)`
    // vivaient ici : vraies quoi qu'il arrive, elles ne pouvaient rien
    // contredire. Ce qui distingue vraiment le premier passage du rejeu, c'est
    // le CONTENU de la ligne.)
    expect(attendu.lignes).toBe(1);
    let brut = await readFile(f, "utf8");
    expect(JSON.parse(brut.trimEnd())).toEqual({ version: 1, data: "premier" });

    // Rejeu : réouvre le MÊME chemin
    e = await ouvrirJsonl(f);
    await e.ligne({ version: 2, data: "rejeu" });
    const rejeu = await e.fermer();

    // Vérification que l'ancien contenu a disparu
    expect(rejeu.lignes).toBe(1);  // pas 2
    brut = await readFile(f, "utf8");
    expect(brut).not.toContain('"version":1');  // ancien contenu parti
    expect(brut).toContain('"version":2');  // nouveau contenu présent

    // verifierJsonl aussi doit voir juste 1 ligne
    const v = await verifierJsonl(f, rejeu);
    expect(v.ok).toBe(true);
    expect(v.lignes).toBe(1);
  });

  it("l'horodatage est utilisable comme nom de dossier", () => {
    expect(horodatage(new Date("2026-09-16T15:30:00Z"))).toBe("2026-09-16T15-30-00");
  });
});
