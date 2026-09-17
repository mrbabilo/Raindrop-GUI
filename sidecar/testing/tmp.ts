import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

// Répertoires temporaires de test, RENDUS au système.
//
// Huit fichiers en créaient sans jamais les effacer : chaque exécution de la
// suite en abandonnait une poignée dans le dossier temporaire, et rien ne les
// ramassait — plusieurs milliers s'y étaient accumulés. Le `afterAll` est
// enregistré par vitest dans le fichier de test qui importe ce module, donc
// le nettoyage suit la suite qui a créé les répertoires.
const crees: string[] = [];

afterAll(() => {
  for (const d of crees) rmSync(d, { recursive: true, force: true });
  crees.length = 0;
});

/** Un répertoire temporaire effacé à la fin de la suite. */
export function repertoireTemporaire(prefixe: string): string {
  const d = mkdtempSync(join(tmpdir(), prefixe));
  crees.push(d);
  return d;
}
