// Le journal sidecar, côté front (Réglages, 2026-09-20) : le chargement par
// l'API locale et la mise en forme lisible. Le format est la seule partie
// chargée de plaire : « 10:05:06 · corbeille · id=12 · from=42 ».
import { api } from "./api";

export interface EntreeJournal {
  ts: string;
  level?: string;
  msg: string;
  [champ: string]: unknown;
}

export async function chargerJournal(): Promise<EntreeJournal[]> {
  const corps = await api.get<{ entries: EntreeJournal[] }>("/api/journal");
  return corps.entries;
}

/** Un ts illisible se rend TEL QUEL — jamais « Invalid Date » (même parti
 *  que formatterHorodatage). */
function heureDe(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime())
    ? ts
    : d.toLocaleTimeString("fr-FR", { hour12: false });
}

const stringifier = (v: unknown): string =>
  typeof v === "string" ? v : JSON.stringify(v);

export function formatterEntree(e: EntreeJournal): string {
  const champs = Object.entries(e)
    .filter(([k]) => k !== "ts" && k !== "level" && k !== "msg")
    .map(([k, v]) => `${k}=${stringifier(v)}`);
  return [heureDe(e.ts), e.msg, ...champs].join(" · ");
}
