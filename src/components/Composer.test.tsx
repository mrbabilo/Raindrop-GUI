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
// `enVol` simule une création en cours : c'est le seul moyen d'éprouver le
// garde anti double envoi, qui n'existe que pendant ce laps de temps.
const enVol = vi.hoisted(() => ({ valeur: false }));
vi.mock("../hooks/useMutations", () => ({
  useCreateRaindrop: () => ({ mutateAsync: (b: unknown) => sendMock("POST", "/api/raindrops", b), isPending: enVol.valeur }),
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
  enVol.valeur = false;
    sendMock.mockReset();
    sendMock.mockImplementation(IMPL_DEFAUT);
    etat.view = { kind: "list", collectionId: 101, label: "Dev" };
  });

  // Audit UX du 2026-09-23 : le champ n'avait que son placeholder — qui
  // n'est un nom qu'en dernier recours, et disparaît dès qu'on saisit.
  it("le champ d'URL porte un nom", () => {
    render(<Composer />);
    expect(screen.getByRole("textbox", { name: "URL à sauvegarder" })).toBeInTheDocument();
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

  // Une URL collée depuis une barre d'adresse ou un document peut arriver en
  // majuscules : sans le drapeau d'insensibilité, elle n'était jamais
  // analysée — ni titre prérempli, ni alerte de doublon.
  it("une URL en MAJUSCULES est analysée comme les autres", async () => {
    render(<Composer />);
    await userEvent.type(screen.getByPlaceholderText(COLLER), "HTTPS://NOUVEAU.EXAMPLE/A");
    await waitFor(() => expect(sendMock).toHaveBeenCalledWith("POST", "/api/parse-url", { url: "HTTPS://NOUVEAU.EXAMPLE/A" }));
  });

  // C'est une ÉCRITURE : deux Entrée rapides créaient deux bookmarks pour la
  // même URL, et rien ne rattrape ça d'un Échap.
  it("une création en cours bloque le second envoi", async () => {
    // Posé AVANT le rendu : le composant lit `isPending` à ce moment-là.
    enVol.valeur = true;
    render(<Composer />);
    await userEvent.type(screen.getByPlaceholderText(COLLER), URL_NEUVE);
    sendMock.mockClear();
    await userEvent.keyboard("{Enter}");
    expect(sendMock).not.toHaveBeenCalledWith("POST", "/api/raindrops", expect.anything());
  });

  // Contrôle positif : hors envoi en cours, l'Entrée crée bien.
  it("hors création en cours, l'Entrée envoie", async () => {
    render(<Composer />);
    await userEvent.type(screen.getByPlaceholderText(COLLER), URL_NEUVE);
    sendMock.mockClear();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(sendMock).toHaveBeenCalledWith("POST", "/api/raindrops", expect.objectContaining({ link: URL_NEUVE })));
  });

  // Le garde anti-course `seq` n'avait aucun test : une réponse lente sur une
  // URL abandonnée préremplissait le titre de l'ANCIENNE URL.
  it("la réponse d'une URL dépassée par la saisie est écartée", async () => {
    const lentes: Array<(v: unknown) => void> = [];
    sendMock.mockImplementation(async (_m: string, path: string, body?: { url?: string }) => {
      if (path === "/api/parse-url" && body?.url?.includes("lente"))
        return new Promise((resolve) => lentes.push(() => resolve({ title: "TITRE PÉRIMÉ" })));
      if (path === "/api/parse-url") return { title: "Titre frais" };
      if (path === "/api/check-urls") return { result: true, ids: [], duplicates: [] };
      return {};
    });
    render(<Composer />);
    const champ = screen.getByPlaceholderText(COLLER);
    await userEvent.type(champ, "https://lente.example/a");
    await waitFor(() => expect(lentes.length).toBeGreaterThan(0));
    // On change d'URL AVANT que la première réponde.
    await userEvent.clear(champ);
    await userEvent.type(champ, "https://fraiche.example/b");
    await waitFor(() => expect(screen.getByDisplayValue("Titre frais")).toBeInTheDocument());
    // La réponse périmée arrive enfin : elle ne doit rien écraser.
    lentes.forEach((r) => r(undefined));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByDisplayValue("TITRE PÉRIMÉ")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Titre frais")).toBeInTheDocument();
  });

  // Le titre appartient à l'URL qu'il décrit (audit du 2026-09-23) : coller
  // A, puis B, puis valider avant le parse de B enregistrait B sous le titre
  // de A — rien ne reliait le titre affiché à son URL.
  it("valider une URL NEUVE avant son parse n'emporte pas le titre de la précédente", async () => {
    render(<Composer />);
    await saisir(URL_NEUVE);
    // Le geste réel : tout sélectionner, COLLER B par-dessus A — l'URL passe
    // de A à B d'un coup, sans état intermédiaire vide (un `clear` remettrait
    // le titre à zéro et rendrait ce test creux).
    const champ = screen.getByPlaceholderText(COLLER) as HTMLInputElement;
    champ.focus();
    champ.setSelectionRange(0, champ.value.length);
    await userEvent.paste("https://autre.example/b");
    expect(champ).toHaveValue("https://autre.example/b");
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith("POST", "/api/raindrops", expect.objectContaining({ link: "https://autre.example/b" })),
    );
    const corps = sendMock.mock.calls.find((c) => c[1] === "/api/raindrops")![2] as { title?: string };
    expect(corps.title).toBeUndefined();
  });

  it("témoin : un titre ÉDITÉ à la main pour l'URL courante part avec elle", async () => {
    render(<Composer />);
    await saisir(URL_NEUVE);
    const titre = screen.getByLabelText("Titre");
    await userEvent.clear(titre);
    await userEvent.type(titre, "Mon titre{Enter}");
    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith("POST", "/api/raindrops", expect.objectContaining({ link: URL_NEUVE, title: "Mon titre" })),
    );
  });
});
