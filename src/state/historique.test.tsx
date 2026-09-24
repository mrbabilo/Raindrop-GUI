import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppStateProvider, useAppState, type View } from "./appState";

// Audit d'ergonomie du 2026-09-24 : revenir à la collection précédente
// demandait de la retrouver dans la barre latérale, et chaque lancement
// repartait de « Tous ». Un historique (⌘[ / ⌘]) et la dernière vue rouverte.
const DEV: View = { kind: "list", collectionId: 101, label: "Dev" };
const DESIGN: View = { kind: "list", collectionId: 102, label: "Design" };
const RUST: View = { kind: "collection", collectionId: 201, label: "Rust" };

const Harnais = () => {
  const { view, go, reculer, avancer, patchList } = useAppState();
  const aller = (v: View) => () => go(v);
  return (
    <div>
      <span data-testid="view">{view.kind === "list" ? view.label + (view.search ? `?${view.search}` : "") : view.kind === "collection" ? view.label : view.kind}</span>
      <button type="button" onClick={aller(DEV)}>dev</button>
      <button type="button" onClick={aller(DESIGN)}>design</button>
      <button type="button" onClick={aller(RUST)}>rust</button>
      <button type="button" onClick={aller({ kind: "review", items: [], action: { op: "trash" }, sourceLabel: "x", returnView: DESIGN })}>revue</button>
      <button type="button" onClick={aller({ kind: "lecture", raindropId: 1, label: "l", returnView: DESIGN })}>lecture</button>
      <button type="button" onClick={() => patchList({ search: "rust" })}>chercher</button>
      <button type="button" onClick={reculer}>reculer</button>
      <button type="button" onClick={avancer}>avancer</button>
    </div>
  );
};
const vue = () => screen.getByTestId("view").textContent;
const monter = () => render(<AppStateProvider><Harnais /></AppStateProvider>);
const clic = (nom: string) => userEvent.click(screen.getByText(nom));

describe("historique de navigation", () => {
  it("reculer puis avancer : l'aller ET le retour", async () => {
    monter();
    await clic("dev");
    await clic("design");
    await clic("reculer");
    expect(vue()).toBe("Dev");
    await clic("reculer");
    expect(vue()).toBe("Tous");
    await clic("reculer"); // au bout : rien ne bouge
    expect(vue()).toBe("Tous");
    await clic("avancer");
    await clic("avancer");
    expect(vue()).toBe("Design");
    await clic("avancer");
    expect(vue()).toBe("Design");
  });

  it("naviguer après avoir reculé efface l'avenir", async () => {
    monter();
    await clic("dev");
    await clic("design");
    await clic("reculer");
    await clic("rust");
    await clic("avancer");
    expect(vue()).toBe("Rust");
    await clic("reculer");
    expect(vue()).toBe("Dev");
  });

  it("la Revue n'est pas une étape : en sortir ne laisse pas de doublon", async () => {
    monter();
    await clic("design");
    await clic("revue");
    await clic("design"); // le retour de la Revue (goBack)
    await clic("reculer");
    expect(vue()).toBe("Tous");
  });

  it("depuis la lecture, reculer revient à la vue d'origine", async () => {
    monter();
    await clic("design");
    await clic("lecture");
    await clic("reculer");
    expect(vue()).toBe("Design");
    // …et quitter la lecture pour ailleurs garde sa vue d'origine en mémoire.
    await clic("lecture");
    await clic("rust");
    await clic("reculer");
    expect(vue()).toBe("Design");
  });

  it("une recherche fait partie de la vue qu'on retrouve", async () => {
    monter();
    await clic("dev");
    await clic("chercher");
    await clic("design");
    await clic("reculer");
    expect(vue()).toBe("Dev?rust");
  });
});

describe("dernière vue rouverte au lancement", () => {
  it("une collection ouverte est celle qu'on retrouve au relancement", async () => {
    const { unmount } = monter();
    await clic("rust");
    unmount();
    monter();
    expect(vue()).toBe("Rust");
  });

  it("une Revue ou une lecture ne se rouvre pas : on retrouve la liste d'avant", async () => {
    const { unmount } = monter();
    await clic("design");
    await clic("revue");
    unmount();
    monter();
    expect(vue()).toBe("Design");
  });

  it("une valeur illisible au stockage retombe sur « Tous »", () => {
    localStorage.setItem("raindrop-gui-derniere-vue", JSON.stringify({ kind: "review", collectionId: 5, label: "x" }));
    monter();
    expect(vue()).toBe("Tous");
    localStorage.setItem("raindrop-gui-derniere-vue", "pas du json");
    monter();
    expect(screen.getAllByTestId("view").every((e) => e.textContent === "Tous")).toBe(true);
  });
});
