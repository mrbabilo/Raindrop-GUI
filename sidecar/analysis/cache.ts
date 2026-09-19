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
  /** Tous les résultats de check, **un par URL** — la forme de stockage. */
  allResults(): LinkCheckResult[] {
    return Object.values(this.data.links.results);
  }

  /**
   * Les résultats **par SIGNET**, et non par URL — la forme que l'interface
   * doit lire.
   *
   * Le stockage reste indexé par URL, et c'est juste : une URL ne se vérifie
   * qu'une fois, quel que soit le nombre de signets qui la portent. Mais le
   * rendre tel quel à l'écran cachait des signets. Sur la bibliothèque réelle
   * (mesuré le 2026-09-19) : **430 signets** partagent une URL au caractère
   * près, soit jusqu'à **242 signets morts invisibles**. L'utilisateur
   * réparait celui qu'on lui montrait, les autres restaient morts — et rien,
   * jamais, ne les lui aurait signalés.
   *
   * Le `raindropId` stocké dans le résultat est celui du DERNIER signet
   * vérifié pour cette URL : c'est un hasard d'ordonnancement, pas une
   * désignation. On le recalcule ici depuis l'index.
   */
  resultatsParSignet(): LinkCheckResult[] {
    const parUrl = new Map<string, number[]>();
    for (const [id, meta] of Object.entries(this.data.itemsIndex)) {
      const ids = parUrl.get(meta.url);
      if (ids) ids.push(Number(id));
      else parUrl.set(meta.url, [Number(id)]);
    }
    const out: LinkCheckResult[] = [];
    for (const r of Object.values(this.data.links.results)) {
      const ids = parUrl.get(r.url);
      // URL sans signet connu : l'index n'a pas encore été peuplé, ou le
      // signet a disparu depuis. On garde la ligne telle quelle plutôt que
      // de la perdre — un diagnostic orphelin se voit, un diagnostic effacé
      // ne se voit pas.
      if (!ids || ids.length === 0) out.push(r);
      else for (const raindropId of ids) out.push({ ...r, raindropId });
    }
    return out;
  }

  getItemsIndex(): Record<number, { title: string; collectionId: number; url: string }> {
    return this.data.itemsIndex;
  }
  /**
   * REMPLACE l'index, il ne le fusionne pas.
   *
   * L'index n'est élagué nulle part : fusionné, un signet supprimé y survit
   * pour toujours. Anodin tant qu'il ne servait qu'à décorer une ligne d'un
   * titre ; devenu dangereux depuis que `resultatsParSignet` s'en sert pour
   * DÉCIDER quelles lignes exister — un signet effacé ressusciterait dans la
   * liste des liens morts, avec une action qui ne peut plus aboutir.
   *
   * Le remplacement est sûr ici : l'appelant (`scanner.ts`) ne le nourrit que
   * d'un instantané COMPLET de la bibliothèque, le cas annulé étant traité
   * avant. Un instantané partiel amputerait l'index.
   */
  setItemsIndex(items: RaindropItem[]): void {
    const neuf: CacheFile["itemsIndex"] = {};
    for (const i of items) {
      neuf[i.id] = { title: i.title, collectionId: i.collectionId, url: i.url };
    }
    this.data.itemsIndex = neuf;
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

  /**
   * L'avancement de la vérification des liens, LU DANS LE CACHE — aucune
   * requête.
   *
   * La reprise après coupure fonctionne déjà par construction : les résultats
   * sont persistés tous les 20 et `staleUrls` exclut ce qui est frais. Mais
   * rien ne le DISAIT : l'écran affichait « Dernier scan : jamais » (la date
   * ne se pose qu'à l'achèvement) puis une progression repartant de zéro sur
   * un total mystérieusement réduit. De quoi croire qu'on recommence tout,
   * ou qu'on en a perdu la moitié.
   */
  avancementLiens(ttlDays: number): { verifies: number; total: number } {
    const cutoff = Date.now() - ttlDays * 864e5;
    const metas = Object.values(this.data.itemsIndex);
    // Compté sur les URL DISTINCTES, comme le scan les vérifie : sur les
    // signets, deux doublons feraient compter deux vérifications pour une.
    const urls = new Set(metas.map((m) => m.url));
    let verifies = 0;
    for (const url of urls) {
      const r = this.data.links.results[url];
      if (r && new Date(r.checkedAt).getTime() >= cutoff) verifies++;
    }
    return { verifies, total: urls.size };
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
