import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { DeadRow, DuplicateGroupCard, RedirectRow, TrashRow } from "./CleanupRows";
import { AppStateProvider, useAppState } from "../state/appState";
import type { LinkEnrichi } from "./CleanupRows";
import type { RaindropItem } from "../../shared/types";

// Le clic des lignes de Nettoyage ouvre la FICHE — comme la liste principale
// l'a toujours fait : une ligne qui représente un signet ressemble partout à
// la même chose, en rendre la moitié inerte fait douter de l'autre. Les
// CONTRÔLES internes (case, bouton, lien, select) ne doivent JAMAIS ouvrir
// la fiche en prime : cocher n'est pas regarder.

const lien = (partiel: Partial<LinkEnrichi> = {}): LinkEnrichi => ({
  raindropId: 9,
  url: "https://exemple.fr/a",
  title: "Lien concerné",
  collectionId: 7,
  status: "dead",
  httpStatus: 404,
  redirectChain: null,
  finalUrl: null,
  redirectKind: null,
  reason: "http_404",
  checkedAt: "2026-09-20T10:00:00Z",
  ...partiel,
});

const item = (partiel: Partial<RaindropItem> = {}): RaindropItem => ({
  id: 12,
  url: "https://exemple.fr/d",
  title: "Corbeillé",
  excerpt: "",
  note: "",
  domain: "exemple.fr",
  tags: [],
  created: "2025-01-01T00:00:00Z",
  lastUpdate: "2025-01-01T00:00:00Z",
  important: false,
  type: "link",
  cover: null,
  collectionId: -99,
  cache: null,
  broken: false,
  highlights: [],
  ...partiel,
});

const grappe = {
  key: "k",
  kind: "exact" as const,
  items: [
    { id: 1, url: "https://x/1", title: "Gardée (la plus ancienne)", collectionId: 7, created: "2024-01-01T00:00:00Z" },
    { id: 2, url: "https://x/2", title: "Copie", collectionId: 7, created: "2025-01-01T00:00:00Z" },
  ],
};

// Une SONDE du détail ouvert — le contrat se lit sur l'état réel de l'app,
// pas sur un mock de navigation.
const Sonde = () => {
  const { selectedRaindropId } = useAppState();
  return <span data-testid="detail">{selectedRaindropId ?? "rien"}</span>;
};

const rendu = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppStateProvider>
        {ui}
        <Sonde />
      </AppStateProvider>
    </QueryClientProvider>,
  );

const detail = () => screen.getByTestId("detail").textContent;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("les lignes de Nettoyage ouvrent la fiche", () => {
  it("doublons : un clic sur la ligne ouvre le signet — cocher, non", async () => {
    const basculer = vi.fn();
    rendu(
      <DuplicateGroupCard
        g={grappe}
        titreRacine={() => undefined}
        cochees={new Set()}
        basculer={basculer}
        definir={() => undefined}
        surRevue={() => undefined}
      />,
    );
    await userEvent.click(screen.getByText("Copie"));
    expect(detail()).toBe("2");
    // La ligne ouverte porte la surface `sel`, comme la liste principale.
    expect(screen.getByText("Copie").closest("[data-nav]")).toHaveClass("bg-app-sel");
    // Cocher une case est un geste de TRI, jamais un regard.
    await userEvent.click(screen.getByRole("checkbox", { name: /Copie/ }));
    expect(basculer).toHaveBeenCalledWith(2);
    expect(detail()).toBe("2"); // inchangé — la case n'a pas ouvert autre chose
  });

  it("doublons : le bouton de corbeille n'ouvre pas la fiche", async () => {
    rendu(
      <DuplicateGroupCard
        g={grappe}
        titreRacine={() => undefined}
        cochees={new Set([2])}
        basculer={() => undefined}
        definir={() => undefined}
        surRevue={() => undefined}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Corbeille \(1\)/ }));
    expect(detail()).toBe("rien");
  });

  it("lien mort : un clic ouvre — le lien Wayback, non", async () => {
    rendu(<DeadRow r={lien()} collectionRacine="Dev" />);
    await userEvent.click(screen.getByText("Lien concerné"));
    expect(detail()).toBe("9");
    await userEvent.click(screen.getByRole("link", { name: /Chercher une copie archivée/ }));
    expect(detail()).toBe("9"); // le lien externe n'a pas changé le regard
  });

  it("redirection : un clic ouvre — « Remplacer par l'URL finale », non", async () => {
    rendu(<RedirectRow r={lien({ status: "redirect", redirectKind: "permanent", finalUrl: "https://exemple.fr/b" })} />);
    await userEvent.click(screen.getByText("Lien concerné"));
    expect(detail()).toBe("9");
    await userEvent.click(screen.getByRole("button", { name: /Remplacer/ }));
    expect(detail()).toBe("9");
  });

  it("corbeille : un clic ouvre — « Restaurer », non", async () => {
    rendu(<TrashRow r={item()} />);
    await userEvent.click(screen.getByText("Corbeillé"));
    expect(detail()).toBe("12");
    await userEvent.click(screen.getByRole("button", { name: /Restaurer/ }));
    expect(detail()).toBe("12");
  });
});
