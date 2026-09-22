import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { AppStateProvider, useAppState } from "../state/appState";
import { SectionSmartLists } from "./SectionSmartLists";

const getMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/api", () => ({ api: { get: getMock, send: sendMock } }));

// Deux vues : « Rust dans Dev » (filtrée sur collection 101 + étiquette) et
// « Affiches » (recherche sur Tous) — la section rend les deux, dans
// l'ordre de création.
const SMARTLISTS = {
  items: [
    { id: "sl-1", label: "Rust dans Dev", vue: { collectionId: 101, tags: ["rust"] }, cree: "2026-09-22T10:00:00Z" },
    { id: "sl-2", label: "Affiches", vue: { collectionId: 0, search: "affiche" }, cree: "2026-09-22T11:00:00Z" },
  ],
};

const Spy = () => {
  const { view } = useAppState();
  return <span data-testid="view">{JSON.stringify(view)}</span>;
};

// Bouton de test : simule un patch de filtre posé SUR la smart list ouverte
// (le grief de spec §5 — la marque ne survit pas à la divergence).
const Patcheur = () => {
  const { patchList } = useAppState();
  return <button type="button" onClick={() => patchList({ search: "divergé" })}>diverge</button>;
};

const rendre = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AppStateProvider>
        <Spy />
        <Patcheur />
        <SectionSmartLists />
      </AppStateProvider>
    </QueryClientProvider>,
  );

const vue = () => JSON.parse(screen.getByTestId("view").textContent!) as Record<string, unknown>;

beforeEach(() => {
  getMock.mockReset().mockResolvedValue(SMARTLISTS);
  sendMock.mockReset().mockResolvedValue({});
});

describe("SectionSmartLists", () => {
  it("rend la section, les vues dans l'ordre de création", async () => {
    rendre();
    // La section se masque pendant le premier chargement : le titre n'est
    // lisible qu'une fois la requête résolue.
    expect(await screen.findByText("Vues sauvegardées")).toBeInTheDocument();
    expect(await screen.findByText("Rust dans Dev")).toBeInTheDocument();
    expect(screen.getByText("Affiches")).toBeInTheDocument();
  });

  // Navigation : le clic rejoue la vue stockée — les items de la liste en
  // témoignent (ici : la VUE porte les filtres, listQueryArgs fait le reste).
  it("cliquer rejoue la vue stockée avec son identifiant", async () => {
    rendre();
    await userEvent.click(await screen.findByText("Rust dans Dev"));
    expect(vue()).toEqual({
      kind: "list", collectionId: 101, label: "Rust dans Dev",
      smartlistId: "sl-1", tags: ["rust"],
    });
  });

  it("l'entrée de la vue ouverte est surlignée (surface, bg-app-sel)", async () => {
    rendre();
    await userEvent.click(await screen.findByText("Rust dans Dev"));
    expect(screen.getByText("Rust dans Dev").closest("button")!.className).toContain("bg-app-sel");
    expect(screen.getByText("Affiches").closest("button")!.className).not.toContain("bg-app-sel");
  });

  // Sabordage visé par la spec §7 : c'est CE test (et le suivant) qui doit
  // échouer si le clic n'emporte pas smartlistId, ou si le surlignage se lit
  // sur le label. Voir le step de sabordage.
  it("un filtre posé sur la smart list ouverte efface la marque (la liste reste)", async () => {
    rendre();
    await userEvent.click(await screen.findByText("Rust dans Dev"));
    await userEvent.click(screen.getByText("diverge"));
    expect(vue().smartlistId).toBeUndefined();
    expect(vue().collectionId).toBe(101); // la liste filtrée reste à l'écran
    expect(screen.getByText("Rust dans Dev").closest("button")!.className).not.toContain("bg-app-sel");
  });

  it("supprimer frappe DELETE et efface la marque de la vue ouverte", async () => {
    rendre();
    await userEvent.click(await screen.findByText("Rust dans Dev"));
    await userEvent.click(screen.getByRole("button", { name: "Supprimer la vue Rust dans Dev" }));
    expect(sendMock).toHaveBeenCalledWith("DELETE", "/api/smartlists/sl-1");
    expect(vue().smartlistId).toBeUndefined(); // forgetSmartList
    expect(vue().tags).toEqual(["rust"]); // la liste filtrée reste
  });

  it("renommer ouvre le champ inline et frappe PATCH à Enter", async () => {
    rendre();
    await userEvent.click(await screen.findByText("Rust dans Dev"));
    await userEvent.click(screen.getByRole("button", { name: "Renommer la vue Rust dans Dev" }));
    const champ = screen.getByLabelText("Nouveau nom de la vue") as HTMLInputElement;
    expect(champ.value).toBe("Rust dans Dev"); // prérempli
    await userEvent.clear(champ);
    await userEvent.type(champ, "Rust web{Enter}");
    expect(sendMock).toHaveBeenCalledWith("PATCH", "/api/smartlists/sl-1", { label: "Rust web" });
  });

  it("GET en échec : la section dit son état (spec §6)", async () => {
    getMock.mockReset().mockRejectedValue(new Error("fetch failed"));
    rendre();
    expect(await screen.findByText("Vues sauvegardées indisponibles")).toBeInTheDocument();
  });

  it("répertoire vide : pas de section du tout (§9 masqué si nul)", async () => {
    getMock.mockReset().mockResolvedValue({ items: [] });
    rendre();
    await waitFor(() => expect(getMock).toHaveBeenCalled());
    expect(screen.queryByText("Vues sauvegardées")).not.toBeInTheDocument();
  });
});
