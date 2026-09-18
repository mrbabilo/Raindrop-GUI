import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { repertoireTemporaire } from "../testing/tmp.js";
import { lireManifeste, ecrireManifeste, aConserver, dernierValide } from "./manifeste.js";

const dir = () => repertoireTemporaire("backup-manifeste-");

describe("manifeste", () => {
  it("un dossier vierge rend un manifeste vide, pas une erreur", async () => {
    expect(await lireManifeste(join(dir(), "neuf"))).toEqual({ version: 1, instantanes: [] });
  });

  it("l'écriture est atomique — aucun fichier temporaire ne survit", async () => {
    const d = join(dir(), "atomique");
    await ecrireManifeste(d, { version: 1, instantanes: [] });
    const fichiers = await readdir(d);
    expect(fichiers).toEqual(["manifest.json"]);
  });

  it("un instantané incomplet n'est jamais le dernier valide", () => {
    const m = {
      version: 1 as const,
      instantanes: [
        { horodatage: "2026-09-01T10-00-00", complet: true, count: 10, watermark: "w1", empreintes: {} },
        { horodatage: "2026-09-02T10-00-00", complet: false, count: 9, watermark: "w2", empreintes: {} },
      ],
    };
    expect(dernierValide(m)?.horodatage).toBe("2026-09-01T10-00-00");
  });
});

describe("rotation", () => {
  const j = (n: number) => `2026-09-${String(n).padStart(2, "0")}T10-00-00`;

  it("garde les sept derniers", () => {
    const tous = Array.from({ length: 10 }, (_, i) => j(i + 10));
    const gardes = aConserver(tous, new Date("2026-09-19T12:00:00Z"));
    expect(gardes).toEqual(expect.arrayContaining(tous.slice(-7)));
    // Sans cette assertion d'absence, le test passerait avec une rotation qui
    // ne purge RIEN : il ne vérifiait que des présences.
    expect(gardes).not.toContain(j(11));
  });

  // §5.5 : la promotion se calcule à partir des instantanés PRÉSENTS. Une
  // semaine sans instantané reste vide — rien n'est fabriqué, rien n'est
  // purgé à tort.
  it("des semaines sans instantané ne font rien perdre", () => {
    const tous = ["2026-08-03T10-00-00", "2026-09-14T10-00-00", "2026-09-15T10-00-00"];
    const gardes = aConserver(tous, new Date("2026-09-15T12:00:00Z"));
    expect(gardes).toEqual(expect.arrayContaining(tous));
  });

  it("le plus ancien de chaque semaine précédente échappe à la purge", () => {
    const tous = [
      "2026-08-24T10-00-00", "2026-08-26T10-00-00",          // semaine A
      "2026-08-31T10-00-00",                                   // semaine B
      ...Array.from({ length: 8 }, (_, i) => j(i + 8)),        // les récents
    ];
    const gardes = aConserver(tous, new Date("2026-09-16T12:00:00Z"));
    expect(gardes).toContain("2026-08-24T10-00-00");   // le plus ancien de A
    expect(gardes).not.toContain("2026-08-26T10-00-00"); // pas le second de A
    expect(gardes).toContain("2026-08-31T10-00-00");
  });
});
