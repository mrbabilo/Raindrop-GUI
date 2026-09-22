import { useQuery, useQueryClient } from "@tanstack/react-query";
import { t, type FrKey } from "../i18n/fr";
import { api } from "../lib/api";

// Les formes rendues par /api/backup/status, /api/backup/archives et
// /api/jobs — miroirs des interfaces du sidecar (spec sélection §3-§4).
// Posées ici tant qu'un seul consommateur les exige, comme `DuplicateGroups`
// dans useAnalysis : à migrer vers le DTO partagé au besoin.

export interface StatutSauvegarde {
  actif: boolean;
  dossier?: string;
  raison?: string;
  dernier?: { horodatage: string; complet: boolean; count: number } | null;
  instantanes?: number;
}

export interface InventaireArchives {
  ids: number[];
  octets: number;
}

export interface JobEnVol {
  id: string;
  type: string; // "backup" | "archive" | "scan-links" | …
  status: string;
  progress: { done: number; total: number; label: string | null };
}

/** Ce que rend un job d'archivage à sa fin (`ResultatArchivage` du sidecar). */
export interface ResultatArchivage {
  demandes: number;
  faits: number;
  echecs: { id: number; raison: string }[];
  annule: boolean;
  /** Jamais TENTÉS, parce que le budget d'archives était plein. Un compte à
   *  part des échecs : ceux-là ont raté quelque chose, ceux-ci n'ont pas été
   *  essayés — l'écran ne doit pas les confondre. */
  nonTentes: number;
  raisonArret?: string;
}

/** Ce que rend un job de sauvegarde. `bascule` porte la raison d'une escalade
 *  en balayage complet jusqu'à l'interface — le « et le dit » du §6, qui
 *  n'avait jusqu'ici aucun lecteur. */
export interface ResultatSauvegarde {
  horodatage: string;
  complet: boolean;
  count: number;
  bascule?: string;
  /** Ce que le ménage des archives a retiré pendant CE balayage. ABSENT
   *  lorsqu'il n'a rien retiré — jamais deux zéros, qui se liraient comme un
   *  fait vérifié. */
  menage?: { orphelines: number; evincees: number };
}

export const useBackupStatus = () =>
  useQuery({
    queryKey: ["backup", "status"],
    queryFn: () => api.get<StatutSauvegarde>("/api/backup/status"),
    refetchInterval: 15_000,
  });

/** La lecture de l'inventaire, en UN endroit : la requête du hook ET la
 *  décision du clic (`useOuvrirSignet`, qui attend l'inventaire au lieu de
 *  lire `undefined`) la partagent — même route. */
export const chargerInventaire = async () => {
  const inv = await api.get<InventaireArchives>("/api/backup/archives");
  return { octets: inv.octets, set: new Set(inv.ids) };
};

/** L'inventaire en `Set` : le marqueur « Archivé » le teste par identifiant,
 *  à chaque ligne de la liste — un tableau y serait quadratique.
 *
 *  `enabled` sert aux écrans qui n'ont rien à marquer tant que rien n'est
 *  sélectionné : une fiche vide ne demande rien. La requête reste partagée —
 *  react-query la sert du cache dès qu'un autre écran l'a faite. */
export const useArchives = (options?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ["backup", "archives"],
    queryFn: chargerInventaire,
    staleTime: 60_000,
    enabled: options?.enabled ?? true,
  });

export const useJobsEnVol = () =>
  useQuery({
    queryKey: ["jobs"],
    queryFn: () => api.get<JobEnVol[]>("/api/jobs"),
    refetchInterval: 5_000,
  });

/** Après un job d'archivage ET après chaque sauvegarde : `purgerOrphelins`
 *  tourne à la fin d'un balayage complet et peut réduire l'inventaire en
 *  silence (spec sélection §4.1). Distinguer le mode pour épargner une
 *  requête locale n'en vaudrait pas la peine. */
export const useInvalidateSauvegarde = () => {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ["backup"] });
  };
};

// ─── Formatage ───────────────────────────────────────────────────────────────

export function formatterOctets(n: number): string {
  if (n < 2 ** 10) return `${n} o`;
  if (n < 2 ** 20) return `${Math.round(n / 2 ** 10)} Ko`;
  if (n < 2 ** 30) return `${Math.round(n / 2 ** 20)} Mo`;
  return `${(n / 2 ** 30).toFixed(1)} Go`;
}

/** La file espace les appels de 550 ms (CLAUDE.md : ≈ 109 req/min, sous le
 *  plafond de 120). C'est une constante de NOTRE conception — la seule base
 *  honnête pour annoncer une durée, puisqu'elle ne dépend d'aucune mesure
 *  faite sur une bibliothèque particulière. */
const SECONDES_PAR_REQUETE = 0.55;

/** 50 items par page : la pagination de l'API (CLAUDE.md). */
const ITEMS_PAR_PAGE = 50;

function formatterDuree(secondes: number): string {
  if (secondes < 120) return t("sauvegarde.duree.s", { n: Math.ceil(secondes) });
  return t("sauvegarde.duree.min", { n: Math.ceil(secondes / 60) });
}

/** Deux requêtes par copie (spec sélection §4.2) : annoncer la durée est la
 *  seule façon honnête de proposer une action qui peut tenir des dizaines de
 *  minutes. */
export function dureeEstimee(n: number): string {
  return formatterDuree(n * 2 * SECONDES_PAR_REQUETE);
}

/**
 * Ce que coûte un balayage complet, CALCULÉ sur la bibliothèque réelle — une
 * page de 50 par requête, plus la corbeille et les trois auxiliaires.
 *
 * Jamais de chiffres en dur : « 2 min 20 » n'était vrai que pour la
 * bibliothèque sur laquelle la mesure avait été faite, et cessait de l'être
 * dès qu'elle changeait de taille.
 */
export function coutBalayage(nombreDeSignets: number): { requetes: number; duree: string } {
  const requetes = Math.ceil(nombreDeSignets / ITEMS_PAR_PAGE) + 4;
  return { requetes, duree: formatterDuree(requetes * SECONDES_PAR_REQUETE) };
}

/** `2026-09-18T08-15-12` (UTC, le nom de dossier d'un instantané) → date
 *  lisible en heure locale. Un horodatage illisible se rend tel quel plutôt
 *  que de devenir « Invalid Date » à l'écran. */
export function formatterHorodatage(h: string): string {
  const d = new Date(`${h.slice(0, 10)}T${h.slice(11).replace(/-/g, ":")}Z`);
  return Number.isNaN(d.getTime()) ? h : d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

/** Les clés de progression émises par le sidecar, traduites — même motif que
 *  `ETAT_MCP` dans Reglages : le `satisfies` garantit que chaque valeur est
 *  une clé réelle du dictionnaire, et le contrôle `in` rattrape une clé que
 *  le sidecar ajouterait sans prévenir (elle s'afficherait sinon brute, comme
 *  un identifiant interne à l'écran). */
export const LABELS_PROGRESSION = {
  bookmarks: "sauvegarde.progress.bookmarks",
  modifies: "sauvegarde.progress.modifies",
  corbeille: "sauvegarde.progress.corbeille",
  collections: "sauvegarde.progress.collections",
  surlignages: "sauvegarde.progress.surlignages",
  profil: "sauvegarde.progress.profil",
} as const satisfies Record<string, FrKey>;

export function libelleProgression(label: string | null): string | null {
  if (label === null) return null;
  return label in LABELS_PROGRESSION
    ? t(LABELS_PROGRESSION[label as keyof typeof LABELS_PROGRESSION])
    : null;
}
