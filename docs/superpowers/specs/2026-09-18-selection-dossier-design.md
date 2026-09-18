# Sélecteur du dossier de sauvegarde, panneau et archivage depuis l'interface — design

*2026-09-18. Validé en brainstorming le même jour. Amende la spec sauvegarde
(`2026-09-16-sauvegarde-donnees-locales-design.md`) sur deux points : §4.4
(première sauvegarde **explicite**, puis automatique) et §5.4 (l'archivage
devient lisible et déclenchable depuis l'interface). Le moteur de sauvegarde
(`sidecar/backup/`) n'est pas modifié hors les points listés en §5.*

**Le problème.** Le lot sauvegarde est livré, testé, éprouvé sur données
réelles (balayage 12 210 items, 2 min 19, le 2026-09-18) — et **injoignable** :
`BACKUP_DIR` n'apparaît dans aucun `.rs` ni aucun script, `deps.sauvegarde` est
donc `undefined` et les deux routes répondent « la sauvegarde est inactive ».
Le plan 3 avait parké le sélecteur au motif que la spec sauvegarde n'était pas
validée ; cette condition a expiré.

## 0. Décisions tranchées avec l'utilisateur

1. **Périmètre** : le sélecteur de dossier, un panneau Sauvegarde dans les
   Réglages, et l'archivage déclenchable depuis l'interface.
2. **Déclenchement au démarrage (§4.4)** : **première sauvegarde explicite,
   puis automatique.** Un manifeste vide ne déclenche plus rien au démarrage ;
   l'utilisateur lance la première sauvegarde depuis le panneau. Ensuite le
   §4.4 s'applique normalement. Raison : choisir un dossier ne doit pas partir
   en 2 min 19 et ~245 requêtes non demandées.
3. **Archivage : une seule action, sur la sélection.** Pas de « tout archiver » :
   les points d'entrée sont la vue Liens morts et la sélection de signets du
   `BulkBar`, tous deux bornés par ce que l'utilisateur coche. La borne de 500
   de la route est tenue comme **refus explicite** de la Revue, jamais une
   découpe silencieuse en lots — qui réintroduirait le « tout archiver » par la
   porte de derrière.
4. **L'utilisateur doit savoir ce qui a déjà été archivé** — trois niveaux de
   lecture, un par surface (§4.1).

## 1. Approche retenue

**A — Rust possède le chemin, le sidecar le reçoit au spawn (retenue).** Le
dialogue natif rend un chemin, Rust l'écrit dans un `reglages.json` de son
dossier de données, le passe en `BACKUP_DIR` au lancement, et rejoue la
séquence de lancement quand il change. Le webview **ne nomme jamais un chemin** :
il demande « ouvre le dialogue », c'est l'utilisateur qui désigne, et macOS
accorde l'accès au dossier désigné. C'est ce que la spec §4.3 prévoyait (« le
sélecteur graphique se branche ensuite sans modifier le moteur »).

Rejetées :

- **B — le sidecar relit une configuration à chaud** : pas de redémarrage, mais
  il faut rendre `deps.sauvegarde` mutable et décider ce qu'il advient d'un job
  en vol quand le dossier change sous lui. On paie une complexité de cycle de
  vie pour supprimer un redémarrage d'environ une seconde, déjà écrit et
  éprouvé (`enregistrer_jeton` l'a franchi le 2026-09-18).
- **C — une route `POST /api/backup/config`** : elle donne au webview le
  pouvoir de désigner n'importe quel chemin d'écriture du disque. Le jeton
  Bearer local n'y change rien : l'intérêt du dialogue natif est précisément
  que le consentement de l'utilisateur porte sur un dossier précis.

## 2. Le dossier et sa persistance

- **Le dialogue** : `tauri-plugin-dialog` — dépendance nouvelle, côté Rust et
  côté npm, qui entraîne la création d'un `src-tauri/capabilities/default.json`
  (le dépôt n'en a aucun : nos commandes maison n'en ont pas besoin, celles des
  plugins si). On ouvre une surface de permissions qui n'existait pas, et c'est
  à dire.
- **Ce que l'utilisateur désigne : le parent.** `sidecar/index.ts:83` fait
  `join(BACKUP_DIR, "Raindrop-GUI")` — l'utilisateur choisit le dossier **qui
  contiendra** `Raindrop-GUI/`, et le panneau affiche toujours le chemin
  **final**, celui où les fichiers atterrissent. Désigner un `Raindrop-GUI/`
  existant donne `Raindrop-GUI/Raindrop-GUI/` : on ne le corrige pas en douce
  (renvoyer le parent d'un dossier désigné serait une surprise pire), le chemin
  final affiché le montre immédiatement. Le libellé du dialogue le dit.
- **Persistance** : `reglages.json` dans le dossier de données de Rust
  (`verrou::dossier_donnees()`, aux côtés de `sidecar.json`). Pas le trousseau :
  ce n'est pas un secret. Un fichier illisible ou corrompu vaut « aucun
  dossier » — l'état normal du premier lancement, jamais une panne.
- **Chemin disparu depuis le dernier lancement** (dossier déménagé, clé USB
  sortie) : état distinct, « dossier configuré mais introuvable », que le
  panneau dit — il ne se tait pas et ne retombe pas sur « aucun dossier ».
- **Changement ou retrait de dossier** : exactement le chemin
  d'`enregistrer_jeton` — écrire le réglage, puis `lancer_sidecar` (arrêt
  propre de notre enfant, jeton local régénéré, lockfile effacé avant
  `attendre_port`, attente port puis `mcp: "connected"`), et rendre
  l'`EtatConnexion` au front, qui reprend port et jeton par `onEtat`.
  **Aucune mécanique de cycle de vie nouvelle.**

## 3. Le panneau Sauvegarde

- **`SectionSauvegarde.tsx`**, un composant à part rendu dans l'overlay des
  Réglages. Pas dans `Reglages.tsx` (156 lignes, cible 300) : dossier + état +
  job + erreur sont une responsabilité distincte du pont MCP et du jeton.
- **Ce qu'il montre**, depuis `GET /api/backup/status` : le chemin final, l'état
  (actif, ou la raison d'inactivité — la route la formule déjà en français), la
  date de la dernière sauvegarde et si elle est **complète**, le nombre
  d'instantanés, et (§4.1) le nombre d'archives et leur volume. Inactif, le
  panneau ne montre pas une panne mais un état : « Aucun dossier choisi ».
- **Un seul bouton, pas deux.** « Sauvegarder maintenant » envoie toujours
  `incremental`, et c'est le moteur qui décide : `raisonDeBasculer` escalade en
  balayage complet quand il n'y a pas d'instantané valide, quand les 7 jours
  sont passés, ou quand l'empreinte ne se vérifie plus. La raison remonte déjà
  dans `ResultatSauvegarde.bascule` — le panneau l'affiche (« Balayage complet :
  aucune sauvegarde complète disponible »), ce qui donne enfin un lecteur au
  « et le dit » du §6. Demander à l'utilisateur de choisir entre « complet » et
  « incrémental » serait lui faire porter une décision que le code prend mieux
  que lui. Sans instantané (première sauvegarde), le panneau prévient avant le
  geste : « la première sauvegarde est un balayage complet (~2 min 20,
  ~245 requêtes) ».
- **Progression : un compteur nommé, pas une barre.** Faits mesurés : seuls deux
  segments émettent un label (`bookmarks`, `éléments modifiés`) ; la corbeille
  et les auxiliaires n'émettent rien, donc **une barre en pourcentage gèle** ;
  le rejeu du balayage **ramène le numérateur à 0** ; l'incrémental pose
  `done === total` **avant** la fusion. Un compteur nommé — « 5 300 / 12 210
  signets », puis « corbeille… », puis « écriture… » — dit la vérité à chaque
  instant ; un retour du numérateur en arrière s'écrit « reprise du balayage »,
  ce qu'il est réellement. Le sidecar gagne au passage les `job?.progress`
  manquants sur la corbeille et les auxiliaires, sans quoi il n'y a rien à
  nommer. Cette décision tranche l'item ROADMAP « sémantique de progression ».
- **Une sauvegarde qu'on n'a pas lancée doit se voir.** §4.4 démarre une
  sauvegarde au boot ; si l'utilisateur ouvre le panneau pendant, il ne voit
  aujourd'hui rien (`/status` ne porte ni `enCours` ni `jobId`). La réponse de
  `/status` gagne donc `enCours: boolean` et `jobId?: string` (source : le
  `JobStore`, recherché par type `backup`) ; le panneau s'abonne au SSE du
  `jobId` présent. Même mécanique que pour un job qu'il a lancé lui-même.
- **Annulation** : le job SSE sait déjà annuler ; le bouton devient « Annuler »
  pendant l'exécution. Une sauvegarde annulée est marquée incomplète et jamais
  comptée comme dernière valide — le panneau le dit.

## 4. L'archivage depuis l'interface

### 4.1 Inventaire — savoir ce qui est archivé

Une fonction `inventorier()` dans `archives.ts` (un `readdir`, les noms
`<id>.html.gz` déjà parsés par `ID_DE`), exposée par **`GET
/api/backup/archives`** → `{ ids: number[], octets: number }` (`octets` = total,
pour le budget). Même pattern d'inactivité que les routes existantes. Trois
niveaux de lecture :

1. **Bibliothèque** (panneau, §3) : « N copies archivées, X Go » — ce qui rend
   enfin lisible le budget de 5 Go (`ARCHIVES_MAX_GO`) dont l'éviction
   s'exercerait sinon en aveugle. Distribution réelle mesurée le 2026-09-18 :
   médiane 1,17 Mo, moyenne 3,18 Mo, p99 31,46 Mo, max 160,67 Mo — 27,6 Go si
   tout était archivé, ~1 600 archives dans les 5 Go.
2. **Signet** (ligne + panneau de détail) : un marqueur distinct — **« Archivé »**
   (archive locale présente) diffère de **« copie permanente »**
   (`cache.status === "ready"`, sur les serveurs de Raindrop, non archivée).
   Trois états : archivé, copiable mais non archivé, pas de copie. Ce marqueur
   est **hors** de la plomberie `RaindropRow.etat` (les filets d'état des vues
   de traitement, entrée ROADMAP distincte). Apparence : DESIGN.md fait foi, à
   l'implémentation.
3. **Action** (Revue, §4.2) : la sélection est comparée à l'inventaire.

**Invalidation** : le front recharge l'inventaire après chaque job d'archivage
**et après chaque sauvegarde** — `purgerOrphelins` est appelée uniquement à la
fin d'un balayage complet (`enregistrement.ts:53`, gardée par
`entree.complet`) et peut réduire l'ensemble en silence ; distinguer le mode
pour épargner une requête locale n'en vaut pas la peine.

### 4.2 L'action

- **Rien ne s'exécute depuis une barre.** `BulkBar` ne fait qu'une chose :
  construire la vue Revue (« la Revue propose, l'utilisateur dispose »).
  L'archivage suit la même voie : une action `archive` s'ajoute à l'union des
  actions de la Revue, et les deux points d'entrée la construisent.
- **La vue Liens morts gagne la sélection multiple.** Elle ne connaît
  aujourd'hui que `selectedRaindropId` (un signet mis en avant) ; les cases à
  cocher (`selectedIds`, `toggleSelect`) existent dans l'état global mais ne
  servent que la liste principale. `CleanupView` passe déjà par la Revue
  (corbeille, collections vides) : rien à inventer, seulement à brancher.
- **`BulkBar` gagne un paramètre** disant quelles actions proposer : liste
  principale = Corbeille / Déplacer / Tagger / Archiver ; Liens morts =
  Archiver seul. Sans ce paramètre, on dupliquerait la barre.
- **`cache.size`** : `mappers.ts:76` passe déjà l'objet `cache` entier au front ;
  seul son **type** (`{ status: string } | null`, ligne 27) ne déclare pas
  `size`. C'est une déclaration de type à étendre, pas un champ à ajouter.
- **Ce que la Revue affiche avant d'exécuter** : combien de signets de la
  sélection ont réellement une copie permanente — **les autres étant simplement
  ignorés** (sur les liens morts ce sera fréquent ; une action qui « réussit »
  sur 63 signets sans rien archiver serait un mensonge) ; le **volume estimé**
  (Σ `cache.size` des non-archivés) — « Archiver 137 copies, environ 430 Mo »
  est la seule façon honnête d'annoncer une action qui peut écrire des
  gigaoctets ; la **durée** (deux requêtes par copie, file à 550 ms).
- **Les déjà-archivés sont écartés du job et comptés** : « 137 à archiver,
  12 déjà archivés, ignorés ». Pas d'option « re-archiver » (YAGNI : ça
  s'ajoute sur une action qui existe, l'inverse est faux).
- **La borne de 500** : la Revue refuse au-delà, en disant le nombre
  (« 612 sélectionnés, la borne est de 500 »).

## 5. Côté sidecar — liste exhaustive

1. `decision.ts` : `doitSauvegarderAuDemarrage` rend `false` sur manifeste vide
   (première sauvegarde explicite). Le test est retourné, le commentaire §4.4
   réécrit, la spec sauvegarde §4.4 amendée dans le même lot.
2. `archives.ts` : `inventorier()`.
3. Routes : `GET /api/backup/archives` ; `/status` enrichi de `enCours` +
   `jobId` (source : `JobStore`, recherche par type `backup`).
4. `job?.progress` sur la corbeille et les auxiliaires, aux labels nommés :
   « corbeille », « collections », « surlignages », « profil » (les pièces du
   balayage : principal, corbeille, puis les trois auxiliaires).
5. **Rien d'autre.** Ni `deps` mutable, ni route de configuration : le sidecar
   reçoit `BACKUP_DIR` au spawn et ignore d'où il vient.

## 6. Côté Rust — liste exhaustive

1. `tauri-plugin-dialog` (Rust + npm) ; création de
   `src-tauri/capabilities/default.json`.
2. `reglages.rs` (nouveau) : lire/écrire `reglages.json` + tests (absent,
   corrompu, présent).
3. Commandes `choisir_dossier_sauvegarde` et `retirer_dossier_sauvegarde` :
   dialogue (la première), écriture du réglage, relance par le chemin
   d'`enregistrer_jeton`, `EtatConnexion` rendu.
4. `demarrage.rs` : `sequence()` lit `reglages.json` avant `lancer_sidecar`.
5. `sidecar.rs` : `.env("BACKUP_DIR", …)` quand un dossier est configuré.

## 7. Côté front — liste exhaustive

1. `SectionSauvegarde.tsx` + test ; rendu dans les Réglages.
2. Action `archive` dans la Revue (exécution, ignorés comptés, borne refusée,
   volume et durée affichés) + tests.
3. `BulkBar` paramétrable ; sélection multiple de la vue Liens morts.
4. Inventaire : hook + invalidation (fin de job archive ; fin de tout job de
   sauvegarde) ; marqueur « Archivé » sur la ligne et le détail.
5. Type `cache.size` déclaré ; textes dans `src/i18n/fr.ts` (fichier unique).

## 8. Tests

- **Rust** : `reglages.json` (absent, corrompu, présent, chemin disparu) ;
  l'enchaînement de relance est déjà éprouvé par `enregistrer_jeton` — on ne
  le re-teste pas, on l'appelle.
- **Sidecar** : `decision` (manifeste vide → false, manifeste peuplé → §4.4
  inchangé) ; `inventorier` (répertoire absent → ensemble vide, noms étrangers
  ignorés, totaux justes) ; `/status` enrichi ; labels de progression.
- **Front** : `SectionSauvegarde` (une branche par état : inactif, introuvable,
  en vol lancé par le boot, bascule annoncée, échec, annulation) ; Revue
  `archive` (exécution, ignorés, borne, volume) ; `BulkBar` paramétré ;
  sélection Liens morts ; mapper.
- **La règle du lot** : une assertion d'absence ne vaut que si l'on a montré
  que l'objet devait être là — le test « les déjà-archivés sont écartés » doit
  d'abord prouver que leur identifiant était dans la sélection. Sabotage
  obligatoire sur ce test et sur celui de la borne.

## 9. Hors périmètre

Reprise après coupure (ROADMAP) ; recalibrage du budget d'archives et écriture
en flux (ROADMAP — `arrayBuffer()` fait passer une copie de 160 Mo entière en
mémoire) ; hors ligne ; sous-collections de niveau 2+ ; re-archivage forcé ;
l'appel d'archivage « automatique sur les liens morts » du §5.4 (la sélection
le remplace comme point d'entrée, la spec §5.4 sera amendée dans le lot).
