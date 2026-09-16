import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Composer } from "./Composer";

// vi.hoisted : les factories vi.mock s'évaluent pendant la résolution des
// imports, avant le corps du module — ce qu'elles lisent doit naître hoisté
// (même piège TDZ que BulkBar.test / App.test). `etat` est mutable : chaque
// test précoche la collection courante qu'il veut (garde -99 etc.).
const sendMock = vi.hoisted(() => vi.fn());
const etat = vi.hoisted(() => ({ view: { kind: "list", collectionId: 101, label: "Dev" } }));

// R10P-1 — forme RÉELLE de check-urls (sonde API du 2026-09-17, passée telle
// quelle par le sidecar user.ts) : {result, ids, duplicates:[{link,_id}]}.
// Le mock du plan portait {items:[{url,exists}]} — forme fantôme, jamais
// observée. Convention 7c : le mock pinne le réel, pas la supposition.
// parse-url renvoie bien l'item parsé (ok(data.item) côté tool) — là, le
// mock du plan était cohérent.
const IMPL_DEFAUT = async (_method: string, path: string) => {
  if (path === "/api/parse-url") return { title: "Titre parsé", description: "desc", type: "article" };
  if (path === "/api/check-urls")
    return { result: true, ids: [1265539367], duplicates: [{ link: "https://doublon.example/a", _id: 1265539367 }] };
  if (path === "/api/raindrops") return { id: 42, link: "https://x", title: "Titre parsé" };
  return {};
};

vi.mock("../lib/api", () => ({ api: { get: vi.fn(), send: sendMock } }));
vi.mock("../hooks/useMutations", () => ({
  useCreateRaindrop: () => ({ mutateAsync: (b: unknown) => sendMock("POST", "/api/raindrops", b), isPending: false }),
  useInvalidate: () => vi.fn(),
}));
vi.mock("../state/appState", () => ({
  useAppState: () => ({ view: etat.view, patchList: vi.fn() }),
}));

const COLLER = /Coller une URL/;
const URL_NEUVE = "https://nouveau.example/a";

// Taper l'URL puis attendre le préremplissage : le parse part au repos
// (300 ms sans frappe, même mécanique que la recherche de TopBar).
async function saisir(url: string) {
  await userEvent.type(screen.getByPlaceholderText(COLLER), url);
  await waitFor(() => expect(screen.getByDisplayValue("Titre parsé")).toBeInTheDocument());
}

describe("Composer", () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockImplementation(IMPL_DEFAUT);
    etat.view = { kind: "list", collectionId: 101, label: "Dev" };
  });

  it("parse l'URL collée (préremplissage) et crée dans la collection courante", async () => {
    render(<Composer />);
    await saisir(URL_NEUVE);
    // Le titre prérempli est éditable et nommé via i18n (pas d'aria en dur).
    expect(screen.getByLabelText("Titre")).toHaveValue("Titre parsé");
    // Une seule requête de parse pour toute la saisie (débouncé) — sinon la
    // file séquentielle du sidecar encaisserait une requête par frappe.
    expect(sendMock.mock.calls.filter((c) => c[1] === "/api/parse-url")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Sauvegarder" }));
    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith(
        "POST",
        "/api/raindrops",
        expect.objectContaining({ link: URL_NEUVE, title: "Titre parsé", collection_id: 101 }),
      ),
    );
    // Succès : le composer se vide, prêt pour l'ajout suivant.
    await waitFor(() => expect(screen.getByPlaceholderText(COLLER)).toHaveValue(""));
  });

  it("alerte si l'URL existe déjà, avec le lien vers l'existant (R10P-1)", async () => {
    render(<Composer />);
    await userEvent.type(screen.getByPlaceholderText(COLLER), "https://doublon.example/a");
    await waitFor(() => expect(screen.getByText("Déjà sauvegardé")).toBeInTheDocument());
    // duplicates porte {link,_id} : l'alerte mène à l'existant.
    expect(screen.getByText("Déjà sauvegardé")).toHaveAttribute("href", "https://doublon.example/a");
  });

  it("échec de création : erreur inline, brouillon conservé (R8P-1 étendu)", async () => {
    sendMock.mockImplementation(async (_method: string, path: string) => {
      if (path === "/api/parse-url") return { title: "Titre parsé" };
      if (path === "/api/raindrops") throw new Error("http 500");
      return {};
    });
    render(<Composer />);
    await saisir(URL_NEUVE);
    await userEvent.click(screen.getByRole("button", { name: "Sauvegarder" }));
    // Pattern du fix T8 : role="alert" + i18n state.error, jamais un échec avalé.
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Erreur : http 500"));
    // Ni l'URL ni le titre prérempli ne sont détruits par l'échec.
    expect(screen.getByPlaceholderText(COLLER)).toHaveValue(URL_NEUVE);
    expect(screen.getByLabelText("Titre")).toHaveValue("Titre parsé");
  });

  it("les marqueurs de système ne deviennent pas une destination de création", async () => {
    etat.view = { kind: "list", collectionId: -99, label: "Corbeille" };
    render(<Composer />);
    await saisir(URL_NEUVE);
    await userEvent.click(screen.getByRole("button", { name: "Sauvegarder" }));
    const appel = sendMock.mock.calls.find((c) => c[1] === "/api/raindrops");
    expect(appel).toBeDefined();
    // toEqual strict : SANS collection_id (corbeille -99, non classés -1,
    // Tous 0… — la destination se décide côté API, jamais par un marqueur).
    expect(appel![2]).toEqual({ link: URL_NEUVE, title: "Titre parsé" });
  });

  it("ne parse pas un texte qui n'est pas une URL (pas de spam de la file)", async () => {
    render(<Composer />);
    await userEvent.type(screen.getByPlaceholderText(COLLER), "pas une url");
    await new Promise((r) => setTimeout(r, 400)); // laisser passer l'éventuel debounce
    expect(sendMock).not.toHaveBeenCalled();
  });

  // R10P-2 : text-app-danger / bg-app-accent du plan sont des jetons fantômes
  // (§6 : pas d'accent de marque ; le seul rouge légitime est
  // --color-app-broken, couleur d'un diagnostic). Même garde-fou que
  // BulkBar.test : scan DOM + preuve de non-vacuité (sinon le scan passerait
  // à vide sur un composer sans alerte rendue).
  it("aucun jeton fantôme : alerte en app-broken, bouton primaire en app-sel (R10P-2)", async () => {
    const { container } = render(<Composer />);
    await userEvent.type(screen.getByPlaceholderText(COLLER), "https://doublon.example/a");
    await waitFor(() => expect(screen.getByText("Déjà sauvegardé")).toBeInTheDocument());
    expect(container.querySelector("[class*='app-danger'], [class*='app-accent']")).toBeNull();
    expect(screen.getByText("Déjà sauvegardé")).toHaveClass("text-app-broken");
    expect(screen.getByRole("button", { name: "Sauvegarder" })).toHaveClass("bg-app-sel");
  });
});
