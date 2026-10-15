import { test as base, expect, type Page, type Route } from "@playwright/test";
import { bookmarks, collections } from "./data";

type Override = (route: Route) => Promise<void>;

// Seule la frontière HTTP est simulée : vrais composants, CSS, focus et layout.
// Toute route inconnue échoue au teardown, plutôt que répondre {} silencieusement.
export class MockApi {
  items = bookmarks();
  overrides = new Map<string, Override>();
  unexpected: string[] = [];

  async handle(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    const key = `${request.method()} ${url.pathname}`;
    const override = this.overrides.get(key);
    if (override) return override(route);
    const json = (body: unknown) => route.fulfill({ json: body });
    if (request.method() === "GET") {
      switch (url.pathname) {
        case "/api/health": return json({ status: "ok", mcp: "connected" });
        case "/api/collections": return json({ items: collections });
        case "/api/tags": return json({ items: [{ name: "design", count: 30 }, { name: "typescript", count: 30 }] });
        case "/api/user": return json({ id: 1, fullName: "Compte de test", email: "test@example.test", pro: false, bookmarksCount: 60 });
        case "/api/jobs": return json([]);
        case "/api/smartlists": return json({ items: [] });
        case "/api/backup/status": return json({ actif: false });
        case "/api/backup/archives": return json({ ids: [], octets: 0 });
        case "/api/journal": return json({ entries: [] });
        case "/api/analysis/etats": return json({ etats: {} });
        case "/api/analysis/status": return json({
          links: { lastScan: null, running: false, verifies: 0, total: 60 },
          duplicates: { lastScan: null, running: false },
        });
        case "/api/analysis/results/duplicates": return json({ exact: [], normalized: [], fuzzy: [] });
        case "/api/analysis/results/links": return json({ items: [], total: 0, page: 0, perPage: Number(url.searchParams.get("per_page") ?? 50) });
        case "/api/raindrops": {
          const q = url.searchParams;
          const collection = Number(q.get("collection_id") ?? 0);
          const search = (q.get("search") ?? "").toLowerCase();
          const items = this.items.filter((item) =>
            (collection === 0 || item.collectionId === collection)
            && (!q.has("notag") || item.tags.length === 0)
            && item.title.toLowerCase().includes(search)
            && q.getAll("tags").every((tag) => item.tags.includes(tag)));
          const page = Number(q.get("page") ?? 0);
          const perPage = Number(q.get("per_page") ?? 50);
          return json({ items: items.slice(page * perPage, (page + 1) * perPage), count: items.length, page, perPage });
        }
      }
      const detail = url.pathname.match(/^\/api\/raindrops\/(\d+)$/);
      if (detail) {
        const item = this.items.find((r) => r.id === Number(detail[1]));
        if (item) return json(item);
      }
    }
    if (key === "POST /api/parse-url") return json({ title: "Titre analysé" });
    if (key === "POST /api/check-urls") return json({ result: true, ids: [], duplicates: [] });
    this.unexpected.push(key);
    return route.fulfill({ status: 501, json: { error: { code: "INVALID_INPUT", message: `Route non simulée : ${key}` } } });
  }
}

export const test = base.extend<{ api: MockApi; openApp: () => Promise<void> }>({
  api: async ({ context }, use) => {
    const api = new MockApi();
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === "http://127.0.0.1:4178") {
        if (url.pathname.startsWith("/api/")) return api.handle(route);
        return route.continue();
      }
      if (url.origin === "https://api.github.com" && url.pathname === "/repos/mrbabilo/Raindrop-GUI/releases") {
        return route.fulfill({ json: [] });
      }
      api.unexpected.push(`Réseau externe bloqué : ${url.origin}${url.pathname}`);
      return route.abort();
    });
    await use(api);
    expect(api.unexpected, "Routes non simulées ou trafic externe inattendu").toEqual([]);
  },
  openApp: async ({ page, api }, use) => {
    void api;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await use(async () => {
      await page.goto("/");
      await expect(page.getByRole("textbox", { name: "Rechercher", exact: true })).toBeVisible();
    });
    expect(errors, "Erreurs JavaScript du navigateur").toEqual([]);
  },
});

export { expect };

export async function capture(page: Page, name: string) {
  await test.info().attach(name, {
    body: await page.screenshot({ animations: "disabled" }), contentType: "image/png",
  });
}
