import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { ChargePlus } from "./ChargePlus";

// L'IntersectionObserver de jsdom n'existe pas : on le remplace par un faux
// qui retient ses cibles et permet de DÉCLENCHER l'intersection à la main.
const observeurs: { cb: IntersectionObserverCallback; el: Element }[] = [];
class FauxIO {
  constructor(private cb: IntersectionObserverCallback) {}
  observe(el: Element) { observeurs.push({ cb: this.cb, el }); }
  disconnect() { /* le composant débranche le précédent à chaque rendu */ }
}
const entrerDansLeChamp = () => {
  // Le DERNIER observeur est celui du rendu courant — c'est lui qui verrait
  // réellement l'intersection.
  const o = observeurs[observeurs.length - 1];
  o?.cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
};

beforeEach(() => {
  observeurs.length = 0;
  vi.stubGlobal("IntersectionObserver", FauxIO);
});

describe("ChargePlus", () => {
  it("sans page suivante, aucune sentinelle n'est posée", () => {
    const { container } = render(
      <ChargePlus q={{ hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn() }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("demande la page suivante quand la sentinelle entre dans le champ", () => {
    const fetchNextPage = vi.fn();
    render(<ChargePlus q={{ hasNextPage: true, isFetchingNextPage: false, fetchNextPage }} />);
    entrerDansLeChamp();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  // Le défaut mesuré dans la fenêtre Tauri : CINQ requêtes pour la même page
  // sur un seul défilement. L'observeur est recréé à chaque rendu, or
  // `fetchNextPage` en provoque un — il se réarmait sur une sentinelle
  // toujours dans le champ et rappelait. La file du sidecar étant
  // séquentielle, ces doublons affamaient le reste de l'écran.
  it("ne redemande RIEN tant que la page précédente est en vol", () => {
    const fetchNextPage = vi.fn();
    const { rerender } = render(
      <ChargePlus q={{ hasNextPage: true, isFetchingNextPage: false, fetchNextPage }} />,
    );
    entrerDansLeChamp();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);

    // Le rendu que `fetchNextPage` provoque : la requête est EN VOL.
    rerender(<ChargePlus q={{ hasNextPage: true, isFetchingNextPage: true, fetchNextPage }} />);
    entrerDansLeChamp();
    entrerDansLeChamp();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);

    // Une fois retombée, la suivante peut repartir — sans quoi le défilement
    // infini s'arrêterait au bout d'une page.
    rerender(<ChargePlus q={{ hasNextPage: true, isFetchingNextPage: false, fetchNextPage }} />);
    entrerDansLeChamp();
    expect(fetchNextPage).toHaveBeenCalledTimes(2);
  });
});
