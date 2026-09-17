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
  // « Recharger » force un rendu après une mutation de pagesRef : c'est ainsi
  // qu'un test simule une vue dont le contenu change sous une puce active.
  const [, forcer] = useState(0);
  return (
    <>
      <input aria-label="Rechercher…" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
      <button type="button" onClick={() => forcer((n) => n + 1)}>Recharger</button>
      <NatureChips focused={focused} />
    </>
  );
}

// Les puces, sans le bouton « Recharger » du harnais.
const puces = () => screen.getAllByRole("button").filter((b) => b.textContent !== "Recharger");
const nomsPuces = () => puces().map((b) => b.textContent);

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
    pagesRef.items = [raindrop({ type: "link" })];
    renderChips();
    expect(puces()).toHaveLength(0);
    fireEvent.focus(screen.getByLabelText("Rechercher…"));
    expect(screen.getByRole("button", { name: "Liens" })).toBeInTheDocument();
  });

  // DESIGN.md §9 « masqué si nul » l'emporte sur l'ancien repli de §11 : une
  // puce qui ne filtre rien est du bruit — cliquer dessus viderait la liste.
  it("seules les natures présentes dans la vue sont posées (§9)", () => {
    pagesRef.items = [raindrop({ type: "video" }), raindrop({ type: "article" })];
    renderChips(true);
    expect(nomsPuces().sort()).toEqual(["Articles", "Vidéos"]);
    expect(screen.queryByRole("button", { name: "Documents" })).not.toBeInTheDocument();
  });

  // Sans cette exception, poser un filtre puis tomber à zéro résultat
  // ferait disparaître la seule commande capable de le retirer.
  it("une puce active reste posée même retombée à zéro", async () => {
    pagesRef.items = [raindrop({ type: "video" }), raindrop({ type: "article" })];
    renderChips(true);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Vidéos" }));
    pagesRef.items = [];
    await user.click(screen.getByRole("button", { name: "Recharger" }));
    expect(screen.getByRole("button", { name: "Vidéos" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Articles" })).not.toBeInTheDocument();
  });

  it("ordonnées par fréquence décroissante des items chargés dans la vue", () => {
    pagesRef.items = [raindrop({ type: "video" }), raindrop({ type: "video" }), raindrop({ type: "video" }), raindrop({ type: "article" })];
    renderChips(true);
    const names = nomsPuces();
    expect(names.indexOf("Vidéos")).toBeLessThan(names.indexOf("Articles"));
    expect(names[0]).toBe("Vidéos");
  });

  it("liste vide : aucune puce, pas même au focus (§9)", () => {
    pagesRef.items = [];
    renderChips(true);
    expect(puces()).toHaveLength(0);
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
    const names = nomsPuces();
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
