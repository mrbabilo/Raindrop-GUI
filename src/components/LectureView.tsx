// src/components/LectureView.tsx
import { useQuery } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { t } from "../i18n/fr";
import { Icone } from "../design/icones";
import { api, ApiError } from "../lib/api";
import { chargerContenu, extraireBlocs, type Bloc } from "../lib/lecture";
import { ouvrirPageWeb } from "../lib/pageWeb";
import { useCollections } from "../hooks/useStaticData";
import type { RaindropItem } from "../../shared/types";
import type { View } from "../state/appState";

// DESIGN §12 (mode lecture) : colonne serif ~66 caractères sur la surface
// `app`, rail droit de métadonnées. Les formules (.lecture-corps,
// .rail-titre) vivent dans styles.css — pas recopiées ici, même raison que
// .titre-fiche.

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
  // Les métadonnées du rail : la fiche a DÉJÀ chargé ["raindrop", id] — le
  // cache de react-query sert cette requête sans nouvelle requête réseau.
  const detail = useQuery<RaindropItem>({
    queryKey: ["raindrop", raindropId],
    queryFn: () => api.get<RaindropItem>(`/api/raindrops/${raindropId}`),
  });
  const contenu = useQuery({
    queryKey: ["archive-content", raindropId],
    queryFn: () => chargerContenu(raindropId),
  });
  const arbre = useCollections().data ?? [];
  const r = detail.data;
  // Le contenu extrait est AUSSI le compteur de mots du rail (temps de
  // lecture ≈ 220 mots/min — l'exemple de Karakeep, calculé jamais deviné).
  const blocs = contenu.data ? extraireBlocs(contenu.data.html) : [];
  const mots = blocs.reduce(
    (n, b) => n + (b.balise === "img" ? 0 : b.segments.reduce((m, s) => m + s.texte.split(/\s+/).filter(Boolean).length, 0)),
    0,
  );
  const minutes = Math.max(1, Math.round(mots / 220));
  const collection = r ? arbre.find((c) => c.id === r.collectionId) : undefined;
  const dateLue = contenu.data ? dateArchive(contenu.data.dateArchive) : null;

  let interieur: ReactNode;
  if (contenu.isPending) {
    interieur = <p>{t("state.loading")}</p>;
  } else if (contenu.isError) {
    interieur = (
      <div className="flex flex-col items-start gap-3">
        <p role="alert">{nommerErreur(contenu.error)}</p>
        <IssuePageWeb url={r?.url} />
      </div>
    );
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
    <div className="flex h-full min-h-0">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[66ch] flex-col gap-3 px-6 py-8">
          <button type="button" className="btn btn-icone self-end" aria-label={t("lecture.fermer")} onClick={goBack}>
            <Icone nom="croix" />
          </button>
          {interieur}
        </div>
      </div>
      {r && (
        <aside
          className="w-[260px] shrink-0 overflow-y-auto border-l border-app-border bg-app p-4"
          aria-label={t("lecture.rail")}
        >
          <h2 className="rail-titre">{r.title}</h2>
          <p className="url mt-2 truncate text-[11px]">{r.domain}</p>
          {collection && <p className="mt-1 text-xs text-app-muted">{collection.title}</p>}
          <p className="mt-3 text-xs text-app-muted">
            {sourceCopie ? t("lecture.badgeCopie") : t("lecture.badgeLocale")}
          </p>
          {dateLue && <p className="mt-1 text-xs text-app-muted">{t("lecture.date", { date: dateLue })}</p>}
          {contenu.data && blocs.length > 0 && (
            <p className="mt-1 text-xs text-app-muted">{t("lecture.temps", { n: minutes })}</p>
          )}
          {r.tags.length > 0 && (
            // Une ligne de TEXTE, pas des pilules : une pilule inerte ferait
            // douter de la fiche, une pilule cliquable naviguerait hors de la
            // lecture. Ici, l'étiquette se lit, elle ne se clique pas.
            <p className="mt-3 text-xs text-app-muted">{r.tags.join(" · ")}</p>
          )}
        </aside>
      )}
    </div>
  );
}
