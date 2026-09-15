// ─── Fixtures déterministes ──────────────────────────────────────────────────
// Données en mémoire partagées par le fake MCP server (fakeServer.ts).
// Fichier scindé de fakeServer.ts pour respecter le plafond de 400 lignes
// (convention d887245) — décision du contrôleur, 2 fichiers, pas plus.

export interface FakeRaindrop {
  id: number;
  link: string;
  title: string;
  excerpt: string;
  note: string;
  tags: string[];
  created: string;
  lastUpdate: string;
  important: boolean;
  type: string;
  cover: string | null;
  collectionId: number;
  removed: boolean; // corbeille
}

let idCounter = 1000;

/** Source d'ids unique partagée par les fixtures et les tools de création. */
export function nextId(): number {
  return idCounter++;
}

export function makeFixtures(raindropCount = 60) {
  const domains = ["example.com", "docs.python.org", "github.com", "news.ycombinator.com"];
  const tagPool = ["typescript", "rust", "design", "outils", "à-lire", "ia"];
  const collections = [
    { id: 101, title: "Dev", parentId: null as number | null, count: 0, public: false, view: "list" },
    { id: 102, title: "Design", parentId: null, count: 0, public: false, view: "grid" },
    { id: 201, title: "Rust", parentId: 101, count: 0, public: false, view: "list" },
  ];
  const raindrops: FakeRaindrop[] = [];
  for (let i = 0; i < raindropCount; i++) {
    const domain = domains[i % domains.length]!;
    raindrops.push({
      id: nextId(),
      link: `https://${domain}/page-${i}`,
      title: `Article ${i} sur ${domain}`,
      excerpt: `Extrait ${i}`,
      note: "",
      tags: i % 3 === 0 ? [] : [tagPool[i % tagPool.length]!],
      created: new Date(Date.UTC(2025, 0, 1 + (i % 28), 12)).toISOString(),
      lastUpdate: new Date(Date.UTC(2025, 5, 1 + (i % 28), 12)).toISOString(),
      important: i % 7 === 0,
      type: "link",
      cover: null,
      collectionId: collections[i % collections.length]!.id,
      removed: false,
    });
  }
  // Doublons assumés pour les tests d'analyse
  const dupSrc = raindrops[0]!;
  raindrops.push({ ...dupSrc, id: nextId(), title: "Copie exacte" });
  raindrops.push({
    ...dupSrc,
    id: nextId(),
    title: "Copie normalisée",
    link: dupSrc.link.replace("http://", "https://") + "/",
  });
  return { raindrops, collections, tags: tagPool };
}

/**
 * Sérialise au format BRUT Raindrop API (celui que renvoie le vrai package
 * MCP) : les mappers du sidecar sont ainsi testés contre la vraie forme.
 */
export function toRaw(r: FakeRaindrop) {
  return {
    id: r.id,
    link: r.link,
    title: r.title,
    excerpt: r.excerpt,
    note: r.note,
    tags: r.tags,
    created: r.created,
    last_update: r.lastUpdate,
    important: r.important,
    type: r.type,
    domain: new URL(r.link).hostname,
    cover: r.cover ? [{ src: r.cover }] : [],
    collection: { $id: r.collectionId },
  };
}
