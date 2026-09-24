// Les PRÉFÉRENCES d'affichage — mode liste/mosaïque et tri — retenues d'une
// collection à l'autre et d'une session à l'autre (audit d'ergonomie du
// 2026-09-24). Même motif que `panneaux.ts` : lecture défensive, écriture
// qui n'explose jamais (mode privé, stockage refusé).
const CLE = "raindrop-gui-affichage";

export interface Affichage {
  viewMode?: "list" | "mosaic";
  sort?: string;
}

export function lireAffichage(): Affichage {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) ?? "{}") as Record<string, unknown>;
    return {
      ...(brut.viewMode === "list" || brut.viewMode === "mosaic" ? { viewMode: brut.viewMode } : {}),
      ...(typeof brut.sort === "string" ? { sort: brut.sort } : {}),
    };
  } catch {
    return {};
  }
}

export function ecrireAffichage(a: Affichage): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(a));
  } catch {
    /* stockage indisponible : la préférence vaut pour la session */
  }
}
