import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";

// ─── Fixtures déterministes ──────────────────────────────────────────────────

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
  /**
   * Présent uniquement sur les 2 doublons synthétiques ajoutés par
   * makeFixtures (id de la raindrop source). Non sérialisé par toRaw ;
   * sert à exclure ces extras du `count` paginé du search.
   */
  dupOf?: number;
}

let nextId = 1000;

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
      id: nextId++,
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
  raindrops.push({ ...dupSrc, id: nextId++, title: "Copie exacte", dupOf: dupSrc.id });
  raindrops.push({
    ...dupSrc,
    id: nextId++,
    title: "Copie normalisée",
    link: dupSrc.link.replace("http://", "https://") + "/",
    dupOf: dupSrc.id,
  });
  return { raindrops, collections, tags: tagPool };
}

// ─── Serveur factice ─────────────────────────────────────────────────────────

/**
 * Sérialise au format BRUT Raindrop API (celui que renvoie le vrai package
 * MCP) : les mappers du sidecar sont ainsi testés contre la vraie forme.
 */
function toRaw(r: FakeRaindrop) {
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

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });
const err = (msg: string) => ({ content: [{ type: "text" as const, text: `Error: ${msg}` }] });

export function buildFakeRaindropServer(opts?: {
  raindropCount?: number;
  failTools?: string[];
}) {
  const fail = new Set(opts?.failTools ?? []);
  const fx = makeFixtures(opts?.raindropCount ?? 60);
  const server = new McpServer({ name: "fake-raindrop", version: "0.0.1" });

  const guard = (name: string) => (fail.has(name) ? err(`fake failure: ${name}`) : null);

  server.registerTool(
    "search_raindrops",
    {
      inputSchema: {
        collection_id: z.number().default(0),
        search: z.string().optional(),
        page: z.number().default(0),
        per_page: z.number().default(25),
        important: z.boolean().optional(),
        notag: z.boolean().optional(),
      },
    },
    async ({ collection_id, page, per_page, important, notag }) => {
      const g = guard("search_raindrops");
      if (g) return g;
      let items = fx.raindrops.filter((r) => (collection_id === -99 ? r.removed : !r.removed));
      if (collection_id > 0) items = items.filter((r) => r.collectionId === collection_id);
      if (important) items = items.filter((r) => r.important);
      if (notag) items = items.filter((r) => r.tags.length === 0);
      const start = page * per_page;
      // count = bibliothèque de base (hors 2 doublons synthétiques, qui
      // restent présents dans `items` pour les tests d'analyse)
      const count = items.filter((r) => r.dupOf == null).length;
      return ok({ count, items: items.slice(start, start + per_page).map(toRaw) });
    },
  );

  server.registerTool(
    "get_raindrop",
    { inputSchema: { id: z.number() } },
    async ({ id }) => {
      const g = guard("get_raindrop");
      if (g) return g;
      const r = fx.raindrops.find((x) => x.id === id);
      return r ? ok(toRaw(r)) : err(`raindrop ${id} not found`);
    },
  );

  server.registerTool(
    "create_raindrop",
    {
      inputSchema: {
        link: z.string().url(),
        title: z.string().optional(),
        collection_id: z.number().optional(),
        tags: z.array(z.string()).optional(),
      },
    },
    async (a) => {
      const g = guard("create_raindrop");
      if (g) return g;
      const r: FakeRaindrop = {
        id: nextId++,
        link: a.link,
        title: a.title ?? a.link,
        excerpt: "",
        note: "",
        tags: a.tags ?? [],
        created: new Date().toISOString(),
        lastUpdate: new Date().toISOString(),
        important: false,
        type: "link",
        cover: null,
        collectionId: a.collection_id ?? -1,
        removed: false,
      };
      fx.raindrops.push(r);
      return ok(toRaw(r));
    },
  );

  server.registerTool(
    "update_raindrop",
    {
      inputSchema: {
        id: z.number(),
        title: z.string().optional(),
        excerpt: z.string().optional(),
        note: z.string().optional(),
        tags: z.array(z.string()).optional(),
        important: z.boolean().optional(),
        collection_id: z.number().optional(),
      },
    },
    async ({ id, ...patch }) => {
      const g = guard("update_raindrop");
      if (g) return g;
      const r = fx.raindrops.find((x) => x.id === id);
      if (!r) return err(`raindrop ${id} not found`);
      if (patch.title != null) r.title = patch.title;
      if (patch.excerpt != null) r.excerpt = patch.excerpt;
      if (patch.note != null) r.note = patch.note;
      if (patch.tags != null) r.tags = patch.tags;
      if (patch.important != null) r.important = patch.important;
      if (patch.collection_id != null) r.collectionId = patch.collection_id;
      return ok(toRaw(r));
    },
  );

  server.registerTool(
    "delete_raindrop",
    { inputSchema: { id: z.number() } },
    async ({ id }) => {
      const g = guard("delete_raindrop");
      if (g) return g;
      const r = fx.raindrops.find((x) => x.id === id);
      if (!r) return err(`raindrop ${id} not found`);
      r.removed = true;
      return ok({ deleted: true });
    },
  );

  server.registerTool(
    "bulk_raindrops",
    {
      inputSchema: {
        operation: z.enum(["update", "move", "delete"]),
        collection_id: z.number(),
        ids: z.array(z.number()).optional(),
        to_collection_id: z.number().optional(),
        tags: z.array(z.string()).optional(),
        important: z.boolean().optional(),
      },
    },
    async ({ operation, collection_id, ids, to_collection_id, tags, important }) => {
      const g = guard("bulk_raindrops");
      if (g) return g;
      const inScope = (r: FakeRaindrop) =>
        (ids ? ids.includes(r.id) : true) &&
        (collection_id === 0 || collection_id === -99 ? true : r.collectionId === collection_id);
      let n = 0;
      for (const r of fx.raindrops) {
        if (!inScope(r)) continue;
        if (operation === "delete") r.removed = true;
        if (operation === "move" && to_collection_id != null) r.collectionId = to_collection_id;
        if (operation === "update") {
          if (tags != null) r.tags = tags;
          if (important != null) r.important = important;
        }
        n++;
      }
      return ok({ affected: n });
    },
  );

  server.registerTool("get_collections", { inputSchema: {} }, async () => {
    const g = guard("get_collections");
    if (g) return g;
    return ok({ items: fx.collections.filter((c) => c.parentId === null) });
  });

  server.registerTool("get_child_collections", { inputSchema: {} }, async () => {
    const g = guard("get_child_collections");
    if (g) return g;
    return ok({ items: fx.collections.filter((c) => c.parentId !== null) });
  });

  server.registerTool(
    "get_collection",
    { inputSchema: { id: z.number() } },
    async ({ id }) => {
      const c = fx.collections.find((x) => x.id === id);
      return c ? ok(c) : err(`collection ${id} not found`);
    },
  );

  server.registerTool(
    "create_collection",
    {
      inputSchema: {
        title: z.string(),
        parent_id: z.number().optional(),
      },
    },
    async ({ title, parent_id }) => {
      const g = guard("create_collection");
      if (g) return g;
      const c = { id: nextId++, title, parentId: parent_id ?? null, count: 0, public: false, view: "list" };
      fx.collections.push(c);
      return ok(c);
    },
  );

  server.registerTool(
    "update_collection",
    { inputSchema: { id: z.number(), title: z.string().optional() } },
    async ({ id, title }) => {
      const c = fx.collections.find((x) => x.id === id);
      if (!c) return err(`collection ${id} not found`);
      if (title != null) c.title = title;
      return ok(c);
    },
  );

  server.registerTool(
    "delete_collection",
    { inputSchema: { id: z.number() } },
    async ({ id }) => {
      const g = guard("delete_collection");
      if (g) return g;
      const i = fx.collections.findIndex((x) => x.id === id);
      if (i === -1) return err(`collection ${id} not found`);
      fx.collections.splice(i, 1);
      return ok({ deleted: true });
    },
  );

  server.registerTool(
    "cleanup_collections",
    { inputSchema: { confirm: z.boolean().default(false) } },
    async ({ confirm }) => {
      const g = guard("cleanup_collections");
      if (g) return g;
      if (!confirm) return ok({ message: "Pass confirm: true" });
      return ok({ cleaned: 0 });
    },
  );

  server.registerTool(
    "get_tags",
    { inputSchema: { collection_id: z.number().optional() } },
    async () => {
      const g = guard("get_tags");
      if (g) return g;
      const counts = new Map<string, number>();
      for (const r of fx.raindrops) {
        if (r.removed) continue;
        for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
      }
      // format brut Raindrop : {_id, count} (normalisé par la route GET /api/tags)
      return ok({ items: [...counts].map(([name, count]) => ({ _id: name, count })) });
    },
  );

  server.registerTool(
    "manage_tags",
    {
      inputSchema: {
        operation: z.enum(["rename", "merge", "delete"]),
        tags: z.array(z.string()),
        new_name: z.string().optional(),
      },
    },
    async ({ operation, tags, new_name }) => {
      const g = guard("manage_tags");
      if (g) return g;
      for (const r of fx.raindrops) {
        if (operation === "delete") r.tags = r.tags.filter((t) => !tags.includes(t));
        if (operation === "rename" && r.tags.includes(tags[0]!))
          r.tags = r.tags.map((t) => (t === tags[0] ? new_name! : t));
        if (operation === "merge" && r.tags.some((t) => tags.includes(t)))
          r.tags = [...r.tags.filter((t) => !tags.includes(t)), new_name!];
      }
      return ok({ done: true });
    },
  );

  server.registerTool(
    "get_highlights",
    { inputSchema: { raindrop_id: z.number().optional() } },
    async () => {
      const g = guard("get_highlights");
      if (g) return g;
      return ok({ items: [] });
    },
  );

  server.registerTool("get_user", { inputSchema: {} }, async () => {
    const g = guard("get_user");
    if (g) return g;
    return ok({
      id: 42,
      email: "moi@example.com",
      fullName: "Utilisateur Test",
      pro: true,
      bookmarksCount: fx.raindrops.filter((r) => !r.removed).length,
    });
  });

  server.registerTool(
    "parse_url",
    { inputSchema: { url: z.string().url() } },
    async ({ url }) => {
      const g = guard("parse_url");
      if (g) return g;
      return ok({ title: `Meta de ${url}`, description: "Description factice", type: "link" });
    },
  );

  server.registerTool(
    "check_urls_exist",
    { inputSchema: { urls: z.array(z.string().url()) } },
    async ({ urls }) => {
      const g = guard("check_urls_exist");
      if (g) return g;
      const items = urls.map((u) => ({ url: u, exists: fx.raindrops.some((r) => r.link === u) }));
      return ok({ items });
    },
  );

  server.registerTool(
    "empty_trash",
    { inputSchema: { confirm: z.boolean().default(false) } },
    async ({ confirm }) => {
      const g = guard("empty_trash");
      if (g) return g;
      if (!confirm) return ok({ message: "Pass confirm: true" });
      const n = fx.raindrops.filter((r) => r.removed).length;
      for (const r of fx.raindrops) if (r.removed) r.removed = false; // vidée = disparue
      fx.raindrops.splice(0, fx.raindrops.length, ...fx.raindrops.filter((r) => !r.removed));
      return ok({ deleted: n });
    },
  );

  return { server, fixtures: fx };
}

/** Paire client↔serveur in-memory déjà connectée (handshake fait). */
export async function connectFake(opts?: {
  raindropCount?: number;
  failTools?: string[];
}) {
  const { server, fixtures } = buildFakeRaindropServer(opts);
  const client = new Client({ name: "fake-client", version: "0.0.1" });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return { client, server, fixtures };
}
