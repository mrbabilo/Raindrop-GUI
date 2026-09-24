//! Le signal « la bibliothèque a changé par l'application » (optimisation du
//! 2026-09-24) : il invalide l'instantané que les analyses se partagent.
//! Prudence par défaut : un outil INCONNU compte comme une écriture — une
//! relecture de trop coûte 2 min, un instantané périmé ment sur l'écran.

import { describe, it, expect } from "vitest";
import { ecrit, surveillerEcritures } from "./ecritures.js";

describe("ecrit", () => {
  it.each(["get_raindrop", "get_user", "search_raindrops", "parse_url", "check_urls_exist", "get_child_collections"])(
    "%s est une lecture",
    (outil) => expect(ecrit(outil)).toBe(false),
  );
  it.each(["update_raindrop", "delete_raindrop", "bulk_raindrops", "create_raindrop", "manage_tags", "empty_trash", "delete_collection", "outil_inconnu"])(
    "%s compte comme une écriture",
    (outil) => expect(ecrit(outil)).toBe(true),
  );
});

describe("surveillerEcritures", () => {
  it("signale chaque écriture — même refusée — et jamais une lecture", async () => {
    const signaux: string[] = [];
    const mcp = surveillerEcritures(async (outil: string, _args: Record<string, unknown>) => ({ ok: outil !== "delete_raindrop" }), (o) => signaux.push(o));
    await mcp("get_raindrop", {});
    await mcp("update_raindrop", {});
    await mcp("delete_raindrop", {}); // refusée : l'état a pu changer quand même
    expect(signaux).toEqual(["update_raindrop", "delete_raindrop"]);
  });
});
