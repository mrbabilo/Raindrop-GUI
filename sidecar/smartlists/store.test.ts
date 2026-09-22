import { describe, it, expect } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { makeSmartListStore } from "./store.js";
import { repertoireTemporaire } from "../testing/tmp.js";

// repertoireTemporaire rend une STRING (pas une fabrique) : un répertoire
// neuf par appel, chaque test isole son fichier.
const depot = () => join(repertoireTemporaire("smartlists-"), "smartlists.json");
const vue = { collectionId: 0, tags: ["rust"] };

describe("SmartListStore", () => {
  it("crée : id généré par le store (préfixe sl-), date posée, list() le rend", async () => {
    const store = makeSmartListStore({ file: depot() });
    const sl = await store.add({ label: "Rust", vue });
    expect(sl.id).toMatch(/^sl-/);
    expect(sl.cree).not.toBe("");
    expect(sl.label).toBe("Rust");
    const items = await store.list();
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe(sl.id);
  });

  it("deux créations donnent deux identifiants distincts, l'ordre est celui de la création", async () => {
    const store = makeSmartListStore({ file: depot() });
    const a = await store.add({ label: "A", vue });
    const b = await store.add({ label: "B", vue });
    expect(a.id).not.toBe(b.id);
    const items = await store.list();
    expect(items.map((s) => s.label)).toEqual(["A", "B"]);
  });

  it("renomme (les autres champs intacts) ; id inconnu → null", async () => {
    const store = makeSmartListStore({ file: depot() });
    const sl = await store.add({ label: "Rust", vue });
    const maj = await store.rename(sl.id, "Rust web");
    expect(maj).toMatchObject({ id: sl.id, label: "Rust web" });
    expect((await store.list())[0]!.vue).toEqual(vue);
    expect(await store.rename("sl-inconnu", "x")).toBeNull();
  });

  it("supprime ; id inconnu → false", async () => {
    const store = makeSmartListStore({ file: depot() });
    const sl = await store.add({ label: "Rust", vue });
    expect(await store.remove(sl.id)).toBe(true);
    expect(await store.list()).toEqual([]);
    expect(await store.remove(sl.id)).toBe(false);
  });

  // Le patron du dépôt (spec §3, §5 d'origins.ts) : absent ou corrompu =
  // liste vide — l'app ne casse pas, la section barre latérale dit son état.
  it("fichier illisible → liste vide", async () => {
    const file = depot();
    await writeFile(file, "{ pas du json", "utf8");
    const store = makeSmartListStore({ file });
    expect(await store.list()).toEqual([]);
  });

  it("persiste réellement : un second store sur le même fichier lit les vues du premier", async () => {
    const file = depot();
    const premier = makeSmartListStore({ file });
    const sl = await premier.add({ label: "Rust", vue });
    const second = makeSmartListStore({ file });
    const items = await second.list();
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe(sl.id);
    // Et une écriture du second ne rejoue pas l'état du premier.
    await second.rename(sl.id, "Autre");
    expect((await premier.list())[0]!.label).toBe("Rust"); // instance mémoire inchangée
    expect((await makeSmartListStore({ file }).list())[0]!.label).toBe("Autre");
  });

  // Contrairement aux origines de corbeille (perte dégradée assumée), un
  // échec d'écriture ICI rejette : une création « réussie » mais non écrite
  // serait le succès inventé que le projet traque (défaut bulk -99).
  it("échec d'écriture → add rejette (jamais un succès inventé)", async () => {
    // Le répertoire parent n'existe pas : le writeFile du tmp échoue.
    const store = makeSmartListStore({ file: "/dev/null/impossible/smartlists.json" });
    await expect(store.add({ label: "X", vue })).rejects.toThrow();
  });
});
