import { describe, it, expect } from "vitest";
import { listQueryArgs } from "./listQuery";
import type { View } from "../state/appState";

const view: View = { kind: "list", collectionId: 0, label: "Tous", search: "rust", sort: "title", notag: true, media: "video" };

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
});
