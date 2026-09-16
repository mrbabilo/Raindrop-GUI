import { describe, it, expect } from "vitest";
import { toCollection, toRaindropItem } from "./mappers.js";
import type { RawCollection, RawRaindrop } from "./mappers.js";

// Fixtures copiées de la sonde réelle (Task 7c, Step 1 — 2026-09-16), pas
// inventées : `node sonde.mjs` contre @kud/mcp-raindrop-io 1.3.1, compte réel.
// Champs non pertinents pour les mappers (user, creatorRef, access, sort,
// slug, description...) omis, le reste est verbatim.

const RAW_ROOT_WITH_COVER_AND_COLOR: RawCollection = {
  _id: 45024919,
  title: "10 - SERVEURS",
  public: false,
  view: "grid",
  count: 11,
  cover: ["https://up.raindrop.io/collection/thumbs/450/249/19/4bb19ea66daf750f4303d9748c0994cc.png"],
  color: "#435b63",
  // pas de clé `parent` du tout sur cette racine réelle — cas observé, pas un
  // artefact de fixture : certaines racines n'ont pas la clé, d'autres la
  // portent à `null` (RAW_ROOT_MINIMAL ci-dessous).
};

const RAW_ROOT_MINIMAL: RawCollection = {
  _id: 75028676,
  title: "MIGRATION",
  public: false,
  view: "grid",
  count: 0,
  cover: [],
  parent: null,
};

const RAW_CHILD: RawCollection = {
  _id: 75029699,
  title: "01.14 - 🧠 PHILOSOPHIE",
  public: false,
  view: "grid",
  count: 3,
  cover: [],
  parent: { $id: 75028677 },
};

const RAW_RAINDROP_FULL: RawRaindrop = {
  id: 1851471691,
  link: "https://www.1000exercicespourlascene.fr/",
  title: "1000 exercices de théâtre et jeux pour l'animation",
  excerpt: "Recueil de 1000 exercices...",
  note: "",
  tags: ["exercices", "clown", "théâtre"],
  created: "2026-09-12T18:11:26.222Z",
  last_update: "2026-09-12T18:11:41.592Z",
  important: false,
  type: "link",
  domain: "1000exercicespourlascene.fr",
  collection: { $id: 45024906 },
  cache: { status: "ready" },
  broken: false,
  // `cover` est une chaîne unique dans la vraie réponse — jamais un tableau
  // {src}[] — vérifié par sonde sur 400 raindrops réels (2026-09-16).
  cover: "https://www.1000exercicespourlascene.fr/img/partenaires/logo1000rond.png",
};

// ~5 % des 400 raindrops sondés portent `cover: ""` (pas de miniature) —
// ex. réel : id 1750750726, "https://korben.info/tuistudio-figma-applications-terminal.html".
const RAW_RAINDROP_EMPTY_COVER: RawRaindrop = { ...RAW_RAINDROP_FULL, id: 1750750726, cover: "" };

describe("toCollection — forme réelle sondée (tableau nu, _id, parent.$id)", () => {
  it("mappe _id → id, cover[0] → cover, color → color", () => {
    const c = toCollection(RAW_ROOT_WITH_COVER_AND_COLOR);
    expect(c.id).toBe(45024919);
    expect(c.cover).toBe(
      "https://up.raindrop.io/collection/thumbs/450/249/19/4bb19ea66daf750f4303d9748c0994cc.png",
    );
    expect(c.color).toBe("#435b63");
    expect(c.parentId).toBeNull(); // clé `parent` absente → racine
  });

  it("absence de cover et de color → null (pas undefined)", () => {
    const c = toCollection(RAW_ROOT_MINIMAL);
    expect(c.cover).toBeNull();
    expect(c.color).toBeNull();
  });

  it("parent explicitement null (racine) → parentId null", () => {
    expect(toCollection(RAW_ROOT_MINIMAL).parentId).toBeNull();
  });

  it("parent.$id (enfant) → parentId", () => {
    const c = toCollection(RAW_CHILD);
    expect(c.id).toBe(75029699);
    expect(c.parentId).toBe(75028677);
  });
});

describe("toRaindropItem — cache et broken gratuits dans la liste", () => {
  it("mappe cache et broken depuis la réponse réelle", () => {
    const item = toRaindropItem(RAW_RAINDROP_FULL);
    expect(item.cache).toEqual({ status: "ready" });
    expect(item.broken).toBe(false);
  });

  it("absence de cache/broken → cache null, broken false", () => {
    const { cache, broken, ...rest } = RAW_RAINDROP_FULL;
    void cache;
    void broken;
    const item = toRaindropItem(rest);
    expect(item.cache).toBeNull();
    expect(item.broken).toBe(false);
  });
});

describe("toRaindropItem — cover est une chaîne réelle, pas {src}[]", () => {
  it("mappe la chaîne cover telle quelle", () => {
    expect(toRaindropItem(RAW_RAINDROP_FULL).cover).toBe(
      "https://www.1000exercicespourlascene.fr/img/partenaires/logo1000rond.png",
    );
  });

  it("cover vide (\"\", ~5 % des raindrops réels sondés) → null", () => {
    expect(toRaindropItem(RAW_RAINDROP_EMPTY_COVER).cover).toBeNull();
  });

  it("absence de cover → null", () => {
    const { cover, ...rest } = RAW_RAINDROP_FULL;
    void cover;
    expect(toRaindropItem(rest).cover).toBeNull();
  });
});
