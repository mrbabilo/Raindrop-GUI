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

vi.mock("../hooks/useRaindrops", () => ({
  useRaindrops: () => ({
    data: { pages: [{ items: pagesRef.items, count: pagesRef.items.length, page: 0, perPage: 50 }] },
  }),
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
