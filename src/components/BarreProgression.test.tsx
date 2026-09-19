import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BarreProgression } from "./BarreProgression";

// Le temps est PILOTÉ : l'estimation repose sur des intervalles réels, et un
// test qui attendrait vraiment 30 s serait aussi le premier à tomber sous
// charge (piège consigné dans CLAUDE.md).
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-19T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const avancer = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));

describe("BarreProgression", () => {
  it("un total inconnu n'affiche AUCUNE barre", () => {
    // La présence d'abord : avec un total, la barre existe.
    const { rerender } = render(<BarreProgression done={5} total={10} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    // Sans total, une barre serait soit figée, soit inventée.
    rerender(<BarreProgression done={5} total={0} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("le temps restant n'apparaît QUE lorsqu'il vaut quelque chose", () => {
    const { rerender } = render(<BarreProgression done={0} total={1000} />);
    // Un seul point : aucun débit, donc rien d'affiché. Promettre un temps
    // calculé sur deux points collés se lirait pourtant comme une promesse.
    expect(screen.queryByText(/environ|moins d'une minute/)).toBeNull();
    avancer(10_000);
    rerender(<BarreProgression done={100} total={1000} />);
    // 100 en 10 s → 10/s ; il en reste 900 → 90 s → « environ 2 minutes ».
    expect(screen.getByText(/environ 2 minutes/)).toBeInTheDocument();
  });

  // ⚠️ Ces deux tests ne valent que par le CHIFFRE qu'ils attendent. Une
  // première version se contentait de vérifier que l'estimation disparaissait
  // au changement d'étape — et le sabotage l'a montrée creuse : en retirant
  // toute remise à zéro, elle disparaissait quand même, parce qu'un delta nul
  // suffit à la taire. Ce qui distingue vraiment les deux conceptions, c'est
  // le débit calculé ENSUITE : sur les seuls points de la nouvelle étape, ou
  // sur un mélange des deux.
  it("changer d'ÉTAPE oublie le débit de la précédente", () => {
    const { rerender } = render(<BarreProgression done={0} total={1000} cle="lecture" />);
    avancer(10_000);
    rerender(<BarreProgression done={900} total={1000} cle="lecture" />); // 90/s, rapide
    // Étape suivante, bien plus lente : 100 en 10 s, soit 10/s. Il reste 900,
    // donc 90 s — « environ 2 minutes ».
    rerender(<BarreProgression done={0} total={1000} cle="vérification" />);
    avancer(10_000);
    rerender(<BarreProgression done={100} total={1000} cle="vérification" />);
    // Sans l'oubli, la moyenne des deux étapes donnerait 5/s, soit 180 s —
    // « environ 3 minutes ». Le débit d'une étape ne dit rien de la suivante.
    expect(screen.getByText(/environ 2 minutes/)).toBeInTheDocument();
  });

  it("un numérateur qui RECULE oublie ce qui précède", () => {
    // Le rejeu du balayage ramène `done` en arrière (spec §3) : les
    // échantillons d'avant décrivent un travail qu'on refait.
    const { rerender } = render(<BarreProgression done={0} total={1000} cle="x" />);
    avancer(10_000);
    rerender(<BarreProgression done={500} total={1000} cle="x" />); // 50/s
    rerender(<BarreProgression done={0} total={1000} cle="x" />); // reprise
    avancer(10_000);
    rerender(<BarreProgression done={100} total={1000} cle="x" />); // 10/s
    expect(screen.getByText(/environ 2 minutes/)).toBeInTheDocument();
  });

  it("la barre ne dépasse jamais ses bornes", () => {
    const { rerender } = render(<BarreProgression done={1500} total={1000} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    rerender(<BarreProgression done={-5} total={1000} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });
});
