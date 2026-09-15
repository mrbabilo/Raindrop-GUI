import { readFile, writeFile, rename } from "node:fs/promises";
import type { DuplicateGroup, LinkCheckResult, AnalysisType } from "../../shared/types.js";
import type { RaindropItem } from "../../shared/types.js";

interface CacheFile {
  version: 1;
  links: { lastScan: string | null; results: Record<string, LinkCheckResult> };
  duplicates: { lastScan: string | null; groups: { exact: DuplicateGroup[]; normalized: DuplicateGroup[]; fuzzy: DuplicateGroup[] } };
  itemsIndex: Record<number, { title: string; collectionId: number; url: string }>;
}

const empty = (): CacheFile => ({
  version: 1,
  links: { lastScan: null, results: {} },
  duplicates: { lastScan: null, groups: { exact: [], normalized: [], fuzzy: [] } },
  itemsIndex: {},
});

export class AnalysisCache {
  private data: CacheFile = empty();
  private constructor(private file: string) {}

  static async load(file: string): Promise<AnalysisCache> {
    const cache = new AnalysisCache(file);
    try {
      const raw = await readFile(file, "utf8");
      const parsed = JSON.parse(raw) as CacheFile;
      if (parsed.version === 1) cache.data = parsed;
    } catch {
      cache.data = empty(); // absent ou corrompu → vide (incident loggé par l'appelant)
    }
    return cache;
  }

  async save(): Promise<void> {
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(this.data), "utf8");
    await rename(tmp, this.file);
  }

  getResult(url: string): LinkCheckResult | undefined {
    return this.data.links.results[url];
  }
  setResult(r: LinkCheckResult): void {
    this.data.links.results[r.url] = r;
  }

  getItemsIndex(): Record<number, { title: string; collectionId: number; url: string }> {
    return this.data.itemsIndex;
  }
  setItemsIndex(items: RaindropItem[]): void {
    for (const i of items) {
      this.data.itemsIndex[i.id] = { title: i.title, collectionId: i.collectionId, url: i.url };
    }
  }

  getGroups(): { exact: DuplicateGroup[]; normalized: DuplicateGroup[]; fuzzy: DuplicateGroup[] } {
    return this.data.duplicates.groups;
  }
  setGroups(g: { exact: DuplicateGroup[]; normalized: DuplicateGroup[]; fuzzy: DuplicateGroup[] }): void {
    this.data.duplicates.groups = g;
  }

  lastScan(type: AnalysisType): string | null {
    return type === "links" ? this.data.links.lastScan : this.data.duplicates.lastScan;
  }
  markScanDone(type: AnalysisType): void {
    const now = new Date().toISOString();
    if (type === "links") this.data.links.lastScan = now;
    else this.data.duplicates.lastScan = now;
  }

  /** URLs à re-checker : absentes du cache ou plus vieilles que ttlDays. */
  staleUrls(items: RaindropItem[], ttlDays: number): { id: number; url: string }[] {
    const cutoff = Date.now() - ttlDays * 864e5;
    return items
      .filter((i) => {
        const r = this.data.links.results[i.url];
        return !r || new Date(r.checkedAt).getTime() < cutoff;
      })
      .map((i) => ({ id: i.id, url: i.url }));
  }
}
