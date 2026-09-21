# Plan — Inversion fiche ↔ lecture

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** le clic principal d'un signet (liste, mosaïque, vue collection) ouvre la *lecture* du contenu archivé ; la fiche reste en colonne de droite et l'accompagne. Non lisible → le clic ouvre la fiche, comme aujourd'hui.

**Architecture :** la règle de lisibilité de `ActionsLecture` est extraite en une fonction pure (`lisibilite`) consommée par le bouton ET par un point d'entrée unique (`useOuvrirSignet`) branché sur les trois surfaces de bibliothèque. `App.tsx` cesse d'exclure la fiche pendant la lecture ; `LectureView` perd son rail au profit d'une ligne discrète de tête ; le bloc corbeillé de `DetailPane` est extrait (dette du cliquet).

**Tech Stack :** React 19 + TypeScript (nodenext), Vitest + Testing Library (jsdom), Tailwind. Pas de nouvelle dépendance.

**Spec :** `docs/superpowers/specs/2026-09-22-inversion-fiche-lecture-design.md` — le plan argue de la spec ; les deux voyagent ensemble.

## Contraintes globales

- Imports relatifs **avec extension `.js`** pour le sidecar ; le front (Vite) importe sans extension — suivre l'existant de chaque fichier.
- Taille des fichiers : cible ≤ 300 lignes, plafond dur 400 (`scripts/build_app.py` le vérifie).
- Jamais d'innerHTML ; le front ne connaît que l'API REST locale.
- Interface en français, chaînes centralisées dans `src/i18n/fr.ts` ; aucune valeur ne porte plus d'un `|`.
- Toute exécution qui décide d'un commit capture le code de retour : `npm test > log 2>&1; rc=$?` — jamais `npm test | tail && git commit` (trap CLAUDE.md).
- Tests : `npx vitest run <fichier> ` pour un fichier, `npm test` pour la suite. Les tests App exigent les providers `QueryClientProvider` + `AppStateProvider` + `DragProvider` (sinon le contexte par défaut rend les actions no-op).
- `npm run typecheck` couvre sidecar ET front ; un `tsc` ad hoc sur un fichier front produit des faux positifs — ne pas le faire.

---

### Task 1 : `lisibilite()` — la règle pure, une seule définition

**Files:**
- Create: `src/lib/lisibilite.ts`
- Test: `src/lib/lisibilite.test.ts`

**Interfaces:**
- Consumes : `RaindropItem` de `shared/types` (champ `cache?: { status: string; size?: number } | null`).
- Produces : `lisibilite(r, archivePresente, archivageEnVol): Lisibilite` avec `type Lisibilite = { lisible: true; source: "locale" | "copie" } | { lisible: false; motif: "enVol" | "copieEchec" | "sansCopie" }`. Tasks 2 et 4 consomment exactement ces noms.

- [ ] **Step 1 : écrire le test qui échoue**

```ts
// src/lib/lisibilite.test.ts
import { describe, it, expect } from "vitest";
import { lisibilite } from "./lisibilite";
import { raindrop } from "../test/fixtures";

// La règle du clic ET du bouton « Lire » (spec inversion §3) — extraite de
// ActionsLecture pour n'exister qu'UNE fois. Table des cas, dans l'ordre où
// la fonction les juge : archive locale, archivage en vol, copie prête,
// copie en échec, rien du tout.
describe("lisibilite", () => {
  it("archive locale : lisible, source locale", () => {
    expect(lisibilite(raindrop({ id: 1 }), true, false)).toEqual({ lisible: true, source: "locale" });
  });
  it("archive locale gagne même si un archivage est en vol", () => {
    expect(lisibilite(raindrop({ id: 1 }), true, true)).toEqual({ lisible: true, source: "locale" });
  });
  it("copie prête : lisible, source copie (téléchargement à la demande)", () => {
    expect(lisibilite(raindrop({ id: 1, cache: { status: "ready" } }), false, false))
      .toEqual({ lisible: true, source: "copie" });
  });
  it("archivage en vol : non lisible — la lecture échouerait, il n'y a pas d'archive", () => {
    expect(lisibilite(raindrop({ id: 1, cache: { status: "ready" } }), false, true))
      .toEqual({ lisible: false, motif: "enVol" });
  });
  it("copie en échec : non lisible, motif copieEchec", () => {
    expect(lisibilite(raindrop({ id: 1, cache: { status: "failed" } }), false, false))
      .toEqual({ lisible: false, motif: "copieEchec" });
  });
  it("rien du tout : non lisible, motif sansCopie", () => {
    expect(lisibilite(raindrop({ id: 1, cache: null }), false, false))
      .toEqual({ lisible: false, motif: "sansCopie" });
  });
});
```

- [ ] **Step 2 : constater l'échec**

Run: `npx vitest run src/lib/lisibilite.test.ts`
Expected : FAIL — le module `./lisibilite` n'existe pas (erreur d'import, pas une assertion).

- [ ] **Step 3 : implémenter la fonction minimale**

```ts
// src/lib/lisibilite.ts
import type { RaindropItem } from "../../shared/types";

// La règle de lisibilité (spec inversion §3) : UNE définition pour le clic
// des vues de bibliothèque ET le bouton « Lire » de la fiche. L'ordre des
// jugements EST la règle : l'archive locale gagne toujours ; sinon un
// archivage en vol bloque (la lecture échouerait sur un fichier absent) ;
// sinon une copie prête rend lisible par téléchargement à la demande.
export type Lisibilite =
  | { lisible: true; source: "locale" | "copie" }
  | { lisible: false; motif: "enVol" | "copieEchec" | "sansCopie" };

export function lisibilite(
  r: Pick<RaindropItem, "cache">,
  archivePresente: boolean,
  archivageEnVol: boolean,
): Lisibilite {
  if (archivePresente) return { lisible: true, source: "locale" };
  if (archivageEnVol) return { lisible: false, motif: "enVol" };
  if (r.cache?.status === "ready") return { lisible: true, source: "copie" };
  return { lisible: false, motif: r.cache != null ? "copieEchec" : "sansCopie" };
}
```

- [ ] **Step 4 : constater le vert**

Run: `npx vitest run src/lib/lisibilite.test.ts`
Expected : PASS — 6/6.

- [ ] **Step 5 : commit**

```bash
git add src/lib/lisibilite.ts src/lib/lisibilite.test.ts
git commit -m "feat(front): lisibilite() — la règle de lecture en une seule définition

Co-Authored-By: GLM 5.3 <noreply@z.ai>"
```

---

### Task 2 : le clic inversé — `useOuvrirSignet`, les trois surfaces, la coque

**Files:**
- Modify: `src/App.test.tsx` (paramètre du mock + deux tests + mock du module lecture)
- Create: `src/hooks/useOuvrirSignet.ts`
- Modify: `src/components/ListPane.tsx` (trois appels : `surEntree` clavier, `onOpen` mosaïque, `poignee` ligne)
- Modify: `src/components/CollectionView.tsx:62` (un appel : `poignee`)
- Modify: `src/App.tsx:71` (`detailOuvert`)

**Interfaces:**
- Consumes : `lisibilite` (Task 1), `useArchives().data?.set` et `useJobsEnVol().data` de `hooks/useBackup`, `useAppState()` (`view`, `go`, `selectRaindrop`).
- Produces : `useOuvrirSignet(): (r: RaindropItem) => void` — lisible → `go({ kind: "lecture", raindropId, label, sourceCopie?, returnView: view })` PUIS `selectRaindrop(r.id)` ; sinon `selectRaindrop(r.id)` seul. Le contrat `sourceCopie` : ABSENT quand la source est « locale » (un `false` explicite serait un état de plus à lire — même contrat que `ActionsLecture`).

- [ ] **Step 1 : préparer le mock — `mockApi` gagne un paramètre `archives`, et le module lecture est mocké**

Dans `src/App.test.tsx`, hoister un nouveau mock (à côté de `getMock`/`sendMock`) :

```ts
const chargerMock = vi.hoisted(() => vi.fn());
```

Mocker le module lecture (après les mocks existants) — `extraireBlocs` reste RÉEL (pur, marche en jsdom) :

```ts
vi.mock("./lib/lecture", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/lecture")>()),
  chargerContenu: chargerMock,
}));
```

Paramétrer `mockApi` (signature + la branche archives) :

```ts
function mockApi(mcp: string, archivesIds: number[] = []) {
  getMock.mockReset().mockImplementation((path: string) => {
    // …toutes les branches existantes inchangées, SAUF celle-ci…
    if (path === "/api/backup/archives") return Promise.resolve({ ids: archivesIds, octets: archivesIds.length * 5 });
    // …fin des branches existantes…
    return Promise.resolve({ status: "ok", mcp });
  });
}
```

Et dans `beforeEach`, après `mockApi("connected")` :

```ts
chargerMock.mockReset().mockResolvedValue({
  html: "<html><body><p>Lu.</p></body></html>",
  dateArchive: "2026-09-20T08:00:00.000Z",
});
```

- [ ] **Step 2 : écrire les deux tests qui échouent (le premier) et la garde (le second)**

À la fin du `describe("App")` :

```ts
// Spec inversion §3/§4 : le clic ouvre la LECTURE et la fiche l'accompagne.
// Le clic passe par la VRAIE ligne (poignee → useDragBookmark → le futur
// useOuvrirSignet) — un pilote selectRaindrop court-circuiterait la décision.
it("clic sur une ligne archivée : lecture ouverte ET fiche toujours là", async () => {
  mockApi("connected", [1000]); // l'archive locale existe → le clic lit
  render(<App onEtat={vi.fn()} />, { wrapper });
  await userEvent.click(await screen.findByTestId("row-1000"));
  // La lecture est ouverte…
  expect(await screen.findByRole("button", { name: "Fermer la lecture" })).toBeInTheDocument();
  // …et la fiche l'accompagne (App ne l'exclut plus pendant la lecture).
  expect(screen.getByRole("button", { name: "Fermer le détail" })).toBeInTheDocument();
});

// La garde du périmètre : non lisible → clic = fiche, la vue reste. Avant le
// lot c'était le SEUL comportement du clic ; il doit survivre à l'inversion.
it("clic sur une ligne non lisible : fiche seule, la liste reste", async () => {
  render(<App onEtat={vi.fn()} />, { wrapper }); // archives [] par défaut
  await userEvent.click(await screen.findByTestId("row-1000"));
  expect(await screen.findByRole("button", { name: "Fermer le détail" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Fermer la lecture" })).not.toBeInTheDocument();
  expect(screen.getByTestId("row-1000")).toBeInTheDocument();
});
```

- [ ] **Step 3 : constater l'échec du premier, le vert du second**

Run: `npx vitest run src/App.test.tsx`
Expected : « clic sur une ligne archivée » FAIL (pas de « Fermer la lecture » — le clic actuel ouvre la fiche seule) ; « non lisible » PASS (c'est le comportement d'aujourd'hui, verrouillé) ; les autres tests inchangés au vert.

- [ ] **Step 4 : implémenter le hook**

```ts
// src/hooks/useOuvrirSignet.ts
import { useAppState } from "../state/appState";
import { useArchives, useJobsEnVol } from "./useBackup";
import { lisibilite } from "../lib/lisibilite";
import type { RaindropItem } from "../../shared/types";

/** Le point d'entrée unique du clic de bibliothèque (spec inversion §3) :
 *  lisible → la lecture s'ouvre (returnView = la vue courante) ET la fiche
 *  l'accompagne ; non lisible → la fiche seule, où la raison est nommée.
 *  Le clic ne tombe JAMAIS sur un écran d'échec. */
export function useOuvrirSignet() {
  const { view, go, selectRaindrop } = useAppState();
  const archives = useArchives().data?.set;
  const jobs = useJobsEnVol();
  const archivageEnVol = jobs.data?.some((j) => j.type === "archive") === true;
  return (r: RaindropItem) => {
    const etat = lisibilite(r, archives?.has(r.id) === true, archivageEnVol);
    if (!etat.lisible) {
      selectRaindrop(r.id);
      return;
    }
    go({
      kind: "lecture",
      raindropId: r.id,
      label: r.title,
      ...(etat.source === "copie" ? { sourceCopie: true } : {}),
      returnView: view,
    });
    selectRaindrop(r.id);
  };
}
```

- [ ] **Step 5 : brancher les trois surfaces et la coque**

Dans `src/components/ListPane.tsx` : importer `useOuvrirSignet`, instancier près de `drag` :

```ts
const ouvrir = useOuvrirSignet();
```

Remplacer les trois appels :

```ts
// surEntree (≈ ligne 82) — le clavier passe par la MÊME décision que le clic :
surEntree: (i) => {
  const r = items[i];
  if (r !== undefined) ouvrir(r);
},
// mosaïque (≈ ligne 153) :
<MosaicTile … onOpen={() => ouvrir(r)} … />
// ligne de liste (≈ ligne 180) :
poignee={drag.poignee(r.id, () => ouvrir(r), r.title)}
```

Retirer `selectRaindrop` de la déstructuration de `useAppState()` (ligne 26) s'il n'a plus d'autre usage — `npx tsc -p tsconfig.front.json --noEmit --noUnusedLocals` le dira (Step 7).

Dans `src/components/CollectionView.tsx` (ligne 62) :

```ts
const poignee = (r: RaindropItem) => drag.poignee(r.id, () => ouvrir(r), r.title);
```

(même instanciation du hook, même retrait de `selectRaindrop` si mort.)

Dans `src/App.tsx` (ligne 71) — la fiche accompagne la lecture, elle ne cède plus :

```ts
// Spec inversion §4 : la fiche ACCOMPAGNE la lecture (colonne de droite) —
// l'exclusion de la vue lecture est retirée. La sélection reste posée par
// le clic (useOuvrirSignet pose view ET selectedRaindropId ensemble).
const detailOuvert = selectedRaindropId !== null;
```

- [ ] **Step 6 : constater le vert**

Run: `npx vitest run src/App.test.tsx`
Expected : PASS — les deux nouveaux tests et tous les existants.

- [ ] **Step 7 : contrôler les imports morts puis commit**

Run: `npx tsc -p tsconfig.front.json --noEmit --noUnusedLocals`
Expected : pas d'erreur (les imports/déstructurations morts seraient signalés — le typecheck ordinaire les laisse passer).

```bash
git add src/App.test.tsx src/hooks/useOuvrirSignet.ts src/components/ListPane.tsx src/components/CollectionView.tsx src/App.tsx
git commit -m "feat(front): le clic de bibliothèque ouvre la lecture — la fiche l'accompagne

Co-Authored-By: GLM 5.3 <noreply@z.ai>"
```

---

### Task 3 : LectureView sans rail — la ligne de tête porte provenance · date · temps

**Files:**
- Modify: `src/components/LectureView.tsx` (rewriting ciblé : rail supprimé, ligne ajoutée)
- Modify: `src/components/LectureView.test.tsx` (adaptation du premier et du deuxième test)
- Modify: `src/i18n/fr.ts:81` (clé `lecture.rail` retirée)

**Interfaces:**
- Consumes : rien de nouveau — `t`, `dateLue`, `minutes`, `sourceCopie` existent dans la vue. Les clés `lecture.badgeLocale`, `lecture.badgeCopie`, `lecture.date`, `lecture.temps` sont réutilisées telles quelles ; seule `lecture.rail` disparaît.
- Produces : la vue rend UNE ligne `<p className="text-xs text-app-muted">` dont le `textContent` est `« {provenance} · Archive du {date} · ≈ {n} min de lecture »` (la date omise si l'en-tête `X-Archive-Date` manquait). App.test (Task 2) n'assert pas cette ligne ; les tests LectureView si.

- [ ] **Step 1 : adapter les deux tests (RED)**

Dans `src/components/LectureView.test.tsx`, remplacer le premier test par :

```ts
it("rend le texte en colonne serif ; la ligne de tête porte provenance · date · temps", async () => {
  injecterRegles(".lecture-corps");
  await ouvrir();
  const titre = await screen.findByText("Un titre de lecture");
  expect(titre.tagName).toBe("H2"); // la whitelist reconstruit de VRAIS éléments
  const article = document.querySelector(".lecture-corps");
  expect(article).not.toBeNull();
  expect(getComputedStyle(article!).fontFamily).toContain("serif");
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
```

Dans le deuxième test, le texte composé exige des matchers (le `<p>` contient désormais les trois segments) :

```ts
await userEvent.click(screen.getByText("ouvrir"));
expect(await screen.findByText(/copie permanente/)).toBeInTheDocument();
expect(screen.queryByText(/archive locale/)).not.toBeInTheDocument();
```

- [ ] **Step 2 : constater l'échec**

Run: `npx vitest run src/components/LectureView.test.tsx`
Expected : le premier test FAIL (le rail rend encore titre/domaine/étiquettes ; la ligne composée n'existe pas). Les autres restent verts (le badge « copie permanente » existe déjà dans le rail).

- [ ] **Step 3 : réécrire LectureView — le rail sort, la ligne entre**

Le composant final (fichier `src/components/LectureView.tsx` — les imports perdent `useCollections` ; tout le reste du haut du fichier est inchangé, y compris `dateArchive`, `nommerErreur`, `IssuePageWeb`, `renduBloc`) :

```tsx
export function LectureView({
  view,
  goBack,
}: {
  view: Extract<View, { kind: "lecture" }>;
  goBack: () => void;
}) {
  const { raindropId, sourceCopie } = view;
  // La fiche a DÉJÀ chargé ["raindrop", id] : le cache de react-query sert
  // cette requête sans nouvelle requête réseau. Elle porte l'URL de l'issue
  // « Voir la page » — le rail des métadonnées vit désormais dans la fiche.
  const detail = useQuery<RaindropItem>({
    queryKey: ["raindrop", raindropId],
    queryFn: () => api.get<RaindropItem>(`/api/raindrops/${raindropId}`),
  });
  const contenu = useQuery({
    queryKey: ["archive-content", raindropId],
    queryFn: () => chargerContenu(raindropId),
  });
  const r = detail.data;
  const blocs = contenu.data ? extraireBlocs(contenu.data.html) : [];
  const mots = blocs.reduce(
    (n, b) => n + (b.balise === "img" ? 0 : b.segments.reduce((m, s) => m + s.texte.split(/\s+/).filter(Boolean).length, 0)),
    0,
  );
  const minutes = Math.max(1, Math.round(mots / 220));
  const dateLue = contenu.data ? dateArchive(contenu.data.dateArchive) : null;

  let interieur: ReactNode;
  // …bloc inchangé (pending / erreur nommée / extraction vide / article)…

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[66ch] flex-col gap-3 px-6 py-8">
        {/* La ligne de tête (spec inversion §5) : provenance · date · temps —
            la fraîcheur de ce qu'on lit, sans un rail qui dupliquerait la
            fiche. Absente tant que le contenu n'est pas là. */}
        <div className="flex items-start justify-between gap-3">
          {contenu.data && blocs.length > 0 && (
            <p className="text-xs text-app-muted">
              {[
                t(sourceCopie ? "lecture.badgeCopie" : "lecture.badgeLocale"),
                dateLue ? t("lecture.date", { date: dateLue }) : null,
                t("lecture.temps", { n: minutes }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          <button type="button" className="btn btn-icone" aria-label={t("lecture.fermer")} onClick={goBack}>
            <Icone nom="croix" />
          </button>
        </div>
        {interieur}
      </div>
    </div>
  );
}
```

Retirer : l'`<aside>` du rail en entier, `useCollections`/`arbre`/`collection`, et le wrapper `flex h-full` externe (la colonne devient la vue entière).

- [ ] **Step 4 : retirer la clé morte du dictionnaire**

Dans `src/i18n/fr.ts`, supprimer la ligne `"lecture.rail": "Métadonnées",` (l'aria-label du rail disparu — le test du dictionnaire n'aime pas plus les clés mortes que les `|` en surnombre ; le typecheck signale toute référence restante).

- [ ] **Step 5 : constater le vert**

Run: `npx vitest run src/components/LectureView.test.tsx src/App.test.tsx`
Expected : PASS partout (App.test ne lit pas la ligne ; la garde du clic reste verte).

- [ ] **Step 6 : commit**

```bash
git add src/components/LectureView.tsx src/components/LectureView.test.tsx src/i18n/fr.ts
git commit -m "feat(front): la lecture perd son rail — une ligne de tête porte provenance, date et temps

Co-Authored-By: GLM 5.3 <noreply@z.ai>"
```

---

### Task 4 : ActionsLecture — consommer `lisibilite`, masquer « Lire » pendant la lecture du même signet

**Files:**
- Modify: `src/components/ActionsLecture.tsx`
- Modify: `src/components/ActionsLecture.test.tsx` (deux tests ajoutés)

**Interfaces:**
- Consumes : `lisibilite` (Task 1) ; `useAppState().view`.
- Produces : rien d'exporté — comportement : « Lire » masqué quand `view.kind === "lecture" && view.raindropId === r.id` ; « Voir la page » toujours rendu.

- [ ] **Step 1 : écrire les deux tests (RED)**

Dans `src/components/ActionsLecture.test.tsx`, ajouter un poseur de vue et deux tests :

```tsx
const PoseurLecture = ({ id }: { id: number }) => {
  const { go } = useAppState();
  return (
    <button type="button" onClick={() => go({ kind: "lecture", raindropId: id, label: "T" })}>
      poser-lecture-{id}
    </button>
  );
};
const renderActionsAvecVue = (r: RaindropItem, idLecture: number) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppStateProvider>
        <PoseurLecture id={idLecture} />
        <Harnais r={r} />
      </AppStateProvider>
    </QueryClientProvider>,
  );

// §9 : un seul point d'entrée par geste — le clic vient d'ouvrir cette
// lecture, le bouton redirait ce qui est déjà fait.
it("la lecture du MÊME signet masque « Lire » ; « Voir la page » reste", async () => {
  archivesMock.mockReturnValue({ data: { set: new Set([1000]), octets: 10 } });
  renderActionsAvecVue(raindrop({ id: 1000 }), 1000);
  await userEvent.click(screen.getByText("poser-lecture-1000"));
  expect(screen.queryByRole("button", { name: "Lire" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Voir la page" })).toBeInTheDocument();
});

it("la lecture d'un AUTRE signet laisse « Lire » — la fiche propose toujours le geste", async () => {
  archivesMock.mockReturnValue({ data: { set: new Set([1000]), octets: 10 } });
  renderActionsAvecVue(raindrop({ id: 1000 }), 9999);
  await userEvent.click(screen.getByText("poser-lecture-9999"));
  expect(screen.getByRole("button", { name: "Lire" })).toBeInTheDocument();
});
```

- [ ] **Step 2 : constater l'échec**

Run: `npx vitest run src/components/ActionsLecture.test.tsx`
Expected : le premier FAIL (« Lire » encore rendu) ; le second PASS ; les sept existants restent verts.

- [ ] **Step 3 : implémenter — une seule définition de la règle + le masquage**

Dans `src/components/ActionsLecture.tsx`, importer et remplacer le calcul de `raison` par la règle partagée (les libellés restent ici, la règle vit dans `lisibilite`) :

```tsx
import { lisibilite } from "../lib/lisibilite";
// …
const { view } = useAppState(); // étendre la déstructuration existante
const etat = lisibilite(r, locale, archivageEnVol);
const raison = etat.lisible
  ? null
  : etat.motif === "enVol"
    ? t("detail.lireAttente")
    : etat.motif === "copieEchec"
      ? t("detail.lireCopieEchec", { raison: t(LIBELLES_COPIE[r.cache?.status ?? ""] ?? "copie.inconnue") })
      : t("detail.lireSansCopie");
// §9 : un seul point d'entrée par geste — pendant la lecture de CE signet,
// le bouton redirait ce qui est déjà fait.
const dejaLue = view.kind === "lecture" && view.raindropId === r.id;
```

Supprimer la variable `prete` (absorbée par `lisibilite`). Rendu — « Lire » et sa raison disparaissent, « Voir la page » reste TOUJOURS (il est l'issue de secours partout, spec lecture §5) :

```tsx
<div className="flex flex-wrap gap-2">
  {!dejaLue && (
    <button type="button" className="btn" disabled={raison != null} onClick={lire}>
      {t("detail.lire")}
    </button>
  )}
  <button
    type="button"
    className="btn"
    onClick={() => void ouvrirPageWeb(r.url).catch(() => undefined)}
  >
    {t("detail.voirPage")}
  </button>
</div>
{raison && !dejaLue && <p className="text-xs text-app-muted">{raison}</p>}
```

(`dejaLue` implique lisible — on n'ouvre jamais la lecture d'un signet non lisible — donc `raison` est déjà null dans ce cas ; le `!dejaLue` du paragraphe est un filet, pas une branche attendue.)

- [ ] **Step 4 : constater le vert**

Run: `npx vitest run src/components/ActionsLecture.test.tsx`
Expected : PASS — 9/9.

- [ ] **Step 5 : commit**

```bash
git add src/components/ActionsLecture.tsx src/components/ActionsLecture.test.tsx
git commit -m "feat(front): « Lire » se masque pendant la lecture du même signet — la règle de lisibilité n'existe qu'une fois

Co-Authored-By: GLM 5.3 <noreply@z.ai>"
```

---

### Task 5 : le bloc corbeillé quitte DetailPane (dette du cliquet)

**Files:**
- Create: `src/components/DetailPane.corbeille.tsx`
- Modify: `src/components/DetailPane.tsx`
- Test: `src/components/DetailPane.corbeille.test.tsx` — **ne change pas** : il rend `DetailPane`, qui rendra le composant extrait ; son vert prouve le refactor.

**Interfaces:**
- Consumes : `useUnrestore()` (`hooks/useMutations`), `useCollections()` (`hooks/useStaticData`), `RaindropItem`.
- Produces : `RestaurationCorbeille({ r }: { r: RaindropItem })` — bouton « Restaurer » (origine mémorisée ou destination choisie), sélecteur si origine inconnue, erreur inline. DétailPane l'emploie pour `r.collectionId === -99`.

- [ ] **Step 1 : le filet de sécurité passe avant le geste**

Run: `npx vitest run src/components/DetailPane.corbeille.test.tsx src/components/DetailPane.test.tsx`
Expected : PASS — c'est l'état de départ ; tout rouge AVANT extraction = un défaut préexistant à régler d'abord.

- [ ] **Step 2 : extraire le composant**

```tsx
// src/components/DetailPane.corbeille.tsx
import { useEffect, useState } from "react";
import { t } from "../i18n/fr";
import { useUnrestore } from "../hooks/useMutations";
import { useCollections } from "../hooks/useStaticData";
import type { RaindropItem } from "../../shared/types";

// Le bloc corbeillé de la fiche (§4.2 — la corbeille Raindrop ne garde pas
// les origines) : « Restaurer » à l'origine mémorisée, sinon un sélecteur de
// destination. Extrait de DetailPane (cliquet de build_app.py : la fiche
// dépassait la cible de 300) — son test, DetailPane.corbeille.test.tsx,
// couvre le comportement à travers DetailPane et suit sans changer.
export function RestaurationCorbeille({ r }: { r: RaindropItem }) {
  const unrestore = useUnrestore();
  const arbre = useCollections().data ?? [];
  const [destInconnue, setDestInconnue] = useState(false);
  const [dest, setDest] = useState("");
  // Changer d'item réarme le sélecteur — le même reset que la fiche portait
  // avant l'extraction (son useEffect), restreint à ce qui appartient ici.
  useEffect(() => {
    setDestInconnue(false);
    setDest("");
    unrestore.reset();
    // Dépendances volontairement limitées à r.id : le reset suit le CHANGEMENT
    // d'item, pas chaque re-render (unreset est une instance neuve par rendu).
  }, [r.id]);

  return (
    <>
      <button
        type="button"
        className="rounded border border-app-border px-2 py-1 text-xs"
        disabled={destInconnue && dest === ""}
        onClick={() =>
          void unrestore.mutateAsync(
            destInconnue ? { ids: [r.id], toCollectionId: Number(dest) } : { ids: [r.id] },
          ).then(
            (res) => setDestInconnue((res.unknown ?? []).includes(r.id)),
            () => { /* erreur inline via unrestore.isError ci-dessous */ },
          )
        }
      >
        {t("detail.restore")}
      </button>
      {destInconnue && (
        <>
          <span className="shrink-0 text-xs text-app-broken">{t("cleanup.unknown-origin")}</span>
          <select
            aria-label={t("bulk.destination")}
            className="input w-36 shrink-0"
            value={dest}
            onChange={(e) => setDest(e.target.value)}
          >
            <option value="">{t("bulk.chooseCollection")}</option>
            {arbre.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.title}
              </option>
            ))}
          </select>
        </>
      )}
      {unrestore.isError && (
        <p role="alert" className="text-xs text-app-broken">
          {t("state.error", { message: String(unrestore.error?.message ?? "") })}
        </p>
      )}
    </>
  );
}
```

(Sortie d'erreur : elle était agrégée dans la ligne commune de la fiche ; elle devient inline dans le bloc — même contenu, même `role="alert"`, plus proche du geste qui l'a causée.)

- [ ] **Step 3 : DetailPane consomme le bloc**

Dans `src/components/DetailPane.tsx` :

- retirer `useUnrestore` des imports, les states `destInconnue`/`dest`, leurs resets dans le `useEffect` (garder `setEditing(false); setDraft({}); update.reset(); trash.reset();`) ;
- remplacer la branche `r.collectionId === -99 ? (<>…bouton Restaurer + sélecteur…</>) : (…bouton Corbeille…)` par :

```tsx
{r.collectionId === -99 ? (
  <RestaurationCorbeille r={r} />
) : (
  <button
    type="button"
    className="rounded border border-app-broken px-2 py-1 text-xs text-app-broken"
    onClick={() => void trash.mutateAsync({ id: r.id, from: r.collectionId }).catch(() => { /* inline via trash.isError */ })}
  >
    {t("detail.trash")}
  </button>
)}
```

- dans l'alerte agrégée du bas, retirer `unrestore` : `(update.isError || trash.isError)` avec `(update.error ?? trash.error)?.message`.

- [ ] **Step 4 : constater le vert et le cliquet**

Run: `npx vitest run src/components/DetailPane.corbeille.test.tsx src/components/DetailPane.test.tsx && wc -l src/components/DetailPane.tsx src/components/DetailPane.corbeille.tsx`
Expected : tests PASS, `DetailPane.tsx` sous 300 lignes, le nouveau fichier aussi.

- [ ] **Step 5 : commit**

```bash
git add src/components/DetailPane.corbeille.tsx src/components/DetailPane.tsx
git commit -m "refactor(front): le bloc corbeillé quitte DetailPane — la fiche repasse sous la cible

Co-Authored-By: GLM 5.3 <noreply@z.ai>"
```

---

### Task 6 : les vues de Nettoyage gardent clic → fiche (garde anti-régression)

**Files:**
- Modify: `src/components/CleanupView.test.tsx` (un test ajouté — le composant ne change PAS : c'est une garde qui verrouille le périmètre de l'inversion, spec §2 « Bibliothèque seulement »)

**Interfaces:**
- Consumes : rien de nouveau. Le Spy du harnais expose déjà `view` et `selection`.

- [ ] **Step 1 : écrire la garde (elle doit passer immédiatement — c'est son but)**

Dans `src/components/CleanupView.test.tsx`, dans le `describe` existant :

```tsx
// Garde de la spec inversion §2 : l'inversion ne touche que la bibliothèque.
// Le clic d'une ligne de Nettoyage ouvre la FICHE et laisse la vue — le
// branchement de useOuvrirSignet sur ces lignes serait un défaut.
it("clic sur une ligne : la fiche s'ouvre, la vue reste — jamais la lecture", async () => {
  raindropsMock.mockReturnValue({
    data: { items: [raindrop({ id: 1000, collectionId: -99 })], count: 1, page: 0, perPage: 50 },
  });
  render(<CleanupView type="trash" />, { wrapper });
  await userEvent.click(await screen.findByText("Article exemple"));
  expect(screen.getByTestId("selection").textContent).toBe("1000");
  expect(JSON.parse(screen.getByTestId("view").textContent!)).toEqual({ kind: "cleanupView", type: "trash" });
  expect(screen.queryByRole("button", { name: "Fermer la lecture" })).not.toBeInTheDocument();
});
```

(Si le clic sur le titre ne déclenche pas la sélection dans ce harnais — les lignes de corbeille enveloppent leur `onClick` dans `Ligne` et le titre remonte — cliquer la ligne porteuse : `screen.findByText("Article exemple").closest("[data-nav]")`.)

- [ ] **Step 2 : constater le vert (et sinon, traiter comme une régression du Task 2)**

Run: `npx vitest run src/components/CleanupView.test.tsx`
Expected : PASS. Un échec ici signifierait que le branchement Task 2 a touché CleanupView — revenir vérifier `src/components/CleanupView.tsx` (ses `selectRaindrop` ne doivent pas avoir changé).

- [ ] **Step 3 : commit**

```bash
git add src/components/CleanupView.test.tsx
git commit -m "test(front): garde — le clic de Nettoyage reste fiche, jamais la lecture

Co-Authored-By: GLM 5.3 <noreply@z.ai>"
```

---

### Task 7 : la documentation suit — spec lecture, DESIGN §12, ROADMAP

**Files:**
- Modify: `docs/superpowers/specs/2026-09-19-lecture-et-page-web-design.md` (§1 et §8)
- Modify: `docs/DESIGN.md` (§12)
- Modify: `docs/ROADMAP.md` (deux entrées)

**Interfaces:** aucune — documents.

- [ ] **Step 1 : amender la spec lecture**

Dans `docs/superpowers/specs/2026-09-19-lecture-et-page-web-design.md`, §1, remplacer la phrase « Un seul point d'entrée en v1 : la **fiche** (panneau détail). Les lignes de liste, la mosaïque et les vues de Nettoyage n'y viennent qu'à la demande. » par :

> Un seul point d'entrée en v1 : la **fiche** (panneau détail). **Amendé le
> 2026-09-22 (spec inversion)** : le clic principal des vues de bibliothèque
> (liste, mosaïque, vue collection) ouvre directement la lecture — « lecture
> sinon fiche », jamais un écran d'échec d'un clic ; la fiche accompagne la
> lecture en colonne. Les vues de Nettoyage gardent clic → fiche.

Dans le même fichier, §8, remplacer la puce « **Un seul point d'entrée (la fiche) ; les lignes et tuiles n'y viennent pas en v1.** » par :

> - **Un seul point d'entrée (la fiche) ; les lignes et tuiles n'y viennent
>   pas en v1** — amendé le 2026-09-22 : le clic inversé les y amène
>   (`docs/superpowers/specs/2026-09-22-inversion-fiche-lecture-design.md`).

- [ ] **Step 2 : réécrire DESIGN §12**

Dans `docs/DESIGN.md`, §12 :

- remplacer la puce « **Le rail droit** (260 px, filet `line`) : titre … moitié du diagnostic. » par :

> - **Une ligne de tête discrète** : provenance (« archive locale » / « copie
>   permanente »), **date de l'archive** et temps de lecture, séparés par des
>   points médians — lire sans montrer la fraîcheur de ce qu'on lit cacherait
>   la moitié du diagnostic. Le titre, le domaine, la collection et les
>   étiquettes vivent dans la fiche voisine : les dupliquer ferait deux
>   sources de vérité.

- remplacer la puce « **La fiche cède la place** pendant la lecture… » par :

> - **La fiche accompagne la lecture** (colonne de droite, 320 px) : le clic
>   d'un signet de bibliothèque ouvre le contenu lu, les actions d'édition
>   restent visibles pendant la lecture. « Lire » y disparaît quand c'est
>   déjà ce signet qu'on lit — un seul point d'entrée par geste (§9). La
>   sélection reste — en revenant, la fiche est encore là.

- les puces serif, étiquettes-ligne, surlignages, états nommés restent inchangées.

- [ ] **Step 3 : solder dans la ROADMAP**

Dans `docs/ROADMAP.md` : déplacer l'entrée « **Inversion fiche ↔ lecture** » (UX) et l'entrée « **`DetailPane.tsx` à découper** » (Perf/dette) dans la section « Soldé (renvois) » en une entrée :

> - **Inversion fiche ↔ lecture** (livré le 2026-09-22) : le clic de
>   bibliothèque ouvre la lecture (lisibilité partagée clic/bouton,
>   « lecture sinon fiche »), la fiche accompagne en colonne, la ligne de
>   tête remplace le rail ; DetailPane découpé (bloc corbeillé). Spec
>   `docs/superpowers/specs/2026-09-22-inversion-fiche-lecture-design.md`.
>   Détail : CHANGELOG.

- [ ] **Step 4 : commit**

```bash
git add docs/superpowers/specs/2026-09-19-lecture-et-page-web-design.md docs/DESIGN.md docs/ROADMAP.md
git commit -m "docs: l'inversion fiche-lecture rejoint la spec lecture, DESIGN §12 et la ROADMAP

Co-Authored-By: GLM 5.3 <noreply@z.ai>"
```

---

### Task 8 : vérification finale du lot

**Files:** aucun — contrôles.

- [ ] **Step 1 : la suite complète, code de retour capturé**

```bash
npm test > /tmp/test-inversion.log 2>&1; rc=$?; echo "rc=$rc"; tail -5 /tmp/test-inversion.log
```

Expected : `rc=0`, tous les tests au vert (la ligne `rc=` est le verdict — pas le `tail`).

- [ ] **Step 2 : typecheck complet + imports morts du front**

```bash
npm run typecheck && npx tsc -p tsconfig.front.json --noEmit --noUnusedLocals
```

Expected : les deux silencieux (le second attrape les `selectRaindrop`/imports devenus morts que le typecheck ordinaire laisse passer).

- [ ] **Step 3 : le cliquet**

```bash
python3 - <<'EOF'
import pathlib
for p in ["src/components/DetailPane.tsx", "src/components/LectureView.tsx",
          "src/components/ActionsLecture.tsx", "src/hooks/useOuvrirSignet.ts",
          "src/lib/lisibilite.ts", "src/components/DetailPane.corbeille.tsx"]:
    n = len(pathlib.Path(p).read_text().splitlines())
    print(f"{n:4} {p}")
EOF
```

Expected : tous ≤ 300 (plafond dur 400) ; `DetailPane.tsx` repassé sous la cible.

- [ ] **Step 4 : rapport de lot** — résumer : les tasks livrées, les tests ajoutés, ce qui reste au réel (la vérification d'usage par l'utilisateur : clic-liste → lecture, fiche à droite, « Lire » masqué, Nettoyage inchangé), et l'entrée CHANGELOG à écrire au moment de la release.
