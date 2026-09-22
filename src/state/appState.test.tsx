import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppStateProvider, useAppState, type View } from "./appState";

// Harnais : des boutons qui déclenchent les actions, un Spy qui montre la
// vue — les tests lisent l'EFFET (la vue), jamais l'état interne.
const liste: View = {
  kind: "list", collectionId: 0, label: "Rust",
  tags: ["rust"], search: "borrows", smartlistId: "sl-1",
};

const Harnais = () => {
  const { view, patchList, forgetSmartList } = useAppState();
  return (
    <div>
      <span data-testid="view">{JSON.stringify(view)}</span>
      <button type="button" onClick={() => patchList({ search: "x" })}>patch-filtre</button>
      <button type="button" onClick={() => patchList({ viewMode: "mosaic" })}>patch-mode</button>
      <button type="button" onClick={() => forgetSmartList("sl-1")}>oublie-bonne</button>
      <button type="button" onClick={() => forgetSmartList("sl-autre")}>oublie-autre</button>
    </div>
  );
};

const vue = () => JSON.parse(screen.getByTestId("view").textContent!) as Record<string, unknown>;

const renderHarnais = (initiale: View) => {
  const Ouverture = () => {
    const { go } = useAppState();
    return <button type="button" onClick={() => go(initiale)}>ouvre</button>;
  };
  render(<AppStateProvider><Ouverture /><Harnais /></AppStateProvider>);
  return userEvent.click(screen.getByText("ouvre"));
};

describe("smartlistId dans l'état", () => {
  it("le go porte l'identifiant", async () => {
    await renderHarnais(liste);
    expect(vue()).toMatchObject({ smartlistId: "sl-1", tags: ["rust"] });
  });

  // « La surlignage ne survit pas à la divergence » (spec §5) : tout patch
  // de filtre efface la marque — la vue n'est plus LA smart list.
  it("un patch de filtre efface smartlistId, les filtres restent", async () => {
    await renderHarnais(liste);
    await userEvent.click(screen.getByText("patch-filtre"));
    const v = vue();
    expect(v.smartlistId).toBeUndefined();
    expect(v.tags).toEqual(["rust"]); // les filtres restent : c'est une vue, pas un fichier
  });

  // La bascule d'affichage n'est pas un filtre : la vue reste la smart list.
  it("un patch viewMode seul GARDE smartlistId", async () => {
    await renderHarnais(liste);
    await userEvent.click(screen.getByText("patch-mode"));
    expect(vue()).toMatchObject({ smartlistId: "sl-1", viewMode: "mosaic" });
  });

  // Supprimer la smart list ouverte : la liste filtrée reste, la marque
  // s'en va (spec §5). Une autre id supprimée ne touche à rien.
  it("forgetSmartList de la vue ouverte efface la marque ; une autre id est sans effet", async () => {
    await renderHarnais(liste);
    await userEvent.click(screen.getByText("oublie-autre"));
    expect(vue()).toMatchObject({ smartlistId: "sl-1" });
    await userEvent.click(screen.getByText("oublie-bonne"));
    const v = vue();
    expect(v.smartlistId).toBeUndefined();
    expect(v.search).toBe("borrows");
  });
});
