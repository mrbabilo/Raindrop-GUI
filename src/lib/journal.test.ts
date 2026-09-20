import { describe, it, expect } from "vitest";
import { formatterEntree } from "./journal";

describe("formatterEntree", () => {
  it("heure locale · message · champs en k=v", () => {
    const s = formatterEntree({ ts: "2026-09-20T10:05:06Z", level: "info", msg: "corbeille", id: 12, from: 42 });
    // L'heure est LOCALE (c'est le but) : le test porte sur le FORMAT, pas
    // sur une valeur dépendante du fuseau de la machine.
    expect(s).toMatch(/^\d{2}:\d{2}:\d{2} · corbeille · id=12 · from=42$/);
  });

  it("les champs objet et tableau passent en JSON compact", () => {
    const s = formatterEntree({ ts: "2026-09-20T10:05:06Z", msg: "job terminé", resultat: { corbeille: 2 } });
    expect(s).toContain("resultat={\"corbeille\":2}");
  });

  it("sans champ : heure · message", () => {
    expect(formatterEntree({ ts: "2026-09-20T10:05:06Z", msg: "démarrage" })).toMatch(/^\d{2}:\d{2}:\d{2} · démarrage$/);
  });

  it("un ts illisible se rend TEL QUEL, jamais « Invalid Date »", () => {
    const s = formatterEntree({ ts: "pas-une-date", msg: "corbeille" });
    expect(s).toBe("pas-une-date · corbeille");
  });
});
