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

  // « Déplacer » et son sélecteur de destination ont été RETIRÉS : le
  // glisser-déposer vers une collection fait le même geste, à la souris, et
  // ces deux contrôles prenaient la moitié d'une barre qui vit dans une
  // colonne rétrécie par les panneaux latéraux — ses derniers boutons en
  // sortaient et se faisaient rogner. Le déplacement par sélection multiple
  // reste couvert par useDragBookmark.test (« tirer un signet coché emmène
  // toute la sélection »).
  it("ne propose plus de déplacement : c'est le geste de la souris", async () => {
    await renderBar([1000, 1001]);
    expect(screen.queryByRole("button", { name: "Déplacer" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Destination")).not.toBeInTheDocument();
    // Les autres verbes, eux, restent : la barre n'a pas été vidée.
    expect(screen.getByRole("button", { name: "Corbeille" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tagger" })).toBeInTheDocument();
  });

  it("tagger → vue review, sélection consommée (R9P-1)", async () => {
    await renderBar([1000, 1001]);
    const tagger = screen.getByRole("button", { name: "Tagger" });
    expect(tagger).toBeDisabled(); // pas de tags saisis → pas d'action
    await userEvent.type(screen.getByLabelText("Étiquettes à ajouter"), "lutin, elfe");
    await userEvent.click(tagger);
    const revue = JSON.parse(screen.getByTestId("view").textContent!);
    expect(revue.items).toEqual([1000, 1001]);
    // Les tags saisis partent dans l'action — la Revue les envoie au bulk.
    expect(revue.action).toEqual({ op: "tag", tags: ["lutin", "elfe"] });
    // R9P-1 : même contrat sur Tagger.
    expect(screen.getByTestId("sel").textContent).toBe("");
  });

  // DESIGN.md §9 « un seul point d'entrée par geste » : le verbe appartient
  // au bouton. L'option muette du select et le champ d'étiquettes ne le
  // répètent plus — ni à l'écran, ni pour un lecteur d'écran.
  it("le verbe n'est porté que par son bouton (§9)", async () => {
    await renderBar([1000]);
    expect(screen.getAllByText("Tagger")).toHaveLength(1);
    const champ = screen.getByLabelText("Étiquettes à ajouter");
    expect(champ).toHaveAttribute("placeholder", "séparées par des virgules");
  });

  // Revue finale : « , , » est truthy mais parse VIDE — le bulk update qui
  // en résulterait effacerait toutes les étiquettes sous simple confirmation
  // L1. Le bouton se cale sur la liste parsée, pas sur la chaîne brute.
  it("« , , » = liste parsée vide → Tagger désactivé (pas d'effacement des étiquettes)", async () => {
    await renderBar([1000]);
    await userEvent.type(screen.getByLabelText("Étiquettes à ajouter"), ", ,");
    expect(screen.getByRole("button", { name: "Tagger" })).toBeDisabled();
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
