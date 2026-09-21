# Spec — Inversion fiche ↔ lecture

**2026-09-22** — validée avec l'utilisateur le jour même ; les trois décisions
structurantes ont été tranchées en revue avant rédaction. Amende la spec
lecture (`2026-09-19-lecture-et-page-web-design.md` §1 et §8) et DESIGN §12 :
l'entrée unique par la fiche et « la fiche cède la place » sont remplacés par
le clic inversé. L'arbitrage d'origine est `docs/KARAKEEP.md` §6.2 ; la
ROADMAP le porte depuis le 2026-09-21.

## 1. La demande

Aujourd'hui, cliquer un signet ouvre la fiche (colonne 320 px) ; la lecture
n'est joignable que par son bouton « Lire ». Karakeep fait l'inverse — « le
contenu avant la fiche » (§3 de l'analyse) — et l'analyse recommandait de
nous en inspirer. Le lot inverse le geste : **le clic principal ouvre le
contenu lu, la fiche devient la surface qui l'accompagne**.

## 2. Décisions tranchées avec l'utilisateur

| Question | Tranché | Écarté, et pourquoi |
|---|---|---|
| Place de la fiche pendant la lecture | **Colonne de droite permanente** — le clic ouvre la lecture dans la zone principale, la fiche reste à droite (client mail). Aucun contrôle nouveau, les actions d'édition restent visibles | Onglets Lecture \| Fiche (littéral Karakeep) : un contrôle de plus, éditer en pleine lecture demande une bascule. Panneau repliable : contre l'épure §9, deux gestes pour revenir |
| Clic sur un signet non lisible | **Lecture sinon fiche** — le clic ne tombe JAMAIS sur un écran d'échec ; il ouvre la fiche, où la raison est nommée | Toujours la lecture : un clic ordinaire sur un signet non archivé atterrirait sur un état d'échec — la majorité de la bibliothèque n'a pas d'archive |
| Périmètre | **Bibliothèque seulement** (liste, mosaïque, vue collection parente) ; les vues du Nettoyage gardent clic → fiche | Partout : les vues de Nettoyage sont des écrans de diagnostic où le clic-fiche était un correctif explicite du 2026-09-19 ; la lecture y reste joignable par « Lire » |

## 3. La règle de clic — une seule définition

La logique de lisibilité de `ActionsLecture` (la `raison` : archive locale →
nulle ; copie `ready` → nulle ; copie en échec → sa raison ; rien →
« sans copie » ; archivage en vol → attente) est **extraite en une fonction
pure**, employée par le bouton ET par le clic :

```
lisibilite(r, archivePresente, archivageEnVol)
  → { lisible: boolean, source: "locale" | "copie" }
```

- archive locale présente → lisible, source « locale » ;
- sinon copie `cache.status === "ready"` et aucun archivage en vol →
  lisible, source « copie » (la vue conduira le téléchargement, §7) ;
- sinon — rien du tout, copie en échec, archivage déjà en vol — non lisible.

Un point d'entrée unique `ouvrirSignet(r)` : lisible → `go({ kind:
"lecture", raindropId, label, sourceCopie?, returnView: view })` **et**
`selectRaindrop(r.id)` ; non lisible → `selectRaindrop(r.id)` seul.
Appelants : `RaindropRow` (liste), les tuiles de mosaïque (`ListPane`), les
lignes de `CollectionView`. Les vues du Nettoyage ne l'emploient pas : leur
clic reste `selectRaindrop`.

## 4. La coque pendant la lecture

`App.tsx` : `detailOuvert = selectedRaindropId !== null` — l'exclusion
`view.kind !== "lecture"` est retirée. La zone principale porte la lecture,
la colonne 3 porte la fiche. **Invariant posé par l'unique point d'entrée** :
pendant la lecture, `selectedRaindropId === view.raindropId` — la fiche
accompagne TOUJOURS le signet qu'on lit. Fermer la lecture (`vueDeRetour`,
inchangé) rend la vue d'origine, fiche encore ouverte — la sélection reste,
même règle qu'aujourd'hui.

## 5. LectureView sans rail

Le rail droit (260 px) est **supprimé** : titre, domaine, collection et
étiquettes sont déjà dans la fiche voisine — les dupliquer au pixel près
retournerait au défaut que §12 fuyait (« fiche + rail dupliqueraient tout »).

Ses diagnostics **propres à l'acte de lire** tiennent en **une ligne
discrète en tête de colonne**, sur la rangée du bouton « Fermer » :

> provenance (« archive locale » / « copie permanente ») · date de
> l'archive (`X-Archive-Date`) · temps de lecture

DESIGN §12 garde sa raison : lire sans montrer la fraîcheur de ce qu'on lit
cacherait la moitié du diagnostic — la ligne la dit, la fiche dit l'état
durable du signet (marqueur « Archivé » et copie, §6).

## 6. La fiche

- Visible pendant la lecture (colonne), même composant qu'aujourd'hui.
- **« Lire » masqué quand c'est déjà ce signet qu'on lit**
  (`view.kind === "lecture" && view.raindropId === r.id`) — §9 : un seul
  point d'entrée par geste. « Voir la page » reste.
- Dans les vues du Nettoyage, « Lire » demeure l'entrée de la lecture
  (pleine largeur, `returnView` = la vue de Nettoyage).
- Le marqueur d'archive (état durable) ne change pas ; aucune nouvelle
  ligne de fiche — la provenance et la date vivent dans la vue qui les
  connaît (§5).

## 7. Cas aux bords

- **Copie permanente à télécharger** : le clic ouvre la lecture, qui conduit
  le téléchargement à la demande (comportement existant : progression
  nommée inline, échec nommé, « Voir la page » en issue).
- **Archivage en vol, copie en échec, rien du tout** : clic → fiche, où la
  raison est posée à l'écran (comportement existant du bouton).
- **Clavier** : Enter sur une ligne passe par le même `ouvrirSignet` que le
  clic — un seul geste, une seule décision.
- **Drag & drop** : inchangé — le seuil de 5 px distingue déjà le geste du
  clic, et la garde de sélection vit au pointerdown.

## 8. Dette soldée dans le lot

`DetailPane.tsx` (322 lignes, au-dessus de la cible de 300, noté ROADMAP) :
le bloc corbeillé — restauration + sélecteur de destination — est extrait
avec son rendu ; son test existe déjà (`DetailPane.corbeille.test.tsx`) et
le suit. Retour sous la cible.

## 9. Tests

- **`lisibilite()`** : table des cas — locale ; copie prête ; rien ; copie
  en échec ; archivage en vol. Sabordés (réintroduire le défaut, voir le
  test échouer).
- **App** : clic sur un signet archivé → lecture en zone principale **et**
  fiche en colonne ; clic non lisible → fiche seule, la vue reste ; vues de
  Nettoyage → fiche (garde anti-régression) ; fermer la lecture → retour à
  la vue d'origine, fiche encore là.
- **LectureView** : la ligne provenance · date · temps ; rail absent ;
  badge « copie permanente » porté par `sourceCopie`.
- **Fiche** : « Lire » masqué pendant la lecture du même signet, présent
  sinon ; « Voir la page » toujours là.
- **i18n** : clés de la ligne de lecture ajoutées, clés du rail retirées —
  le dictionnaire refuse les `|` en surnombre (test existant).

## 10. Documentation liée

- **Spec lecture** (§1, §8) : « un seul point d'entrée en v1 : la fiche » et
  « les lignes et tuiles n'y viennent pas en v1 » sont remplacés par le
  clic inversé — amendement daté, pas réécriture.
- **DESIGN §12** : « la fiche cède la place pendant la lecture » devient
  « la fiche accompagne la lecture » ; le rail décrit devient la ligne
  discrète ; le reste de la direction (serif, 66 caractères, états nommés)
  ne bouge pas.
- **ROADMAP** : l'entrée « Inversion fiche ↔ lecture » passe en Soldé à la
  livraison ; « `DetailPane.tsx` à découper » également.
- **i18n** : toutes les chaînes nouvelles dans `src/i18n/fr.ts`.

## 11. Limites assumées

- **Échap ne ferme pas la lecture** — le bouton existe ; un raccourci
  clavier est une addition, pas une inversion.
- La ligne de lecture répète la date que la fiche ne porte pas : une
  éventuelle date d'archive DANS la fiche est une autre demande (elle
  exigerait d'exposer le mtime par l'inventaire d'archives).
- Le rail photographié par DESIGN §12 (260 px, badges empilés) disparaît :
  la direction visuelle est réécrite par ce lot, pas conservée en double
  état.
- Bibliothèque seulement : un clic de Nettoyage qui donnerait envie de
  lire passe par « Lire » de la fiche — un geste de plus, assumé, au nom
  du rôle diagnostic de ces écrans.
