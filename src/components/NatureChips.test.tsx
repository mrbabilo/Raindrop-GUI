import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { raindrop } from "../test/fixtures";
import { NatureChips } from "./NatureChips";
import { AppStateProvider, useAppState } from "../state/appState";

// Items renvoyés par le mock de useRaindrops — un ref plutôt qu'une closure
// pour rester modifiable entre `it` sans redéfinir le mock (piège TDZ des
// factories vi.mock : voir ListPane.test.tsx).
const pagesRef = vi.hoisted(() => ({ items: [] as ReturnType<typeof import("../test/fixtures").raindrop>[] }));

// Le mock simule le filtrage serveur par `media` (sidecar/api/routes/
// raindrops.ts) : un arg avec `media` défini ne renvoie que les items de
// cette nature. Ainsi un test peut vérifier, sans lire l'argument passé à
// useRaindrops, que NatureChips compte bien sur la vue NON filtrée
// (omitMedia, R6bP-1) — si ce n'était plus le cas, le mock collapserait
// les fréquences des autres natures à zéro, exactement comme le ferait le
// vrai sidecar.
vi.mock("../hooks/useRaindrops", () => ({
  useRaindrops: (args: { media?: string } = {}) => {
    const items = args.media ? pagesRef.items.filter((it) => it.type === args.media) : pagesRef.items;
    return { data: { pages: [{ items, count: items.length, page: 0, perPage: 50 }] } };
  },
}));

// Harnais minimal : NatureChips ne possède pas le champ de recherche (il vit
// dans TopBar) — on reproduit ici le focus/blur que TopBar lui délègue via
// la prop `focused`, sans dupliquer TopBar.tsx.
function Harness({ initialFocused = false }: { initialFocused?: boolean }) {
  const [focused, setFocused] = useState(initialFocused);
  return (
    <>
      <input aria-label="Rechercher…" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
      <NatureChips focused={focused} />
    </>
  );
}

const Spy = () => {
  const { view } = useAppState();
  return <span data-testid="view">{view.kind === "list" ? JSON.stringify(view) : ""}</span>;
};

const renderChips = (initialFocused = false) =>
  render(
    <AppStateProvider>
      <Spy />
      <Harness initialFocused={initialFocused} />
    </AppStateProvider>,
  );

describe("NatureChips", () => {
  it("masquées au repos, visibles au focus du champ de recherche", () => {
    pagesRef.items = [];
    renderChips();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    fireEvent.focus(screen.getByLabelText("Rechercher…"));
    expect(screen.getAllByRole("button")).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Liens" })).toBeInTheDocument();
  });

  it("ordonnées par fréquence décroissante des items chargés dans la vue", () => {
    pagesRef.items = [raindrop({ type: "video" }), raindrop({ type: "video" }), raindrop({ type: "video" }), raindrop({ type: "article" })];
    renderChips(true);
    const names = screen.getAllByRole("button").map((b) => b.textContent);
    expect(names.indexOf("Vidéos")).toBeLessThan(names.indexOf("Articles"));
    expect(names[0]).toBe("Vidéos");
  });

  it("liste vide : retombe sur l'ordre du tableau §2.1 (Liens en premier)", () => {
    pagesRef.items = [];
    renderChips(true);
    const names = screen.getAllByRole("button").map((b) => b.textContent);
    expect(names[0]).toBe("Liens");
  });

  it("R6bP-1 : le comptage reste sur la vue non filtrée après activation d'une nature", async () => {
    // video×3, article×1, image×1 : avant activation, l'ordre correct est
    // Vidéos, Articles, Images (fréquence), puis Liens/Documents/Audio (0,
    // ordre §2.1). Si NatureChips comptait sur la vue déjà filtrée par
    // `media` (la régression que `{ omitMedia: true }` empêche), le mock —
    // qui simule le filtrage serveur — ne renverrait plus que les items
    // "video" une fois le filtre actif : Articles et Images retomberaient à
    // zéro et perdraient leur rang face à Liens (également à zéro, mais qui
    // le précède dans le tableau §2.1). C'est cette perte de rang, visible
    // par l'utilisateur, que ce test détecte — pas la forme de l'appel.
    pagesRef.items = [
      raindrop({ type: "video" }), raindrop({ type: "video" }), raindrop({ type: "video" }),
      raindrop({ type: "article" }),
      raindrop({ type: "image" }),
    ];
    renderChips(true);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Vidéos" }));
    const names = screen.getAllByRole("button").map((b) => b.textContent);
    expect(names[1]).toBe("Articles");
    expect(names[2]).toBe("Images");
  });

  it("clic = bascule le filtre de nature", async () => {
    pagesRef.items = [raindrop({ type: "video" })];
    renderChips(true);
    const user = userEvent.setup();
    const bouton = screen.getByRole("button", { name: "Vidéos" });
    expect(bouton).toHaveAttribute("aria-pressed", "false");
    await user.click(bouton);
    expect(bouton).toHaveAttribute("aria-pressed", "true");
    expect(JSON.parse(screen.getByTestId("view").textContent!)).toMatchObject({ media: "video" });
    await user.click(bouton);
    expect(bouton).toHaveAttribute("aria-pressed", "false");
    expect(JSON.parse(screen.getByTestId("view").textContent!).media).toBeUndefined();
  });
});
