// src/components/LectureView.tsx
import { useQuery } from "@tanstack/react-query";
import { createElement, useRef, useState, type ReactNode } from "react";
import { t } from "../i18n/fr";
import { Icone } from "../design/icones";
import { api, ApiError } from "../lib/api";
import { chargerContenu, extraireBlocs, type Bloc } from "../lib/lecture";
import { ouvrirPageWeb } from "../lib/pageWeb";
import { ArchiveJob } from "./RevueArchive";
import { useInvalidateSauvegarde, type ResultatArchivage } from "../hooks/useBackup";
import type { RaindropItem } from "../../shared/types";
import type { View } from "../state/appState";

// DESIGN §12 (mode lecture) : colonne serif ~66 caractères sur la surface
// `app`, ligne de tête discrète (provenance · date · temps). Les formules
// (.lecture-corps) vivent dans styles.css — pas recopiées ici, même raison
// que .titre-fiche.

/** La date de l'archive, lisible. Un ISO illisible se rend TEL QUEL plutôt
 *  que de devenir « Invalid Date » (même parti que formatterHorodatage). */
function dateArchive(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
}

/** Les états nommés de la lecture (spec lecture §5) : chaque échec a SA
 *  raison — jamais un « http 404 » nu. */
function nommerErreur(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === "ARCHIVE_ABSENTE") return t("lecture.introuvable");
    if (e.code === "ARCHIVE_TROP_VOLUMINEUSE") return t("lecture.tropVolumineuse");
    if (e.code === "ARCHIVE_ILLISIBLE") return t("lecture.illisible");
  }
  return t("state.error", { message: e instanceof Error ? e.message : String(e) });
}

/** L'issue de secours commune aux états d'échec : la page réelle reste
 *  ouverte à tout moment (spec lecture §5). */
function IssuePageWeb({ url }: { url?: string }) {
  if (!url) return null;
  return (
    <button type="button" className="btn" onClick={() => void ouvrirPageWeb(url).catch(() => undefined)}>
      {t("detail.voirPage")}
    </button>
  );
}

/** Le rendu d'un bloc : createElement sur l'union FERMÉE `Bloc.balise` —
 *  une balise hors whitelist ne peut pas exister (le type la refuse). Les
 *  segments deviennent texte, <strong>/<em>, et les liens s'ouvrent hors
 *  webview. Jamais d'innerHTML : la sécurité est dans l'arbre. */
function renduBloc(b: Bloc, cle: number): ReactNode {
  if (b.balise === "img") {
    return <img key={cle} src={b.src} alt={b.alt} className="lecture-img" loading="lazy" />;
  }
  return createElement(
    b.balise,
    { key: cle },
    b.segments.map((s, j) => {
      const texte = s.lien
        ? (
          <a key={j} href={s.lien} target="_blank" rel="noreferrer">
            {s.texte}
          </a>
        )
        : s.texte;
      return s.gras ? <strong key={j}>{texte}</strong> : s.italique ? <em key={j}>{texte}</em> : texte;
    }),
  );
}

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

  // Le téléchargement à la demande (spec inversion §7) : le clic ouvre la
  // lecture d'une copie permanente pas encore téléchargée — la lecture
  // CONDUIT le téléchargement. Sans ce flux, la requête de contenu rendait
  // ARCHIVE_ABSENTE et l'écran nommait une « disparition » mensongère :
  // l'archive n'a jamais existé ici (défaut trouvé en vérification réelle
  // le 2026-09-22). Le flux vivait dans la fiche (ActionsLecture) ; le clic
  // inversé l'a court-circuité.
  const invalider = useInvalidateSauvegarde();
  const [echecTelecharge, setEchecTelecharge] = useState<string | null>(null);
  const archiveAbsente =
    contenu.isError && contenu.error instanceof ApiError && contenu.error.code === "ARCHIVE_ABSENTE";

  const auTerme = (res: ResultatArchivage) => {
    invalider();
    const notre = res.echecs.find((e) => e.id === raindropId);
    if (notre) {
      setEchecTelecharge(notre.raison); // nommé inline, comme dans la fiche
      return;
    }
    if (res.faits === 0) {
      // Ni fait ni échec pour nous : budget atteint (nonTentes) ou arrêt —
      // refetch rebouclerait sur un nouveau job, on nomme l'arrêt.
      setEchecTelecharge(res.raisonArret ?? res.echecs.map((e) => e.raison).join(", ") ?? "échec");
      return;
    }
    void contenu.refetch(); // le fichier existe maintenant
  };

  let interieur: ReactNode;

  // La position de lecture (0..1) : calculée AU DÉFILEMENT, écrite par ref
  // dans la barre — un setState par frame re-rendrait tout l'article.
  const defileRef = useRef<HTMLDivElement>(null);
  const remplirRef = useRef<HTMLDivElement>(null);
  const surDefilement = () => {
    const el = defileRef.current;
    const remplir = remplirRef.current;
    if (!el || !remplir) return;
    const total = el.scrollHeight - el.clientHeight;
    const part = total > 0 ? el.scrollTop / total : 0;
    remplir.style.width = `${Math.min(100, Math.max(0, part * 100))}%`;
  };
  if (contenu.isPending) {
    interieur = <p>{t("state.loading")}</p>;
  } else if (contenu.isError) {
    if (sourceCopie === true && archiveAbsente && echecTelecharge === null) {
      interieur = (
        <div className="flex flex-col items-start gap-3">
          <p>{t("lecture.telecharge")}</p>
          <ArchiveJob ids={[raindropId]} onTermine={auTerme} onErreur={(m) => setEchecTelecharge(m)} />
          <IssuePageWeb url={r?.url} />
        </div>
      );
    } else if (sourceCopie === true && echecTelecharge !== null) {
      interieur = (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-sm text-app-broken">
            {t("state.error", { message: echecTelecharge })}
          </p>
          <IssuePageWeb url={r?.url} />
        </div>
      );
    } else {
      interieur = (
        <div className="flex flex-col items-start gap-3">
          <p role="alert">{nommerErreur(contenu.error)}</p>
          <IssuePageWeb url={r?.url} />
        </div>
      );
    }
  } else {
    interieur =
      blocs.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert">{t("lecture.extractionVide")}</p>
          <IssuePageWeb url={r?.url} />
        </div>
      ) : (
        // Rendu FILTRÉ (spec §3 amendée) : les blocs viennent de
        // extraireBlocs (whitelist, jamais d'innerHTML) et sont reconstruits
        // en arbre React — createElement sur l'union fermée `Bloc.balise`.
        <article className="lecture-corps">
          {blocs.map((b, i) => renduBloc(b, i))}
        </article>
      );
  }

  return (
    // La barre de tête vit HORS du conteneur défilant : l'issue (Fermer) et
    // la provenance restent sous la main pendant qu'on lit — le rebond
    // macOS ne doit pas les emmener. Seul l'article défile. Une ombre
    // légère la porte au-dessus du contenu (z-10 : elle peint par-dessus).
    <div className="relative flex h-full min-h-0 flex-col">
      {/* La position de lecture, horizontale en tête de fenêtre : une
          présentation, pas une information nouvelle (la barre native du
          système dit déjà où l'on est aux lecteurs d'écran — aria-hidden).
          Mise à jour par ref au défilement : aucun re-render par frame. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[3px] bg-app-border">
        <div ref={remplirRef} data-testid="position-lecture" className="h-full bg-app-muted" style={{ width: "0%" }} />
      </div>
      <div className="relative z-10 shadow-sm">
        <div className="mx-auto flex w-full max-w-[66ch] items-start justify-between gap-3 px-6 pt-8 pb-3">
          {/* La ligne de tête (spec inversion §5) : provenance · date · temps —
              la fraîcheur de ce qu'on lit, sans un rail qui dupliquerait la
              fiche. Absente tant que le contenu n'est pas là. */}
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
          <button type="button" className="btn btn-icone ml-auto" aria-label={t("lecture.fermer")} onClick={goBack}>
            <Icone nom="croix" />
          </button>
        </div>
      </div>
      <div ref={defileRef} onScroll={surDefilement} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[66ch] flex-col gap-3 px-6 pb-8">
          {interieur}
        </div>
      </div>
    </div>
  );
}
