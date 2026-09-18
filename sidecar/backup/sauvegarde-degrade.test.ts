//! Les états dégradés de la sauvegarde (spec §6) — la moitié du contrat qui
//! ne se voit jamais quand tout va bien : dossier disparu, empreinte qui ne
//! se vérifie plus, manifeste corrompu. Chacun doit basculer en balayage
//! complet, LE DIRE, et laisser l'instantané précédent intact.

import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startFauxApi, type FauxApi } from "../testing/apiServer.js";
import { repertoireTemporaire } from "../testing/tmp.js";
import { makeLecture } from "./lecture.js";
import { Throttle } from "../mcp/throttle.js";
import { makeSauvegarde } from "./sauvegarde.js";
import type { Manifeste } from "./manifeste.js";

let api: FauxApi | undefined;
afterEach(async () => {
  await api?.close();
  api = undefined;
});

const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    _id: 1000 + i,
    created: `2020-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    lastUpdate: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    title: `t${i}`,
  }));

const sauv = (
  a: FauxApi,
  dossier: string,
  extra: { maintenant?: () => Date; avertir?: (m: string, c?: Record<string, unknown>) => void } = {},
) =>
  makeSauvegarde({
    lecture: makeLecture({ token: "j", baseUrl: `http://127.0.0.1:${a.port}/rest/v1`, file: new Throttle(0) }),
    dossier,
    ...extra,
  });

const heure = (h: string) => () => new Date(`2026-09-18T${h}:00:00Z`);
describe("états dégradés", () => {
  // CONTRAT 4 — sans cette revérification, une corruption silencieuse se
  // propagerait de sauvegarde en sauvegarde : chaque incrémental bâtirait sur
  // le précédent corrompu, et la corruption deviendrait l'histoire.
  //
  // L'altération reste du JSONL VALIDE (un titre changé) : seule l'empreinte
  // la trahit. Tronquer le fichier ferait passer le test pour la mauvaise
  // raison — la fusion exploserait à l'analyse, sans rien prouver du contrôle.
  it("une empreinte qui ne se vérifie plus ne sert jamais de base", async () => {
    api = await startFauxApi(items(3));
    const dossier = repertoireTemporaire("degrade-empreinte-");
    const avertis: string[] = [];
    const s1 = await sauv(api, dossier, { maintenant: heure("10") }).executer("balayage");

    const fichier = join(dossier, s1.horodatage, "raindrops.jsonl");
    writeFileSync(fichier, readFileSync(fichier, "utf8").replace('"t0"', '"corrompu"'), "utf8");

    const avant = api.appels.length;
    const s2 = await sauv(api, dossier, {
      maintenant: heure("11"),
      avertir: (m) => avertis.push(m),
    }).executer("incremental");

    // (a) un balayage complet a bien eu lieu
    expect(api.appels.slice(avant).some((a) => a.includes("sort=created"))).toBe(true);
    // (b) le basculement est DIT, pas silencieux — au retour comme au journal
    expect(s2.bascule).toMatch(/empreinte|vérifie/i);
    expect(avertis.join(" | ")).toMatch(/complet/i);
    // Et la corruption ne s'est pas propagée dans le nouvel instantané.
    expect(readFileSync(join(dossier, s2.horodatage, "raindrops.jsonl"), "utf8")).not.toContain("corrompu");
    expect(s2.complet).toBe(true);
  });

  // CONTRAT 5 — disque externe débranché, fichier iCloud non téléchargé,
  // dossier renommé. Le manifeste désigne encore un instantané que le disque
  // n'a plus : ni la comparaison de compteurs ni l'incrémental ne sont
  // possibles. (Un dossier VIERGE ne prouverait rien : `doitBalayerComplet`
  // rendrait `true` de toute façon, faute de `dernierValide`.)
  it("l'instantané précédent a disparu du disque : on repart complet, et on le dit", async () => {
    api = await startFauxApi(items(3));
    const dossier = repertoireTemporaire("degrade-disparu-");
    const s1 = await sauv(api, dossier, { maintenant: heure("10") }).executer("balayage");
    rmSync(join(dossier, s1.horodatage), { recursive: true, force: true });

    const avant = api.appels.length;
    const s2 = await sauv(api, dossier, { maintenant: heure("11") }).executer("incremental");

    expect(api.appels.slice(avant).some((a) => a.includes("sort=created"))).toBe(true);
    expect(s2.bascule).toMatch(/complet/i);
    expect(s2.complet).toBe(true);
    // Le manifeste garde trace des deux : rien n'est effacé pour cacher la panne.
    const m = JSON.parse(readFileSync(join(dossier, "manifest.json"), "utf8")) as Manifeste;
    expect(m.instantanes.map((i) => i.horodatage)).toEqual([s1.horodatage, s2.horodatage]);
  });

  // Dette de la Task 6 : `lireManifeste(dossier, avertir)` distingue un
  // manifeste ABSENT (silence, premier lancement) d'un manifeste CORROMPU (à
  // signaler). Inerte tant que personne ne le branche — sinon la Task 6 a
  // construit un détecteur que rien n'écoute.
  it("un manifeste corrompu laisse une trace au journal ; un dossier vierge, non", async () => {
    api = await startFauxApi(items(1));
    const dossier = repertoireTemporaire("degrade-manifeste-");
    mkdirSync(dossier, { recursive: true });
    writeFileSync(join(dossier, "manifest.json"), "{ ceci n'est pas du json", "utf8");
    const avertis: string[] = [];
    await sauv(api, dossier, { avertir: (m) => avertis.push(m) }).statut();
    expect(avertis.join(" | ")).toMatch(/manifest\.json corrompu/);

    const vierge: string[] = [];
    await sauv(api, repertoireTemporaire("degrade-vierge-"), { avertir: (m) => vierge.push(m) }).statut();
    expect(vierge).toEqual([]);
  });


  it("le statut dit ce qu'il sait : dernier instantané valide et complétude", async () => {
    api = await startFauxApi(items(2));
    const dossier = repertoireTemporaire("degrade-statut-");
    const s1 = await sauv(api, dossier, { maintenant: heure("10") }).executer("balayage");
    const statut = await sauv(api, dossier).statut();
    expect(statut.actif).toBe(true);
    expect(statut.dossier).toBe(dossier);
    expect(statut.dernier?.horodatage).toBe(s1.horodatage);
    expect(statut.dernier?.complet).toBe(true);
    expect(statut.instantanes).toBe(1);
  });
});
