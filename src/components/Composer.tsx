import { useEffect, useRef, useState } from "react";
import { t } from "../i18n/fr";
import { api } from "../lib/api";
import { useAppState } from "../state/appState";
import { useCreateRaindrop } from "../hooks/useMutations";

// R10P-1 — forme RÉELLE de check-urls (sonde API du 2026-09-17, passée telle
// quelle par le sidecar user.ts) : {result, ids, duplicates:[{link,_id}]} —
// PAS {items:[{url,exists}]} comme le mock du plan. La présence de
// `duplicates` suffit : le lien existe déjà.
type VerifLiens = { duplicates?: { link: string; _id: number }[] };

// Tête de liste (Task 10) : collage d'URL → parse_url préremplit le titre,
// check_urls_exist alerte le doublon (lien vers l'existant), la création
// part dans la collection courante. ⌘E (monté par App) amène le focus ici —
// le data-testid du champ est le contrat du focus posé par le plan.
export function Composer() {
  const { view } = useAppState();
  const create = useCreateRaindrop();
  const [url, setUrl] = useState("");
  const [titre, setTitre] = useState<string | null>(null);
  const [doublon, setDoublon] = useState<string | null>(null);
  // R8P-1 (étendu T10) : l'échec de création n'est ni avalé ni destructeur —
  // message inline (pattern du fix T8 : role="alert" + state.error),
  // brouillon URL + titre intact.
  const [erreur, setErreur] = useState<string | null>(null);
  // Marqueurs de système (Tous 0, non classés -1, corbeille -99, -2/-3) :
  // jamais une destination de création — hors collection réelle (> 0),
  // pas de collection_id, l'API décide.
  const collectionId = view.kind === "list" && view.collectionId > 0 ? view.collectionId : undefined;
  const seq = useRef(0);

  // `seq` écarte la réponse d'une URL dépassée par la saisie suivante :
  // sans lui, un parse lent ferait préremplir le titre de l'ancienne URL.
  async function parser(cible: string) {
    const ticket = ++seq.current;
    const [meta, verif] = await Promise.all([
      api.send<{ title?: string }>("POST", "/api/parse-url", { url: cible }).catch(() => null),
      api.send<VerifLiens>("POST", "/api/check-urls", { urls: [cible] }).catch(() => null),
    ]);
    if (ticket !== seq.current) return;
    if (meta?.title) setTitre(meta.title);
    setDoublon(verif?.duplicates?.[0]?.link ?? null);
  }

  // Parse au repos, même mécanique que la recherche de TopBar (300 ms sans
  // frappe) : couvre le collage comme la saisie, une seule requête par URL —
  // le onBlur du plan n'aurait rien déclenché tant que le champ garde le
  // focus (et aurait fait une requête par frappe s'il valait onChange).
  useEffect(() => {
    // Insensible à la casse : une URL collée depuis une barre d'adresse ou
    // un document peut arriver en « HTTPS:// ». Sans le drapeau, elle n'était
    // simplement jamais analysée — ni titre, ni alerte de doublon.
    if (!/^https?:\/\//i.test(url)) {
      seq.current++; // plus une URL : toute réponse en vol est périmée
      setTitre(null);
      setDoublon(null);
      return;
    }
    const id = setTimeout(() => void parser(url), 300);
    return () => clearTimeout(id);
  }, [url]);

  const soumettre = () => {
    if (!url) return;
    // Un envoi suffit : sans ce garde, deux Entrée rapides ou un double clic
    // créent DEUX bookmarks pour la même URL — et c'est une écriture, elle ne
    // se rattrape pas d'un Échap.
    if (create.isPending) return;
    setErreur(null);
    void create
      .mutateAsync({ link: url, ...(titre ? { title: titre } : {}), collection_id: collectionId })
      .then(() => {
        setUrl("");
        setTitre(null);
        setDoublon(null);
      })
      .catch((e: unknown) => setErreur(e instanceof Error ? e.message : String(e)));
  };

  return (
    <form
      className="flex items-center gap-2 border-b border-app-border px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        soumettre();
      }}
    >
      <input
        className="input flex-1"
        data-testid="composer-input"
        placeholder={t("composer.placeholder")}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      {titre !== null && (
        <input
          aria-label={t("composer.titleAria")}
          className="input w-48"
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
        />
      )}
      {doublon !== null && (
        // R10P-2 : alerte en app-broken (diagnostic §6), pas de jeton fantôme ;
        // le lien mène à l'existant (R10P-1 : duplicates porte {link,_id}).
        <a className="shrink-0 text-xs text-app-broken underline" href={doublon} target="_blank" rel="noreferrer">
          {t("composer.exists")}
        </a>
      )}
      {erreur !== null && (
        <p role="alert" className="shrink-0 text-xs text-app-broken">
          {t("state.error", { message: erreur })}
        </p>
      )}
      {/* §6 : l'action primaire se marque par la surface (sel), pas par une teinte. */}
      <button type="submit" className="shrink-0 rounded bg-app-sel px-2 py-1 text-xs font-medium">
        {t("composer.save")}
      </button>
    </form>
  );
}
