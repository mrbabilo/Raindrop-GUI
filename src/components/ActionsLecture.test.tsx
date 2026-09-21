import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { raindrop } from "../test/fixtures";
import { ActionsLecture } from "./ActionsLecture";
import { AppStateProvider, useAppState } from "../state/appState";
import type { RaindropItem } from "../../shared/types";

const { getApi, jobsMock, archivesMock, invalideMock, ouvrirMock } = vi.hoisted(() => ({
  getApi: vi.fn(),
  jobsMock: vi.fn(),
  archivesMock: vi.fn(),
  invalideMock: vi.fn(),
  ouvrirMock: vi.fn(),
}));

vi.mock("../hooks/useBackup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks/useBackup")>()),
  useJobsEnVol: jobsMock,
  useArchives: archivesMock,
  useInvalidateSauvegarde: () => invalideMock,
}));
vi.mock("../lib/pageWeb", () => ({ ouvrirPageWeb: ouvrirMock }));
vi.mock("../hooks/useStaticData", () => ({ useCollections: () => ({ data: [] }) }));

// ArchiveJob REMPLACÉ par un bouchon pilotable : le vol d'archivage (SSE,
// adoption) est déjà couvert par RevueArchive.test — ici on teste CE que la
// fiche en fait (quand elle le monte, et ce qu'elle fait au terme).
vi.mock("./RevueArchive", () => ({
  ArchiveJob: ({ ids, onTermine, onErreur }: {
    ids: number[];
    onTermine: (r: unknown) => void;
    onErreur: (m: string) => void;
  }) => (
    <>
      <span data-testid="job-ids">{ids.join(",")}</span>
      <button type="button" onClick={() => onTermine({ demandes: 1, faits: 1, echecs: [], annule: false, nonTentes: 0 })}>
        simuler-termine
      </button>
      <button
        type="button"
        onClick={() =>
          onTermine({
            demandes: 1, faits: 1,
            echecs: [{ id: ids[0]!, raison: "copie inaccessible (http 404)" }],
            annule: false, nonTentes: 0,
          })
        }
      >
        simuler-echec
      </button>
      <button type="button" onClick={() => onErreur("un archivage est déjà en cours")}>
        simuler-erreur
      </button>
    </>
  ),
}));

beforeEach(() => {
  getApi.mockReset().mockReturnValue(Promise.resolve(undefined));
  jobsMock.mockReset().mockReturnValue({ data: [] });
  archivesMock.mockReset().mockReturnValue({ data: { set: new Set<number>(), octets: 0 } });
  invalideMock.mockReset();
  ouvrirMock.mockReset().mockResolvedValue(undefined);
});

const Harnais = ({ r }: { r: RaindropItem }) => {
  // `go` n'est pas déstructuré ici : la navigation part des CLICS sur les
  // boutons du composant — la tester autrement la testerait à vide.
  const { view } = useAppState();
  return (
    <>
      <span data-testid="vue">{JSON.stringify(view)}</span>
      <ActionsLecture r={r} />
    </>
  );
};

const renderActions = (r: RaindropItem) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppStateProvider>
        <Harnais r={r} />
      </AppStateProvider>
    </QueryClientProvider>,
  );

const vue = () => JSON.parse(screen.getByTestId("vue").textContent ?? "{}") as {
  kind: string; raindropId?: number; sourceCopie?: boolean;
};

describe("ActionsLecture", () => {
  it("archive locale : « Lire » activé, ouvre la vue lecture sans sourceCopie", async () => {
    archivesMock.mockReturnValue({ data: { set: new Set([1000]), octets: 10 } });
    renderActions(raindrop({ id: 1000 }));
    await userEvent.click(await screen.findByRole("button", { name: "Lire" }));
    expect(vue().kind).toBe("lecture");
    expect(vue().raindropId).toBe(1000);
    expect(vue().sourceCopie).toBeUndefined();
  });

  it("ni archive ni copie : « Lire » désactivé AVEC sa raison (spec §5)", async () => {
    renderActions(raindrop({ id: 1000, cache: null }));
    const lire = await screen.findByRole("button", { name: "Lire" });
    expect(lire).toBeDisabled();
    expect(
      screen.getByText("Ni archive locale ni copie permanente : rien à lire hors ligne."),
    ).toBeInTheDocument();
  });

  it("copie en échec : la raison DISTINGUE l'échec de l'absence, et traduit le statut", async () => {
    renderActions(raindrop({ id: 1000, cache: { status: "failed" } }));
    const lire = await screen.findByRole("button", { name: "Lire" });
    expect(lire).toBeDisabled();
    expect(screen.getByText("Copie permanente en échec côté Raindrop (échec).")).toBeInTheDocument();
    // « failed » ne s'affiche JAMAIS brut : c'est le libellé français qui porte.
    expect(screen.queryByText(/failed/)).not.toBeInTheDocument();
  });

  it("copie prête sans archive : « Lire » télécharge d'ABORD puis ouvre en sourceCopie", async () => {
    renderActions(raindrop({ id: 1000, cache: { status: "ready", size: 100 } }));
    await userEvent.click(await screen.findByRole("button", { name: "Lire" }));
    expect(screen.getByTestId("job-ids").textContent).toBe("1000");
    expect(vue().kind).not.toBe("lecture"); // rien ne bouge avant le terme
    await userEvent.click(screen.getByText("simuler-termine"));
    expect(invalideMock).toHaveBeenCalled(); // l'inventaire se rafraîchit
    expect(vue().kind).toBe("lecture");
    expect(vue().sourceCopie).toBe(true);
  });

  it("le téléchargement échoue pour NOTRE identifiant : raison nommée, vue inchangée", async () => {
    renderActions(raindrop({ id: 1000, cache: { status: "ready" } }));
    await userEvent.click(await screen.findByRole("button", { name: "Lire" }));
    await userEvent.click(screen.getByText("simuler-echec"));
    expect(await screen.findByRole("alert")).toHaveTextContent("copie inaccessible (http 404)");
    expect(vue().kind).not.toBe("lecture");
  });

  it("« Voir la page » reste le geste partout — même quand « Lire » est désactivé", async () => {
    renderActions(raindrop({ id: 1000, cache: null }));
    const voir = await screen.findByRole("button", { name: "Voir la page" });
    expect(voir).toBeEnabled();
    await userEvent.click(voir);
    expect(ouvrirMock).toHaveBeenCalledWith("https://example.com/a");
  });

  it("un archivage DÉJÀ en vol : la fiche ne monte pas un second job, elle nomme l'attente", async () => {
    jobsMock.mockReturnValue({
      data: [{ id: "j9", type: "archive", status: "running", progress: { done: 1, total: 5, label: null } }],
    });
    renderActions(raindrop({ id: 1000, cache: { status: "ready" } }));
    const lire = await screen.findByRole("button", { name: "Lire" });
    expect(lire).toBeDisabled();
    expect(screen.getByText(/Un archivage est déjà en cours/)).toBeInTheDocument();
    await userEvent.click(lire); // désactivé : rien ne part
    expect(screen.queryByTestId("job-ids")).not.toBeInTheDocument();
  });
});
