import { describe, it, expect, afterEach } from "vitest";
import { repertoireTemporaire } from "../testing/tmp.js";
import { startFauxApi, type FauxApi } from "../testing/apiServer.js";
import { makeLecture, ErreurHttpRaindrop, type Lecture } from "./lecture.js";
import { Throttle } from "../mcp/throttle.js";
import { makeSauvegarde } from "./sauvegarde.js";
import type { JobHandle } from "../jobs/store.js";

// Le CÂBLAGE de la reprise, pas son mécanisme (resilience.test.ts s'en
// charge). Sans ces deux tests, retirer `avecReprise` de `sauvegarde.ts`
// laisserait toute la suite au vert — la leçon du lot précédent, où rien ne
// couvrait le branchement de la réconciliation.

const dir = () => repertoireTemporaire("sauvegarde-reprise-");
let api: FauxApi | undefined;
afterEach(async () => { await api?.close(); api = undefined; });

const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    _id: 1000 + i,
    created: `2020-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    lastUpdate: "2026-01-01T00:00:00.000Z",
    title: `t${i}`,
  }));

const sauv = (a: FauxApi, dossier: string, extra: { dormir?: (ms: number) => Promise<void> } = {}) =>
  makeSauvegarde({
    lecture: makeLecture({ token: "j", baseUrl: `http://127.0.0.1:${a.port}/rest/v1`, file: new Throttle(0) }),
    dossier,
    ...extra,
  });

/** Un job minimal : ce que `sauvegarde.ts` lui demande, et rien de plus. */
const job = (annule: () => boolean): JobHandle =>
  ({ progress: () => undefined, isCancelled: annule }) as unknown as JobHandle;

describe("la sauvegarde reprend en vol", () => {
  it("un 429 en cours de balayage ne fait plus perdre le travail déjà fait", async () => {
    api = await startFauxApi(items(3));
    const dossier = dir();
    let dodos = 0;
    // Le 429 tombe sur la PREMIÈRE requête de liste, c'est-à-dire en plein
    // balayage. Avant ce lot, le job entier avortait : 2 min 20 à refaire sur
    // la bibliothèque réelle, pour un hoquet d'une seconde.
    api.repondre429(1);
    const r = await sauv(api, dossier, { dormir: async () => void dodos++ }).executer("balayage");
    expect(r.complet).toBe(true);
    expect(r.count).toBe(3);
    // Une pause a bien eu lieu : sans elle, ce test ne prouverait qu'un faux
    // serveur qui n'a jamais répondu 429.
    expect(dodos).toBeGreaterThan(0);
  });

  it("SANS la reprise, le même 429 avorte — contrôle négatif", async () => {
    // L'assertion ci-dessus ne vaut que si l'on montre que l'objet MENAÇAIT
    // vraiment. On refait donc le même geste avec une lecture nue, celle que
    // `makeSauvegarde` recevait avant d'être enveloppée.
    api = await startFauxApi(items(3));
    api.repondre429(1);
    const lecture = makeLecture({
      token: "j", baseUrl: `http://127.0.0.1:${api.port}/rest/v1`, file: new Throttle(0),
    });
    await expect(lecture.page(0, { sort: "created", page: 0 })).rejects.toThrow(/429/);
  });

  // DEUX chemins d'annulation, parce qu'il y a deux endroits où l'erreur peut
  // naître — et le premier lot n'en avait vu qu'un.
  it("annulé PENDANT le balayage : instantané incomplet, nommé, pas d'erreur", async () => {
    api = await startFauxApi(items(3));
    const dossier = dir();
    let annule = false;
    // Une lecture faite main : le relevé du watermark (`-lastUpdate`) réussit,
    // et c'est le BALAYAGE (`created`) qui bute. Le faux serveur ne sait pas
    // viser ainsi — son 429 tomberait sur la première requête, donc avant le
    // balayage, et ce test-ci ne testerait pas ce qu'il annonce.
    const lecture = {
      page: async (_c: number, o: { sort: string }) => {
        if (o.sort !== "created") return { count: 3, items: [{ lastUpdate: "2026-01-01T00:00:00.000Z" }] };
        throw new ErreurHttpRaindrop(429);
      },
      compteur: async () => 3,
      collections: async () => [],
      collectionsEnfants: async () => [],
      highlights: async () => ({ count: 0, items: [] }),
      user: async () => ({}),
    } as unknown as Lecture;
    const r = await makeSauvegarde({
      lecture, dossier, dormir: async () => { annule = true; },
    }).executer("balayage", job(() => annule));
    // La promesse ABOUTIT : qui vient de cliquer « annuler » n'a pas à lire un
    // message d'erreur. L'instantané est incomplet et le dit.
    expect(r.complet).toBe(false);
    expect(r.raison ?? "").toMatch(/annul/i);
  });

  it("annulé AVANT le balayage : l'échec porte le mot « annulée », pas « 429 »", async () => {
    // Le relevé du watermark précède le balayage : une reprise interrompue
    // par l'annulation y relance l'erreur en cours, hors de portée du filet
    // de `balayage.ts`. Rien à enregistrer — aucun dossier n'existe encore —
    // mais le motif doit être vrai.
    api = await startFauxApi(items(3));
    const dossier = dir();
    let annule = false;
    api.repondre429(99);
    const e = await sauv(api, dossier, { dormir: async () => { annule = true; } })
      .executer("balayage", job(() => annule))
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(Error);
    expect((e as Error).message).toBe("sauvegarde annulée");
    // Et le contrôle négatif : SANS annulation, le même 429 tenace remonte
    // bien comme un 429 — sinon ce test confondrait « nommé » et « masqué ».
    const e2 = await sauv(api, dir(), { dormir: async () => undefined })
      .executer("balayage")
      .catch((x: unknown) => x);
    expect((e2 as Error).message).toMatch(/429/);
  });
});
