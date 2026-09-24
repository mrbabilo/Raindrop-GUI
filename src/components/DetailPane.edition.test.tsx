import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
// fixtures AVANT DetailPane (TDZ — la factory vi.mock référence `collections`).
import { raindrop, collections, tags } from "../test/fixtures";
import { DetailPane } from "./DetailPane";
import { AppStateProvider, useAppState } from "../state/appState";

// L'édition inline de la fiche — ses SORTIES (audit UX du 2026-09-23).
// « Annuler » refermait l'édition sans jeter le brouillon : rouvrir montrait
// la saisie abandonnée, et « Enregistrer » l'envoyait. Échap, que le
// commentaire de l'effet disait « annuler la saisie », ne faisait rien.

const { getApi, sendApi } = vi.hoisted(() => ({ getApi: vi.fn(), sendApi: vi.fn() }));
vi.mock("../lib/api", () => ({ api: { get: getApi, send: sendApi } }));
vi.mock("../hooks/useStaticData", () => ({ useCollections: () => ({ data: collections }), useTags: () => ({ data: tags }) }));

beforeEach(() => {
  getApi.mockReset().mockImplementation((path: string) => {
    if (path === "/api/raindrops/1000") return Promise.resolve(raindrop({ id: 1000, collectionId: 201 }));
    if (path === "/api/backup/archives") return Promise.resolve({ ids: [], octets: 0 });
    if (path === "/api/jobs") return Promise.resolve([]);
    return undefined;
  });
  sendApi.mockReset().mockResolvedValue({});
});

const Preselect = () => {
  const { selectRaindrop } = useAppState();
  useEffect(() => selectRaindrop(1000), []);
  return null;
};

const onFermer = vi.fn();
const monter = async () => {
  onFermer.mockClear();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppStateProvider>
        <Preselect />
        <DetailPane onFermer={onFermer} />
      </AppStateProvider>
    </QueryClientProvider>,
  );
  await userEvent.click(await screen.findByRole("button", { name: "Modifier" }));
};

describe("DetailPane — l'édition se quitte sans rien garder", () => {
  it("les champs d'édition portent un nom", async () => {
    await monter();
    expect(screen.getByRole("textbox", { name: "Titre" })).toHaveValue("Article exemple");
    expect(screen.getByRole("textbox", { name: "Extrait" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Note" })).toBeInTheDocument();
  });

  it("« Annuler » jette le brouillon : rouvert, le champ montre l'original, rien ne part", async () => {
    await monter();
    const champ = screen.getByDisplayValue("Article exemple");
    await userEvent.clear(champ);
    await userEvent.type(champ, "Abandonné");
    await userEvent.click(screen.getByRole("button", { name: "Annuler" }));
    await userEvent.click(screen.getByRole("button", { name: "Modifier" }));
    expect(screen.getByDisplayValue("Article exemple")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(sendApi).not.toHaveBeenCalled();
  });

  it("Échap annule l'édition — et seulement elle : la fiche reste ouverte", async () => {
    await monter();
    const champ = screen.getByDisplayValue("Article exemple");
    await userEvent.type(champ, " modifié");
    await userEvent.keyboard("{Escape}");
    // Retour en aperçu, titre d'origine, fiche toujours là.
    expect(screen.getByRole("heading", { name: "Article exemple" })).toBeInTheDocument();
    expect(onFermer).not.toHaveBeenCalled();
    // Le second Échap, hors édition, referme la fiche (témoin du câblage).
    await userEvent.keyboard("{Escape}");
    expect(onFermer).toHaveBeenCalledTimes(1);
  });

  // Spec §116 : l'édition inline couvre « titre, extrait, note, TAGS,
  // COLLECTION ». Les deux derniers manquaient (audit d'ergonomie du
  // 2026-09-24) : ajouter une étiquette à UN signet coûtait cinq gestes
  // (cocher, Étiqueter, Revue, confirmer, exécuter) et en RETIRER une
  // n'était possible nulle part.
  it("retirer et ajouter des étiquettes : Enregistrer envoie la liste complète", async () => {
    await monter();
    await userEvent.click(screen.getByRole("button", { name: "Retirer l'étiquette typescript" }));
    await userEvent.type(screen.getByRole("combobox", { name: "Ajouter une étiquette" }), "rust{Enter}");
    await userEvent.type(screen.getByRole("combobox", { name: "Ajouter une étiquette" }), "neuf,");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(sendApi).toHaveBeenCalledWith("PATCH", "/api/raindrops/1000", expect.objectContaining({ tags: ["rust", "neuf"] }));
  });

  it("une étiquette déjà posée (casse ignorée) ne s'ajoute pas deux fois", async () => {
    await monter();
    await userEvent.type(screen.getByRole("combobox", { name: "Ajouter une étiquette" }), "TypeScript{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    // Rien n'a changé : aucune écriture (le brouillon est vide).
    expect(sendApi).not.toHaveBeenCalled();
  });

  it("changer de collection : Enregistrer déplace le signet", async () => {
    await monter();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Collection" }), "102");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(sendApi).toHaveBeenCalledWith("PATCH", "/api/raindrops/1000", expect.objectContaining({ collection_id: 102 }));
  });

  it("Annuler jette aussi les étiquettes et la collection modifiées", async () => {
    await monter();
    await userEvent.click(screen.getByRole("button", { name: "Retirer l'étiquette typescript" }));
    await userEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.getByText("typescript")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Modifier" }));
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(sendApi).not.toHaveBeenCalled();
  });
});
