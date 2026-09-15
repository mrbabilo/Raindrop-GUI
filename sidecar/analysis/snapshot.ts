import type { CallOutcome } from "../../shared/errors.js";
import type { RaindropItem } from "../../shared/types.js";
import { toRaindropItem } from "../api/mappers.js";
import type { RawRaindrop } from "../api/mappers.js";

export type McpCaller = (
  tool: string,
  args: Record<string, unknown>,
) => Promise<CallOutcome<unknown>>;

const PAGE = 50;

export async function fetchLibrarySnapshot(
  mcp: McpCaller,
  opts: { onProgress?: (done: number, total: number) => void; isCancelled?: () => boolean } = {},
): Promise<{ items: RaindropItem[]; cancelled: boolean }> {
  const items: RaindropItem[] = [];
  let page = 0;
  let count = Infinity;
  while (items.length < count) {
    if (opts.isCancelled?.()) return { items, cancelled: true };
    const out = await mcp("search_raindrops", {
      collection_id: 0, // bibliothèque active, hors corbeille
      per_page: PAGE,
      page,
    });
    if (!out.ok) throw new Error(`${out.code}: ${out.message}`);
    const raw = out.data as { count: number; items: RawRaindrop[] };
    count = raw.count;
    items.push(...raw.items.map(toRaindropItem));
    opts.onProgress?.(items.length, count);
    if (raw.items.length === 0) break; // garde-fou pagination
    page++;
  }
  return { items, cancelled: false };
}
