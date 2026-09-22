import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { t } from "../i18n/fr";
import { raindrop } from "../test/fixtures";
import { injecterRegles } from "../test/injectStyles";
import { LectureView } from "./LectureView";
import { AppStateProvider, useAppState, vueDeRetour, type View } from "../state/appState";
import { ApiError } from "../lib/api";

const { chargerMock, extraireMock, ouvrirMock, getApi } = vi.hoisted(() => ({
  chargerMock: vi.fn(),
  extraireMock: vi.fn(),
  ouvrirMock: vi.fn(),
  getApi: vi.fn(),
}));

vi.mock("../lib/lecture", () => ({ chargerContenu: chargerMock, extraireBlocs: extraireMock }));
vi.mock("../lib/pageWeb", () => ({ ouvrirPageWeb: ouvrirMock }));
// ArchiveJob est mocké : le composant réel poste et suit un job SSE — le
// contrat testé ici est CE QUE FAIT LA VUE au terme (refetch du contenu),
// pas le vol lui-même (couvert par les tests de RevueArchive).
vi.mock("./RevueArchive", () => ({
  ArchiveJob: ({ ids, onTermine }: { ids: number[]; onTermine: (r: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onTermine({ demandes: ids.length, faits: ids.length, echecs: [], annule: false, nonTentes: 0 })
      }
    >
      simuler-termine
    </button>
  ),
}));
// `ApiError` reste RÉELLE : la vue la teste avec `instanceof`, et un mock
// ici testerait notre propre supposition. On n'écrase que `api.get` — le
// reste du module traverse via importOriginal (sinon `ApiError` serait
// `undefined` dans la vue et `instanceof` jetterait un TypeError).
vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  api: { get: getApi },
}));

beforeEach(() => {
  getApi.mockReset().mockImplementation((path: string) => {
    if (path === "/api/raindrops/1000")
      return Promise.resolve(
        // Un surlignage dans la fixture : le test prouve qu'il ne se
        // DUPRIQUE pas en lecture — une assertion d'absence ne vaut que si
        // l'objet devait être là.
        raindrop({
          id: 1000,
          highlights: [{ id: "h1", text: "Un passage", note: "", created: "2025-01-01T00:00:00Z" }],
        }),
      );
    return undefined;
  });
  chargerMock.mockReset().mockResolvedValue({
    html: "<html></html>",
    dateArchive: "2026-09-18T10:00:00.000Z",
  });
  extraireMock.mockReset().mockReturnValue([
    { balise: "h2", segments: [{ texte: "Un titre de lecture" }] },
    {
      balise: "p",
      segments: [{ texte: "Paragraphe un." }, { texte: " en gras", gras: true }],
    },
  ]);
  ouvrirMock.mockReset().mockResolvedValue(undefined);
});

// Le Harnais pose la vue comme App la posera : LectureView montée seulement
// en vue lecture, goBack = la VRAIE `vueDeRetour` (pas une copie de test).
const Harnais = () => {
  const { view, go } = useAppState();
  return (
    <>
      <span data-testid="vue">{view.kind}</span>
      <button type="button" onClick={() => go({ kind: "cleanup" })}>vers-nettoyage</button>
      <button
        type="button"
        onClick={() =>
          go({ kind: "lecture", raindropId: 1000, label: "T", returnView: { kind: "cleanup" } })
        }
      >
        ouvrir-lecture
      </button>
      {view.kind === "lecture" && <LectureView view={view} goBack={() => go(vueDeRetour(view))} />}
    </>
  );
};

const renderLecture = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AppStateProvider>
        <Harnais />
      </AppStateProvider>
    </QueryClientProvider>,
  );

const ouvrir = async () => {
  renderLecture();
  await userEvent.click(screen.getByText("ouvrir-lecture"));
  expect(screen.getByTestId("vue").textContent).toBe("lecture");
};

describe("LectureView", () => {
  it("rend le texte en colonne serif ; la ligne de tête porte provenance · date · temps", async () => {
    injecterRegles(".lecture-corps", ".lecture-corps h2", ".lecture-corps p");
    await ouvrir();
    const titre = await screen.findByText("Un titre de lecture");
    expect(titre.tagName).toBe("H2"); // la whitelist reconstruit de VRAIS éléments
    const article = document.querySelector(".lecture-corps");
    expect(article).not.toBeNull();
    expect(getComputedStyle(article!).fontFamily).toContain("serif");
    // La feuille de lecture (DESIGN §12) : le preflight de Tailwind aplatit
    // titres et marges — le mur de texte. Hiérarchie et rythme sont lus
    // dans le VRAI styles.css (injecterRegles), jamais recopiés ici.
    expect(getComputedStyle(titre).fontSize).not.toBe("17px");
    expect(getComputedStyle(screen.getByText("Paragraphe un.")).marginBottom).not.toBe("0px");
    // Le rendu inline des marques reprend un porteur : un paragraphe du
    // corps est là, et le segment gras est un VRAI élément <strong> —
    // renduBloc reconstruit l'arbre, jamais du texte aplati.
    expect(screen.getByText("Paragraphe un.")).toBeInTheDocument();
    expect(screen.getByText("en gras").closest("strong")).not.toBeNull();
    // La ligne de tête (spec inversion §5) : la fraîcheur de ce qu'on lit,
    // en une ligne — le rail de 260 px est parti. L'heure de l'archive dépend
    // du fuseau de la machine de test : on assert le JOUR, jamais l'heure
    // (le vieux test faisait de même avec sa regex).
    const ligne = screen.getByText(/archive locale · Archive du 18 septembre 2026/);
    expect(ligne.textContent).toContain("≈ 1 min de lecture");
    // Le rail rendait titre, domaine et étiquettes : ABSENTS désormais — la
    // fiche voisine les porte (avant le lot, ce test les voyait ici).
    expect(screen.queryByText("Article exemple")).not.toBeInTheDocument();
    expect(screen.queryByText("example.com")).not.toBeInTheDocument();
    expect(screen.queryByText(/typescript/)).not.toBeInTheDocument();
    // Les surlignages restent dans la fiche — jamais dupliqués en lecture.
    expect(screen.queryByText("Un passage")).not.toBeInTheDocument();
  });

  it("badge « copie permanente » quand le texte vient d'un téléchargement à la volée", async () => {
    // Poser la vue AVEC sourceCopie : le badge dit la PROVENANCE.
    const HarnaisCopie = () => {
      const { view, go } = useAppState();
      return view.kind === "lecture" ? (
        <LectureView view={view} goBack={() => go(vueDeRetour(view))} />
      ) : null;
    };
    const Poseur = () => {
      const { go } = useAppState();
      return (
        <button
          type="button"
          onClick={() =>
            go({ kind: "lecture", raindropId: 1000, label: "T", sourceCopie: true })
          }
        >
          ouvrir
        </button>
      );
    };
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AppStateProvider>
          <Poseur />
          <HarnaisCopie />
        </AppStateProvider>
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByText("ouvrir"));
    expect(await screen.findByText(/copie permanente/)).toBeInTheDocument();
    expect(screen.queryByText(/archive locale/)).not.toBeInTheDocument();
  });

  // La règle du lot bascules : l'aller ne prouve rien sans le retour.
  it("« Fermer la lecture » ramène à la vue d'origine (retour, pas seulement l'aller)", async () => {
    await ouvrir();
    // Le contenu de l'article (le titre du rail a quitté la vue avec lui).
    await screen.findByText("Un titre de lecture");
    await userEvent.click(screen.getByRole("button", { name: "Fermer la lecture" }));
    expect(screen.getByTestId("vue").textContent).toBe("cleanup");
  });

  it("404 ARCHIVE_ABSENTE : état nommé + « Voir la page » en issue", async () => {
    chargerMock.mockRejectedValue(new ApiError("ARCHIVE_ABSENTE", 404, "aucune archive"));
    await ouvrir();
    expect(
      await screen.findByText("L'archive a disparu entre l'affichage de la fiche et votre clic."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Voir la page" })).toBeInTheDocument();
  });

  // Spec inversion §7 : le clic ouvre la lecture d'une copie permanente pas
  // encore téléchargée — la lecture CONDUIT le téléchargement (progression
  // nommée, jamais « l'archive a disparu » qui serait un mensonge : elle
  // n'a jamais existé ici). Défaut trouvé en vérification réelle le
  // 2026-09-22 : la requête de contenu partait seule, l'écran nommait une
  // disparition pour 12 210 signets à copie prête et 5 archives locales.
  it("copie permanente absente : la lecture télécharge à la demande, puis rend le contenu", async () => {
    chargerMock
      .mockRejectedValueOnce(new ApiError("ARCHIVE_ABSENTE", 404, "aucune archive"))
      .mockResolvedValue({ html: "<html></html>", dateArchive: "2026-09-18T10:00:00.000Z" });
    const HarnaisCopie = () => {
      const { view, go } = useAppState();
      return view.kind === "lecture" ? (
        <LectureView view={view} goBack={() => go(vueDeRetour(view))} />
      ) : null;
    };
    const Poseur = () => {
      const { go } = useAppState();
      return (
        <button
          type="button"
          onClick={() => go({ kind: "lecture", raindropId: 1000, label: "T", sourceCopie: true })}
        >
          ouvrir
        </button>
      );
    };
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AppStateProvider>
          <Poseur />
          <HarnaisCopie />
        </AppStateProvider>
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByText("ouvrir"));
    // La progression nommée remplace l'erreur mensongère…
    expect(await screen.findByText("Téléchargement de la copie permanente…")).toBeInTheDocument();
    expect(
      screen.queryByText("L'archive a disparu entre l'affichage de la fiche et votre clic."),
    ).not.toBeInTheDocument();
    // …le téléchargement aboutit, la lecture refetch et rend le contenu.
    await userEvent.click(screen.getByText("simuler-termine"));
    expect(await screen.findByText(/copie permanente/)).toBeInTheDocument();
    expect(screen.queryByText(/Téléchargement de la copie/)).not.toBeInTheDocument();
  });

  it("garde de 64 Mo : état nommé", async () => {
    chargerMock.mockRejectedValue(
      new ApiError("ARCHIVE_TROP_VOLUMINEUSE", 413, "dépasserait la garde de 64 Mo"),
    );
    await ouvrir();
    expect(
      await screen.findByText(/dépasse la taille maximale lisible/),
    ).toBeInTheDocument();
  });

  it("extraction vide : état nommé, jamais un blanc silencieux", async () => {
    extraireMock.mockReturnValue([]);
    await ouvrir();
    expect(
      await screen.findByText("Aucun texte n'a pu être extrait de cette archive."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Voir la page" })).toBeInTheDocument();
  });

  it("l'issue « Voir la page » frappe ouvrirPageWeb avec l'URL du signet", async () => {
    chargerMock.mockRejectedValue(new ApiError("ARCHIVE_ABSENTE", 404, "aucune archive"));
    await ouvrir();
    await userEvent.click(await screen.findByRole("button", { name: "Voir la page" }));
    expect(ouvrirMock).toHaveBeenCalledWith("https://example.com/a");
  });

  it("vueDeRetour : la règle partagée — origine notée, sinon « Tous »", () => {
    const tous: View = { kind: "list", collectionId: 0, label: t("nav.all") };
    expect(
      vueDeRetour({ kind: "lecture", raindropId: 1, label: "T", returnView: { kind: "cleanup" } }),
    ).toEqual({ kind: "cleanup" });
    expect(vueDeRetour({ kind: "lecture", raindropId: 1, label: "T" })).toEqual(tous);
  });
});
