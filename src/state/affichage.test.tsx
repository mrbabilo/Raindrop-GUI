import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppStateProvider, useAppState, type View } from "./appState";

// Audit d'ergonomie du 2026-09-24 : le mode d'affichage et le tri vivaient
// dans la VUE — `go` la remplaçant, choisir la mosaïque ou le tri par titre
// puis cliquer une autre collection ramenait la liste triée par date, et rien
// ne survivait au relancement. Ce sont des PRÉFÉRENCES : elles suivent la
// navigation et la session ; une vue qui porte les siennes (vue sauvegardée)
// les garde.
const Harnais = () => {
  const { view, go, patchList } = useAppState();
  const aller = (v: View) => () => go(v);
  return (
    <div>
      <span data-testid="view">{JSON.stringify(view)}</span>
      <button type="button" onClick={() => patchList({ viewMode: "mosaic", sort: "title" })}>regler</button>
      <button type="button" onClick={aller({ kind: "list", collectionId: 101, label: "Dev" })}>dev</button>
      <button type="button" onClick={aller({ kind: "list", collectionId: 0, label: "Rust", tags: ["rust"], sort: "-created", smartlistId: "sl" })}>vue-sauvee</button>
    </div>
  );
};
const vue = () => JSON.parse(screen.getByTestId("view").textContent!) as Record<string, unknown>;
const monter = () => render(<AppStateProvider><Harnais /></AppStateProvider>);

describe("préférences d'affichage", () => {
  it("le mode et le tri suivent la navigation vers une autre collection", async () => {
    monter();
    await userEvent.click(screen.getByText("regler"));
    await userEvent.click(screen.getByText("dev"));
    expect(vue()).toMatchObject({ collectionId: 101, viewMode: "mosaic", sort: "title" });
  });

  it("une vue qui porte son propre tri le garde — le mode, lui, suit", async () => {
    monter();
    await userEvent.click(screen.getByText("regler"));
    await userEvent.click(screen.getByText("vue-sauvee"));
    expect(vue()).toMatchObject({ sort: "-created", viewMode: "mosaic", smartlistId: "sl" });
  });

  it("elles survivent au relancement", async () => {
    const { unmount } = monter();
    await userEvent.click(screen.getByText("regler"));
    unmount();
    monter();
    expect(vue()).toMatchObject({ collectionId: 0, viewMode: "mosaic", sort: "title" });
  });

  it("témoin : sans réglage, la navigation n'invente rien", async () => {
    monter();
    await userEvent.click(screen.getByText("dev"));
    expect(vue().viewMode).toBeUndefined();
    expect(vue().sort).toBeUndefined();
  });
});
