import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiError } from "./api";
import { chargerContenu, extraireBlocs } from "./lecture";

describe("extraireBlocs", () => {
  // Priorités de la spec lecture §3, dans l'ordre : article > [role=main] >
  // main > div/section au textContent le plus long > corps.
  it("retient <article> en priorité", () => {
    // Les DEUX premiers candidats sont présents : c'est leur ORDRE qu'on
    // verrouille (prouvé par sabotage — sans le rôle concurrent, inverser
    // les deux lignes de priorité laissait ce test au vert).
    const html = `<html><body>
      <nav><p>Menu accueil contact</p></nav>
      <div role="main"><p>Un rôle main concurrent.</p></div>
      <article><p>Le vrai texte de l'article.</p></article>
      <div><p>Un pied de page long — mais moins que le menu, peu importe.</p></div>
    </body></html>`;
    expect(extraireBlocs(html)).toEqual([
      { balise: "p", segments: [{ texte: "Le vrai texte de l'article." }] },
    ]);
  });

  // Sans article concurrent : le rôle gagne, puis le <main>, etc. L'ordre
  // des priorités se SABOTE à la Step 5 — un test de priorité qui passerait
  // sur un ordre inversé ne prouverait rien.
  it("retient [role=main] à défaut d'article", () => {
    const html = `<html><body>
      <div role="main"><p>Le contenu principal.</p></div>
      <main><p>Un main concurrent, sans rôle.</p></main>
      <div><p>Un conteneur banal.</p></div>
    </body></html>`;
    expect(extraireBlocs(html)).toEqual([
      { balise: "p", segments: [{ texte: "Le contenu principal." }] },
    ]);
  });

  it("les inlines deviennent des segments : gras, italique, lien", () => {
    const html = `<html><body><article>
      <p>Texte <strong>gras</strong> et <em>italique</em> puis <a href="https://x.fr/a">un lien</a> fin.</p>
    </article></body></html>`;
    expect(extraireBlocs(html)).toEqual([
      {
        balise: "p",
        segments: [
          { texte: "Texte" },
          { texte: "gras", gras: true },
          { texte: "et" },
          { texte: "italique", italique: true },
          { texte: "puis" },
          { texte: "un lien", lien: "https://x.fr/a" },
          { texte: "fin." },
        ],
      },
    ]);
  });

  it("un lien javascript: ne devient pas un lien — son texte reste", () => {
    const html = `<html><body><article><p><a href="javascript:alert(1)">piège</a></p></article></body></html>`;
    expect(extraireBlocs(html)).toEqual([
      { balise: "p", segments: [{ texte: "piège" }] },
    ]);
  });

  it("les images de l'archive deviennent des blocs propres — src http(s) et data:image seulement", () => {
    const html = `<html><body><article>
      <img src="https://x.fr/photo.jpg" alt="Une photo">
      <img src="data:image/png;base64,AAAA" alt="En ligne">
      <img src="file:///etc/passwd" alt="interdit">
      <p>Texte.</p>
    </article></body></html>`;
    const blocs = extraireBlocs(html);
    expect(blocs).toEqual([
      { balise: "img", src: "https://x.fr/photo.jpg", alt: "Une photo" },
      { balise: "img", src: "data:image/png;base64,AAAA", alt: "En ligne" },
      { balise: "p", segments: [{ texte: "Texte." }] },
    ]);
  });

  it("une image imbriquée dans des conteneurs sort UNE fois — pas une par ancêtre", () => {
    // Structure réelle des archives : des divs imbriqués autour du contenu.
    // L'ancien code hissait les images du conteneur (querySelectorAll) PUIS
    // y redescendait : chaque image ressortait une fois par ancêtre
    // conteneur, plus une fois comme enfant direct — « en plusieurs
    // exemplaires » à l'écran. L'ordre attendu est l'ordre du document,
    // les images internes à un bloc sortant avant le texte de CE bloc.
    const html = `<html><body><article>
      <div class="habillage"><div class="corps">
        <p>Avant. <img src="https://x.fr/dans-p.jpg" alt="Dans le paragraphe"></p>
        <img src="https://x.fr/directe.jpg" alt="Directe">
      </div></div>
    </article></body></html>`;
    expect(extraireBlocs(html)).toEqual([
      { balise: "img", src: "https://x.fr/dans-p.jpg", alt: "Dans le paragraphe" },
      { balise: "p", segments: [{ texte: "Avant." }] },
      { balise: "img", src: "https://x.fr/directe.jpg", alt: "Directe" },
    ]);
  });

  it("<pre> garde son texte BRUT (espaces et sauts préservés, inline aplati)", () => {
    const html = `<html><body><article>
      <pre>const x = 1;
if   (x)   {   }


  doSomething(<strong>1</strong>);</pre>
    </article></body></html>`;
    expect(extraireBlocs(html)).toEqual([
      { balise: "pre", segments: [{ texte: "const x = 1;\nif   (x)   {   }\n\n\n  doSomething(1);" }] },
    ]);
  });

  it("les listes produisent des blocs li, dans l'ordre du document", () => {
    const html = `<html><body><article>
      <p>Intro.</p>
      <ul><li>Un.</li><li>Deux.</li></ul>
      <p>Fin.</p>
    </article></body></html>`;
    const blocs = extraireBlocs(html);
    expect(blocs.map((b) => b.balise)).toEqual(["p", "li", "li", "p"]);
  });

  it("extraction vide : chaîne vide — l'état est nommé par la vue", () => {
    expect(extraireBlocs("<html><body><div></div></body></html>")).toEqual([]);
  });
});

describe("chargerContenu", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("frappe la route locale avec le Bearer, rend le HTML et la date d'archive", async () => {
    fetchMock.mockResolvedValue(new Response("<html>x</html>", {
      status: 200,
      headers: { "Content-Type": "text/html", "X-Archive-Date": "2026-09-18T10:00:00.000Z" },
    }));
    const r = await chargerContenu(42);
    expect(r.html).toBe("<html>x</html>");
    expect(r.dateArchive).toBe("2026-09-18T10:00:00.000Z");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/backup/archives/42/content");
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Bearer /);
  });

  it("une date d'archive absente reste ABSENTE (null), jamais inventée", async () => {
    fetchMock.mockResolvedValue(new Response("<html>x</html>", { status: 200 }));
    const r = await chargerContenu(42);
    expect(r.dateArchive).toBeNull();
  });

  it("le 404 nommé traverse comme ApiError ARCHIVE_ABSENTE", async () => {
    fetchMock.mockResolvedValue(new Response(
      JSON.stringify({ error: { code: "ARCHIVE_ABSENTE", message: "aucune archive" } }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    ));
    const err = await chargerContenu(42).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("ARCHIVE_ABSENTE");
  });
});
