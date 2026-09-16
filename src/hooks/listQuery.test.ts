import { describe, it, expect } from "vitest";
import { listQueryArgs } from "./listQuery";
import type { View } from "../state/appState";

const view: View = {
  kind: "list", collectionId: 0, label: "Tous", search: "rust", sort: "title", notag: true, media: "video",
  domain: "exemple.fr", createdStart: "2025-01-01", createdEnd: "2025-12-31",
};

describe("listQueryArgs", () => {
  it("porte la nature (media) de la vue par défaut — ListPane filtre réellement", () => {
    expect(listQueryArgs(view)).toMatchObject({ collectionId: 0, search: "rust", sort: "title", notag: true, media: "video" });
  });

  it("omitMedia retire la nature (comptage NatureChips, R6bP-1)", () => {
    expect(listQueryArgs(view, { omitMedia: true }).media).toBeUndefined();
  });

  it("sans nature active, la clé est identique avec ou sans omitMedia — zéro requête en plus (R6bP-1)", () => {
    const sansMedia: View = { ...view, media: undefined };
    expect(listQueryArgs(sansMedia)).toEqual(listQueryArgs(sansMedia, { omitMedia: true }));
  });

  it("hors vue list, retombe sur Tous (0) sans média", () => {
    expect(listQueryArgs({ kind: "tags" })).toMatchObject({ collectionId: 0, media: undefined });
  });

  // Task 7b : les trois contrôles livrés en Task 6 (domaine, depuis, jusqu'à)
  // étaient collectés par la TopBar puis JETÉS ici — ils ne filtraient rien.
  it("porte le domaine et les bornes de date de la vue (défaut Task 6)", () => {
    expect(listQueryArgs(view)).toMatchObject({
      domain: "exemple.fr", createdStart: "2025-01-01", createdEnd: "2025-12-31",
    });
  });

  it("hors vue list, aucun filtre de domaine ni de date ne fuit", () => {
    expect(listQueryArgs({ kind: "cleanup" })).toMatchObject({
      domain: undefined, createdStart: undefined, createdEnd: undefined,
    });
  });

  // Le contrat de déduplication : les deux consommateurs ne diffèrent QUE par
  // `media`. Un champ ajouté d'un seul côté casserait la queryKey partagée et
  // NatureChips déclencherait une requête parasite — ce test l'attrape.
  it("NatureChips ne diffère de ListPane que par la nature", () => {
    expect(listQueryArgs(view, { omitMedia: true })).toEqual({ ...listQueryArgs(view), media: undefined });
  });
});
