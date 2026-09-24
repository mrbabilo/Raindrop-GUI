import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
// fixtures AVANT BulkBar (TDZ — la factory vi.mock référence `collections`).
import { raindrop, collections } from "../test/fixtures";
import { BulkBar } from "./BulkBar";
import { AppStateProvider, useAppState } from "../state/appState";

// Audit d'ergonomie du 2026-09-24, écart spec §115 : la barre avait perdu
// « Déplacer » — déplacer plusieurs signets n'existait qu'à la SOURIS. Et la
// corbeille passait par la Revue alors que l'avis et son Annuler la rendent
// défaisable (spec §4.3 amendée). Les deux verbes s'exécutent désormais là,
// par `agir` (les verbes du dépôt, testés dans useDragBookmark.agir.test).
vi.mock("../hooks/useStaticData", () => ({ useCollections: () => ({ data: collections }) }));
vi.mock("../lib/api", () => ({ api: { send: vi.fn(), get: vi.fn() } }));

const agir = vi.fn(async (_ids: number[], _cible: unknown) => true);
beforeEach(() => agir.mockReset().mockResolvedValue(true));

const Spy = () => {
  const { view, selectedIds } = useAppState();
  return (
    <>
      <span data-testid="view">{view.kind}</span>
      <span data-testid="sel">{[...selectedIds].join(",")}</span>
    </>
  );
};
const Preparer = ({ corbeille }: { corbeille: boolean }) => {
  const { toggleSelect, go } = useAppState();
  return (
    <button type="button" onClick={() => {
      if (corbeille) go({ kind: "list", collectionId: -99, label: "Corbeille" });
      toggleSelect(1000);
      toggleSelect(1001);
    }}>pre</button>
  );
};
const items = [raindrop({ id: 1000 }), raindrop({ id: 1001, title: "B", url: "https://b.example", collectionId: 102 })];

const monter = async (corbeille = false) => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppStateProvider><Spy /><Preparer corbeille={corbeille} /><BulkBar items={items} agir={agir} /></AppStateProvider>
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByText("pre"));
};

describe("BulkBar — corbeille et déplacement exécutés là, sans Revue", () => {
  it("« Mettre à la corbeille » exécute, reste dans la liste, et vide la sélection au succès", async () => {
    await monter();
    await userEvent.click(screen.getByRole("button", { name: "Mettre à la corbeille" }));
    expect(agir).toHaveBeenCalledWith([1000, 1001], { sorte: "corbeille" });
    expect(screen.getByTestId("view").textContent).toBe("list");
    expect(screen.getByTestId("sel").textContent).toBe("");
  });

  it("un échec garde la sélection, prête à réessayer", async () => {
    agir.mockResolvedValueOnce(false);
    await monter();
    await userEvent.click(screen.getByRole("button", { name: "Mettre à la corbeille" }));
    expect(screen.getByTestId("sel").textContent).toBe("1000,1001");
  });

  it("« Déplacer » : inerte sans destination, puis déplace vers la collection choisie — au clavier", async () => {
    await monter();
    const deplacer = screen.getByRole("button", { name: "Déplacer" });
    expect(deplacer).toBeDisabled();
    const destination = screen.getByRole("combobox", { name: "Destination" });
    // Une sous-collection se nomme par son chemin (« Dev › Rust »).
    expect(screen.getByRole("option", { name: "Dev › Rust" })).toBeInTheDocument();
    await userEvent.selectOptions(destination, "102");
    expect(deplacer).toBeEnabled();
    deplacer.focus();
    await userEvent.keyboard("{Enter}");
    expect(agir).toHaveBeenCalledWith([1000, 1001], { sorte: "collection", id: 102 });
    expect(screen.getByTestId("sel").textContent).toBe("");
  });

  it("« Non classés » est une destination", async () => {
    await monter();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Destination" }), "-1");
    await userEvent.click(screen.getByRole("button", { name: "Déplacer" }));
    expect(agir).toHaveBeenCalledWith([1000, 1001], { sorte: "collection", id: -1 });
  });

  it("en corbeille, « Déplacer » fait sortir vers la destination choisie (origine inconnue comprise)", async () => {
    await monter(true);
    expect(screen.getByRole("button", { name: "Restaurer (2)" })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Destination" }), "101");
    await userEvent.click(screen.getByRole("button", { name: "Déplacer" }));
    expect(agir).toHaveBeenCalledWith([1000, 1001], { sorte: "collection", id: 101 });
  });
});
