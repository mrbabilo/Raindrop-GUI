import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
// fixtures AVANT BulkBar (TDZ — même piège que DetailPane.test : la factory
// vi.mock, hisée au-dessus des imports, référence `collections`).
import { raindrop, collections } from "../test/fixtures";
import { BulkBar } from "./BulkBar";
import { AppStateProvider, useAppState } from "../state/appState";

// L'arbre sert le <select> de destination : mocké comme dans DetailPane.test
// — aucun fetch réseau dans un test de composant.
vi.mock("../hooks/useStaticData", () => ({ useCollections: () => ({ data: collections }) }));

// Spy étendu (R9P-1) : expose la vue ET la sélection — la Revue « consomme »
// la sélection, chaque action doit laisser selectedIds vide. Même pattern
// Spy que Task 5-8 : asserté hors de App.
const Spy = () => {
  const { view, selectedIds } = useAppState();
  // R15P-3 : le Spy expose aussi returnView — la vue d'origine voyagée vers
  // la Revue, dont App déduit le retour après exécution.
  const revue = view.kind === "review"
    ? JSON.stringify({ items: view.items.map((i) => i.id), action: view.action, sourceLabel: view.sourceLabel, returnView: view.returnView })
    : view.kind;
  return (
    <>
      <span data-testid="view">{revue}</span>
      <span data-testid="sel">{[...selectedIds].join(",")}</span>
    </>
  );
};

// Helper de test : précoche la sélection (deux dispatch toggleSelect dans le
// même handler — useReducer les applique séquentiellement).
const Preselect = ({ ids }: { ids: number[] }) => {
  const { toggleSelect } = useAppState();
  return <button type="button" onClick={() => ids.forEach((id) => toggleSelect(id))}>pre</button>;
};

const items = [
  raindrop({ id: 1000 }),
  raindrop({ id: 1001, title: "B", url: "https://b.example", collectionId: 102 }),
];

const renderBar = async (ids: number[]) => {
  const r = render(
    <QueryClientProvider client={new QueryClient()}>
      <AppStateProvider>
        <Spy />
        <Preselect ids={ids} />
        <BulkBar items={items} />
      </AppStateProvider>
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByText("pre"));
  return r;
};

describe("BulkBar", () => {
  it("invisible sans sélection", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AppStateProvider>
          <BulkBar items={items} />
        </AppStateProvider>
      </QueryClientProvider>,
    );
    expect(screen.queryByRole("button", { name: "Corbeille" })).not.toBeInTheDocument();
  });

  // R15P-2 : le compteur dit ce que la Revue embarquera — les items de la
  // page réellement sélectionnés (selected.length), pas selectedIds.size qui
  // peut déborder la page chargée (ici 999 n'existe pas dans `items`).
  it("compteur honnête : seuls les items de la page embarqués sont comptés (R15P-2)", async () => {
    await renderBar([1000, 999]);
    expect(screen.getByText("1 sélectionné(s)")).toBeInTheDocument();
  });

  it("corbeille → vue review avec les items sélectionnés, sélection consommée (R9P-1)", async () => {
    await renderBar([1000, 1001]);
    await userEvent.click(screen.getByRole("button", { name: "Corbeille" }));
    const revue = JSON.parse(screen.getByTestId("view").textContent!);
    expect(revue.items).toEqual([1000, 1001]);
    expect(revue.action).toEqual({ op: "trash" });
    expect(revue.sourceLabel).toBe("sélection");
    // R15P-3 : la vue list courante voyage en returnView — le retour après
    // exécution reviendra ici.
    expect(revue.returnView).toEqual({ kind: "list", collectionId: 0, label: "Tous" });
    // R9P-1 : le clear est chirurgical (après le go), pas général — la
    // sélection est vidée PAR l'action, la barre se démonte d'elle-même.
    expect(screen.getByTestId("sel").textContent).toBe("");
    expect(screen.queryByRole("button", { name: "Corbeille" })).not.toBeInTheDocument();
  });

  it("déplacer demande la collection destination, sélection consommée (R9P-1)", async () => {
    await renderBar([1000, 1001]);
    const deplacer = screen.getByRole("button", { name: "Déplacer" });
    expect(deplacer).toBeDisabled(); // pas de destination → pas d'action
    await userEvent.selectOptions(screen.getByLabelText("Destination"), "102");
    expect(deplacer).toBeEnabled();
    await userEvent.click(deplacer);
    const revue = JSON.parse(screen.getByTestId("view").textContent!);
    expect(revue.items).toEqual([1000, 1001]);
    // R15P-4 : la destination choisie part DANS l'action — la Revue l'exécute
    // (l'ancien jetage R4P produisait un move sans destination).
    expect(revue.action).toEqual({ op: "move", toCollectionId: 102 });
    // R9P-1 : même contrat sur Déplacer.
    expect(screen.getByTestId("sel").textContent).toBe("");
  });

  it("tagger → vue review, sélection consommée (R9P-1)", async () => {
    await renderBar([1000, 1001]);
    const tagger = screen.getByRole("button", { name: "Tagger" });
    expect(tagger).toBeDisabled(); // pas de tags saisis → pas d'action
    await userEvent.type(screen.getByLabelText("Tagger"), "lutin, elfe");
    await userEvent.click(tagger);
    const revue = JSON.parse(screen.getByTestId("view").textContent!);
    expect(revue.items).toEqual([1000, 1001]);
    // Les tags saisis partent dans l'action — la Revue les envoie au bulk.
    expect(revue.action).toEqual({ op: "tag", tags: ["lutin", "elfe"] });
    // R9P-1 : même contrat sur Tagger.
    expect(screen.getByTestId("sel").textContent).toBe("");
  });

  // R9P-2 : le snippet du brief utilisait border/text-app-danger — jeton
  // fantôme, purgé de styles.css (§6 : le seul rouge légitime est
  // --color-app-broken, couleur d'un diagnostic). Même garde-fou que
  // DetailPane.test : scan du DOM. La barre est rendue AVEC sélection ici —
  // sinon le scan passerait à vide (BulkBar démonté = aucune classe).
  it("aucun jeton fantôme : le rouge de la Corbeille est app-broken (R9P-2)", async () => {
    const { container } = await renderBar([1000, 1001]);
    expect(container.querySelector("[class*='app-danger']")).toBeNull();
    // Non-vacuité du scan : le bouton existe bien, portant le jeton légitime.
    expect(screen.getByRole("button", { name: "Corbeille" })).toHaveClass("border-app-broken", "text-app-broken");
  });
});
