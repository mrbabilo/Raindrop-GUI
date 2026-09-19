import { describe, it, expect, afterEach } from "vitest";
import { startFauxApi, type FauxApi } from "../testing/apiServer.js";
import { makeLecture, ErreurHttpRaindrop, type Lecture } from "./lecture.js";
import { avecReprise, classer } from "./resilience.js";

let api: FauxApi | undefined;
afterEach(async () => {
  await api?.close();
  api = undefined;
});

const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ _id: 1000 + i, created: "2020-01-01T00:00:00.000Z", lastUpdate: "2026-01-01T00:00:00.000Z", title: `t${i}` }));

/** Une file espionne qui JOURNALISE l'entrée et la sortie du créneau. C'est
 *  elle qui rend observable « la pause vit hors de la file ». */
const fileEspionne = (journal: string[]) => ({
  run: async <T>(fn: () => Promise<T>): Promise<T> => {
    journal.push("créneau:entrée");
    try {
      return await fn();
    } finally {
      journal.push("créneau:sortie");
    }
  },
});

describe("classer — ce qui se retente, et ce qui ne se retente pas", () => {
  it("429 se retente au titre du quota", () => {
    expect(classer(new ErreurHttpRaindrop(429))).toBe("429");
  });

  it("un 5xx se retente : sur une LECTURE, le rejeu est sans effet de bord", () => {
    expect(classer(new ErreurHttpRaindrop(500))).toBe("reseau");
    expect(classer(new ErreurHttpRaindrop(503))).toBe("reseau");
  });

  it("401/403/404 ne se retentent PAS — ils ne guérissent pas en attendant", () => {
    // Il faut d'abord avoir montré que quelque chose se retente (ci-dessus),
    // sinon ce test célèbre un refus que rien n'accordait jamais.
    for (const s of [400, 401, 403, 404, 422]) expect(classer(new ErreurHttpRaindrop(s))).toBeNull();
  });

  it("ce qui n'est pas un statut HTTP est transitoire par nature", () => {
    expect(classer(new Error("fetch failed"))).toBe("reseau");
    expect(classer(new DOMException("aborted", "AbortError"))).toBe("reseau");
  });
});

describe("avecReprise — la reprise en vol", () => {
  it("un 429 isolé ne fait plus échouer la lecture", async () => {
    api = await startFauxApi(items(3));
    api.repondre429(1);
    const pauses: number[] = [];
    const lecture = avecReprise(
      makeLecture({ token: "j", baseUrl: `http://127.0.0.1:${api.port}/rest/v1`, file: { run: (f) => f() } }),
      { dormir: async () => undefined, avertir: (_m, c) => void pauses.push(Number(c?.pauseMs)) },
    );
    // AVANT : cet appel jetait, et 2 min 20 de balayage étaient à refaire.
    const p = await lecture.page(0, { sort: "created", page: 0 });
    expect(p.count).toBe(3);
    // Une reprise a bien eu lieu, et elle est DITE au journal : sans cette
    // trace, le succès ne distinguerait pas « repris » de « le faux serveur
    // n'a jamais répondu 429 ».
    expect(pauses).toEqual([4_000]);
  });

  it("LA PAUSE VIT HORS DU CRÉNEAU — sinon l'interface gèlerait pendant", async () => {
    // C'est le point qui distingue « le balayage survit au 429 » de
    // « l'interface se fige à chaque 429 » : attendre DANS le créneau
    // retiendrait la file séquentielle, et le rang interactif attendrait
    // derrière. L'ordre du journal le prouve sans mesurer un temps.
    api = await startFauxApi(items(1));
    api.repondre429(1);
    const journal: string[] = [];
    const lecture = avecReprise(
      makeLecture({ token: "j", baseUrl: `http://127.0.0.1:${api.port}/rest/v1`, file: fileEspionne(journal) }),
      { dormir: async () => void journal.push("pause") },
    );
    await lecture.page(0, { sort: "created", page: 0 });
    // Les tranches de pause se suivent : on les réduit à un seul « pause »,
    // c'est l'ORDRE qui porte la démonstration, pas leur nombre.
    const etapes = journal.filter((e, i) => e !== "pause" || journal[i - 1] !== "pause");
    expect(etapes).toEqual([
      "créneau:entrée", "créneau:sortie", // la tentative qui prend le 429 REND son créneau
      "pause",                            // …puis seulement on attend
      "créneau:entrée", "créneau:sortie", // et la suivante en redemande un
    ]);
  });

  it("épuisé, c'est l'erreur D'ORIGINE qui remonte, avec son statut", async () => {
    api = await startFauxApi(items(1));
    api.repondre429(99); // plus que le budget
    const pauses: number[] = [];
    const tranches: number[] = [];
    const lecture = avecReprise(
      makeLecture({ token: "j", baseUrl: `http://127.0.0.1:${api.port}/rest/v1`, file: { run: (f) => f() } }),
      {
        essais: 2,
        dormir: async (ms) => void tranches.push(ms),
        avertir: (_m, c) => void pauses.push(Number(c?.pauseMs)),
      },
    );
    const e = await lecture.page(0, { sort: "created", page: 0 }).catch((x) => x);
    expect(e).toBeInstanceOf(ErreurHttpRaindrop);
    expect((e as ErreurHttpRaindrop).status).toBe(429);
    // Deux essais supplémentaires = deux pauses, et elles ESCALADENT.
    expect(pauses).toEqual([4_000, 8_000]);
    // Dormies pour de vrai, et en TRANCHES : aucune attente indivisible ne
    // dépasse la latence tolérable pour un « annuler ».
    expect(tranches.reduce((a, b) => a + b, 0)).toBe(12_000);
    expect(Math.max(...tranches)).toBe(250);
  });

  it("une erreur non reprenable ne coûte AUCUNE seconde d'attente", async () => {
    const dodos: number[] = [];
    let appels = 0;
    const base = {
      page: async () => {
        appels++;
        throw new ErreurHttpRaindrop(403);
      },
    } as unknown as Lecture;
    const lecture = avecReprise(base, { dormir: async (ms) => void dodos.push(ms) });
    await expect(lecture.page(0, { sort: "created", page: 0 })).rejects.toThrow(/403/);
    // Une seule tentative : rejouer un jeton révoqué trois fois avec des
    // pauses transformerait une erreur claire en panne lente.
    expect(appels).toBe(1);
    expect(dodos).toEqual([]);
  });

  it("annuler PENDANT la pause cesse d'attendre sur-le-champ", async () => {
    const dodos: number[] = [];
    let annule = false;
    const base = { page: async () => { throw new ErreurHttpRaindrop(429); } } as unknown as Lecture;
    const lecture = avecReprise(base, {
      annule: () => annule,
      // La pause se dort par tranches : la deuxième tranche voit l'annulation.
      dormir: async (ms) => {
        dodos.push(ms);
        if (dodos.length === 2) annule = true;
      },
    });
    await expect(lecture.page(0, { sort: "created", page: 0 })).rejects.toThrow(/429/);
    // 4 000 ms de pause prévue, 500 ms réellement dormies : sans les tranches,
    // l'utilisateur qui annule attendrait les 4 secondes entières.
    expect(dodos).toEqual([250, 250]);
  });

  it("les SIX lectures sont enveloppées, pas seulement `page`", async () => {
    // Une méthode oubliée resterait sans filet, en silence : rien à l'écran
    // ne distinguerait « collections non protégé » de « collections protégé ».
    const vus: string[] = [];
    const jette = (nom: string) => async () => {
      vus.push(nom);
      throw new ErreurHttpRaindrop(429);
    };
    const base = {
      page: jette("page"), compteur: jette("compteur"), collections: jette("collections"),
      collectionsEnfants: jette("collectionsEnfants"), highlights: jette("highlights"), user: jette("user"),
    } as unknown as Lecture;
    const lecture = avecReprise(base, { essais: 1, dormir: async () => undefined });
    const appels: Array<Promise<unknown>> = [
      lecture.page(0, { sort: "created", page: 0 }), lecture.compteur(0), lecture.collections(),
      lecture.collectionsEnfants(), lecture.highlights(0), lecture.user(),
    ];
    await Promise.allSettled(appels);
    // Deux passages par méthode (la tentative + l'essai) : une méthode non
    // enveloppée n'apparaîtrait qu'une fois.
    for (const nom of ["page", "compteur", "collections", "collectionsEnfants", "highlights", "user"]) {
      expect(vus.filter((v) => v === nom)).toHaveLength(2);
    }
  });
});
