import { describe, it, expect, vi, beforeEach } from "vitest";
import { AppStateProvider, useAppState } from "../state/appState";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { TagsView } from "./TagsView";

// Le vrai useTagManage (useMutations) est exercé : c'est lui le contrat
// (endpoint + corps + invalidations) — seul le transport (api.send) est mocké.
// vi.mock est hissé au-dessus des const : les mocks passent par vi.hoisted /
// factory asynchrone (pattern App.test.tsx, TDZ).
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn(async () => ({})) }));
vi.mock("../lib/api", () => ({ api: { send: sendMock } }));
// `etatTags` pilote la réponse par test : sans lui, on ne pourrait pas
// éprouver l'ÉCHEC, qui est justement ce qui s'affichait comme « Rien ici ».
const { etatTags } = vi.hoisted(() => ({ etatTags: { valeur: null as null | Record<string, unknown> } }));
vi.mock("../hooks/useStaticData", async () => {
  const { tags } = await import("../test/fixtures");
  return {
    useTags: () => etatTags.valeur ?? { data: tags },
    useCollections: () => ({ data: [] }),
  };
});

// Espion de navigation : le nom d'une étiquette MÈNE à ce qu'elle range.
const Vue = () => {
  const { view } = useAppState();
  return <span data-testid="vue">{JSON.stringify(view)}</span>;
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AppStateProvider>
      <Vue />
      {children}
    </AppStateProvider>
  </QueryClientProvider>
);

beforeEach(() => {
  sendMock.mockReset().mockResolvedValue({});
  etatTags.valeur = null;
});

describe("TagsView", () => {
  it("renomme un tag (rename → new_name)", async () => {
    render(<TagsView />, { wrapper });
    await userEvent.click(screen.getAllByRole("button", { name: "Renommer" })[0]!);
    await userEvent.type(screen.getByRole("textbox"), "ts");
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith("POST", "/api/tags/manage", {
        operation: "rename",
        tags: ["typescript"],
        new_name: "ts",
      }),
    );
  });

  it("fusionne les tags cochés vers un nom cible", async () => {
    render(<TagsView />, { wrapper });
    await userEvent.click(screen.getByRole("checkbox", { name: "rust" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "design" }));
    await userEvent.type(screen.getByPlaceholderText("Nouveau nom"), "dev");
    await userEvent.click(screen.getByRole("button", { name: "Fusionner" }));
    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith("POST", "/api/tags/manage", {
        operation: "merge",
        tags: ["rust", "design"],
        new_name: "dev",
      }),
    );
  });

  // Confirm inline niveau 1 : le premier geste arme seulement — le vrai
  // envoi (irréversible côté Raindrop) exige le second.
  it("supprime un tag : deux gestes réels avant l'envoi", async () => {
    render(<TagsView />, { wrapper });
    await userEvent.click(screen.getAllByRole("button", { name: "Supprimer" })[0]!);
    expect(sendMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Confirmer" }));
    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith("POST", "/api/tags/manage", {
        operation: "delete",
        tags: ["typescript"],
      }),
    );
  });

  // R8P-1 : tout échec est inline (role="alert"), état conservé — cases et
  // saisie restent en place pour retenter.
  // Le `blur` seul laissait le bouton armé quand le clic ne déplaçait aucun
  // focus — une suppression restait prête à partir au clic suivant.
  it("un clic hors de la ligne désarme la suppression", async () => {
    render(<TagsView />, { wrapper });
    await userEvent.click(screen.getAllByRole("button", { name: "Supprimer" })[0]!);
    expect(screen.getByRole("button", { name: "Confirmer" })).toBeInTheDocument();
    // Un endroit qui ne prend pas le focus : le titre de la vue.
    await userEvent.click(screen.getByRole("heading", { name: "Tags" }));
    expect(screen.queryByRole("button", { name: "Confirmer" })).not.toBeInTheDocument();
    // La ligne est revenue à son état de repos, comme les autres.
    expect(screen.getAllByRole("button", { name: "Supprimer" }).length).toBeGreaterThan(0);
  });

  // Un champ sans nom accessible s'annonce « champ de saisie », sans dire
  // lequel — ici il y en a un par étiquette.
  it("le champ de renommage porte le nom de son étiquette", async () => {
    render(<TagsView />, { wrapper });
    await userEvent.click(screen.getAllByRole("button", { name: "Renommer" })[0]!);
    expect(screen.getByLabelText("Nouveau nom de typescript")).toBeInTheDocument();
  });

  it("échec de fusion : erreur inline, état conservé", async () => {
    sendMock.mockRejectedValueOnce(new Error("boom"));
    render(<TagsView />, { wrapper });
    await userEvent.click(screen.getByRole("checkbox", { name: "rust" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "design" }));
    await userEvent.type(screen.getByPlaceholderText("Nouveau nom"), "dev");
    await userEvent.click(screen.getByRole("button", { name: "Fusionner" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Erreur : boom");
    expect(screen.getByRole("checkbox", { name: "rust" })).toBeChecked();
    expect(screen.getByPlaceholderText("Nouveau nom")).toHaveValue("dev");
  });

  // Le grief : une requête en échec laissait `isLoading` retomber et la liste
  // vide — l'écran annonçait donc « Rien ici », soit « vous n'avez aucune
  // étiquette », là où le sidecar était injoignable.
  it("un échec de chargement se dit, il ne se déguise pas en liste vide", async () => {
    const refetch = vi.fn();
    etatTags.valeur = { data: undefined, isLoading: false, isError: true, error: new Error("sidecar injoignable"), refetch };
    render(<TagsView />, { wrapper });
    expect(screen.getByRole("alert")).toHaveTextContent("sidecar injoignable");
    expect(screen.queryByText("Rien ici")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("une bibliothèque réellement sans étiquette dit « Rien ici »", () => {
    etatTags.valeur = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
    render(<TagsView />, { wrapper });
    expect(screen.getByText("Rien ici")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // Renommer vers le nom déjà porté n'est pas un renommage : ça ferait une
  // écriture, une invalidation et un rechargement de toute la liste pour rien.
  it("renommer vers le nom identique n'écrit pas, et ferme l'édition", async () => {
    render(<TagsView />, { wrapper });
    await userEvent.click(screen.getAllByRole("button", { name: "Renommer" })[0]!);
    const champ = screen.getByRole("textbox");
    await userEvent.type(champ, "typescript");
    sendMock.mockClear();
    await userEvent.keyboard("{Enter}");
    expect(sendMock).not.toHaveBeenCalled();
    // L'édition se ferme quand même : l'utilisateur a validé, il a fini.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  // Deux Entrée rapides lançaient deux renommages, le second portant sur un
  // nom qui n'existe plus.
  it("deux Entrée rapides ne renomment qu'une fois", async () => {
    // La réponse ne vient jamais : la mutation reste « en vol ».
    sendMock.mockImplementation(() => new Promise(() => {}));
    render(<TagsView />, { wrapper });
    await userEvent.click(screen.getAllByRole("button", { name: "Renommer" })[0]!);
    await userEvent.type(screen.getByRole("textbox"), "ts");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1));
  });

  it("un nom vide ou blanc n'envoie rien", async () => {
    render(<TagsView />, { wrapper });
    await userEvent.click(screen.getAllByRole("button", { name: "Renommer" })[0]!);
    await userEvent.type(screen.getByRole("textbox"), "   ");
    sendMock.mockClear();
    await userEvent.keyboard("{Enter}");
    expect(sendMock).not.toHaveBeenCalled();
  });
});

// Une étiquette ressemble partout à la même chose : en rendre une inerte
// fait douter de toutes. C'était le seul endroit où le nom ne réagissait pas.
// Les cases existaient pour la seule FUSION. C'est pourtant le seul endroit
// de l'application qui ressemble déjà à « cocher plusieurs étiquettes » : le
// filtre multi-étiquettes y a désormais sa commande.
describe("TagsView — filtrer sur les étiquettes cochées", () => {
  it("la commande n'apparaît QU'UNE FOIS une case cochée, et porte le nombre", async () => {
    render(<TagsView />, { wrapper });
    const cases = await screen.findAllByRole("checkbox");
    expect(screen.queryByText(/^Filtrer sur/)).toBeNull();
    await userEvent.click(cases[0]!);
    expect(screen.getByText("Filtrer sur cette étiquette")).toBeInTheDocument();
    await userEvent.click(cases[1]!);
    expect(screen.getByText("Filtrer sur ces 2 étiquettes")).toBeInTheDocument();
  });

  it("deux cases cochées ouvrent une liste filtrée sur LES DEUX", async () => {
    render(<TagsView />, { wrapper });
    const cases = await screen.findAllByRole("checkbox");
    await userEvent.click(cases[0]!);
    await userEvent.click(cases[1]!);
    await userEvent.click(screen.getByText("Filtrer sur ces 2 étiquettes"));
    const vue = JSON.parse(screen.getByTestId("vue").textContent ?? "{}") as {
      kind: string; tags: string[];
    };
    expect(vue.kind).toBe("list");
    // DEUX, et non la dernière cochée : c'est tout l'objet de la demande.
    expect(vue.tags).toHaveLength(2);
  });

  // Cochés ∩ vivant (trap garde de sélection) : une étiquette cochée puis
  // supprimée/renommée restait cochée — filtrer intersectait une étiquette
  // qui n'existe plus, soit zéro résultat sans explication (audit 09-23).
  it("une étiquette cochée qui DISPARAÎT des données ne compte plus", async () => {
    const { rerender } = render(<TagsView />, { wrapper });
    const cases = await screen.findAllByRole("checkbox");
    await userEvent.click(cases[0]!); // typescript
    await userEvent.click(cases[1]!); // rust
    expect(screen.getByText("Filtrer sur ces 2 étiquettes")).toBeInTheDocument(); // témoin
    etatTags.valeur = { data: [{ name: "typescript", count: 8 }, { name: "design", count: 5 }] };
    rerender(<TagsView />);
    await userEvent.click(screen.getByText("Filtrer sur cette étiquette"));
    const vue = JSON.parse(screen.getByTestId("vue").textContent ?? "{}") as { tags: string[] };
    expect(vue.tags).toEqual(["typescript"]);
  });
});

describe("TagsView — le nom mène à ce qu'il range", () => {
  it("cliquer une étiquette ouvre la liste filtrée sur elle", async () => {
    render(<TagsView />, { wrapper });
    const nom = (await screen.findAllByRole("button", { name: /#/ }))[0]!;
    await userEvent.click(nom);
    const vue = JSON.parse(screen.getByTestId("vue").textContent ?? "{}") as {
      kind: string; collectionId: number; tags: string[];
    };
    expect(vue.kind).toBe("list");
    // « Tous » : une étiquette ne se limite pas à la collection courante.
    expect(vue.collectionId).toBe(0);
    expect(vue.tags).toHaveLength(1);
  });
});

// Lot a11y : la vue Tags était la dernière zone sans navigation par zone.
// 317 étiquettes réelles à quatre contrôles chacune, soit plus de mille deux
// cents arrêts de tabulation pour traverser l'écran.
describe("TagsView — la vue ne prend qu'UN arrêt de tabulation", () => {
  const tabulables = () =>
    [...document.querySelectorAll<HTMLElement>("li [tabindex], li button, li input")].filter(
      (el) => el.tabIndex === 0,
    );

  it("une seule ligne est tabulable, et ses contrôles ne le sont pas", async () => {
    render(<TagsView />, { wrapper });
    await screen.findAllByRole("listitem");
    const lignes = [...document.querySelectorAll<HTMLElement>("li")];
    // La présence d'abord : il y a bien plusieurs lignes, donc plusieurs
    // occasions d'accumuler des arrêts.
    expect(lignes.length).toBeGreaterThan(1);
    expect(lignes.filter((l) => l.tabIndex === 0)).toHaveLength(1);
    // Et AUCUN contrôle interne n'est tabulable tant qu'on n'est pas entré :
    // c'est là que se trouvaient les mille deux cents arrêts.
    expect(tabulables()).toHaveLength(0);
  });

  it("Enter entre dans la ligne et en ouvre les contrôles ; Échap les referme", async () => {
    render(<TagsView />, { wrapper });
    await screen.findAllByRole("listitem");
    const ligne = document.querySelector<HTMLElement>("li")!;
    ligne.focus();
    await userEvent.keyboard("{Enter}");
    // Entrée : les contrôles de CETTE ligne deviennent atteignables.
    expect(tabulables().length).toBeGreaterThan(0);
    // Le retour — un contrôle qui s'ouvre doit pouvoir se refermer.
    await userEvent.keyboard("{Escape}");
    expect(tabulables()).toHaveLength(0);
  });
});
