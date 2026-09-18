import { describe, it, expect } from "vitest";
import { fr, t } from "./fr";

describe("accord en nombre", () => {
  // Règle française, et c'est là qu'elle diffère de l'anglais : le singulier
  // vaut pour 0 comme pour 1. « 1 instantanés conservés » était le défaut
  // d'origine, vu à l'écran sur une première sauvegarde.
  it("le singulier vaut pour 0 ET pour 1, le pluriel à partir de 2", () => {
    expect(t("sauvegarde.instantanes", { n: 0 })).toBe("0 instantané conservé");
    expect(t("sauvegarde.instantanes", { n: 1 })).toBe("1 instantané conservé");
    expect(t("sauvegarde.instantanes", { n: 2 })).toBe("2 instantanés conservés");
  });

  it("les autres variables s'interpolent dans la forme choisie", () => {
    expect(t("sauvegarde.archives", { n: 1, volume: "3 Mo" })).toBe("1 copie archivée (3 Mo)");
    expect(t("sauvegarde.archives", { n: 7, volume: "3 Mo" })).toBe("7 copies archivées (3 Mo)");
  });

  // Une chaîne à DEUX comptes : `n` porte l'accord, l'autre nombre garde son
  // propre affichage — ici le séparateur de milliers.
  it("deux nombres dans la même chaîne : seul `n` porte l'accord", () => {
    const un = t("sauvegarde.premiere", { n: 1, duree: "environ 4 s", requetes: 5, signets: "1" });
    expect(un).toContain("pour 1 signet.");
    expect(un).not.toContain("signets");
    const beaucoup = t("sauvegarde.premiere", {
      n: 12210, duree: "environ 3 min", requetes: 249, signets: "12 210",
    });
    expect(beaucoup).toContain("pour 12 210 signets.");
  });

  it("une clé sans deux formes est rendue telle quelle", () => {
    expect(t("state.retry")).toBe("Réessayer");
    expect(t("cleanup.page", { n: 2, total: 5 })).toBe("Page 2/5");
  });

  // Sans ce repli, une clé à deux formes appelée sans `n` afficherait la
  // chaîne entière, séparateur compris.
  it("`n` absent sur une clé à deux formes : le singulier, jamais le brut", () => {
    expect(t("drag.count")).toBe("{n} signet");
  });
});

describe("le dictionnaire lui-même", () => {
  // Le séparateur d'accord est structurel : une valeur qui en porte deux
  // rendrait une forme tronquée, sans que rien ne le signale.
  it("aucune valeur ne porte plus d'un séparateur", () => {
    for (const [cle, valeur] of Object.entries(fr)) {
      expect(valeur.split("|").length, `clé ${cle}`).toBeLessThanOrEqual(2);
    }
  });
});
