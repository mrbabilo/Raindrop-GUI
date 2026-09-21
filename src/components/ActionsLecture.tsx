// src/components/ActionsLecture.tsx
import { useState } from "react";
import { t, type FrKey } from "../i18n/fr";
import { ouvrirPageWeb } from "../lib/pageWeb";
import {
  useArchives,
  useInvalidateSauvegarde,
  useJobsEnVol,
  type ResultatArchivage,
} from "../hooks/useBackup";
import { useAppState } from "../state/appState";
import { ArchiveJob } from "./RevueArchive";
import type { RaindropItem } from "../../shared/types";

// Les six états de `cache.status`, traduits — jamais un identifiant brut à
// l'écran (même motif que LABELS_PROGRESSION). `ready` n'y est pas : il
// N'ACTIVE pas une raison, il active le bouton.
const LIBELLES_COPIE: Record<string, FrKey> = {
  retry: "copie.retry",
  failed: "copie.failed",
  "invalid-origin": "copie.invalidOrigin",
  "invalid-timeout": "copie.invalidTimeout",
  "invalid-size": "copie.invalidSize",
};

/** Les deux gestes de la fiche (spec lecture §1) : « Lire » le contenu
 *  archivé — archive locale, ou copie permanente téléchargée d'abord — et
 *  « Voir la page » réelle, qui reste possible PARTOUT, même quand rien
 *  n'est lisible hors ligne (spec §5 : l'issue de secours). */
export function ActionsLecture({ r }: { r: RaindropItem }) {
  const { view, go } = useAppState();
  const archives = useArchives().data?.set;
  const jobs = useJobsEnVol();
  const invalider = useInvalidateSauvegarde();
  const [telecharge, setTelecharge] = useState(false);
  const [echec, setEchec] = useState<string | null>(null);

  const locale = archives?.has(r.id) === true;
  // La fiche ne monte JAMAIS un job d'archivage quand un AUTRE est en vol :
  // ArchiveJob adopterait ce job-là, et son terme ferait croire à un
  // téléchargement qui n'a pas eu lieu. On nomme l'attente à la place.
  const archivageEnVol = jobs.data?.some((j) => j.type === "archive") === true;
  const prete = r.cache?.status === "ready";

  const raison = locale
    ? null
    : archivageEnVol
      ? t("detail.lireAttente")
      : prete
        ? null
        : r.cache != null
          ? t("detail.lireCopieEchec", {
              raison: t(LIBELLES_COPIE[r.cache.status] ?? "copie.inconnue"),
            })
          : t("detail.lireSansCopie");

  const ouvrirLecture = (sourceCopie: boolean) =>
    go({
      kind: "lecture",
      raindropId: r.id,
      label: r.title,
      // Le contrat dit ABSENT pour l'archive locale : la clé n'est posée que
      // quand elle porte (un `false` explicite serait un état de plus à lire).
      ...(sourceCopie ? { sourceCopie: true } : {}),
      returnView: view,
    });

  const lire = () => {
    setEchec(null);
    if (locale) {
      ouvrirLecture(false);
      return;
    }
    setTelecharge(true); // ArchiveJob se monte, poste, suit, puis rappelle
  };

  const auTerme = (res: ResultatArchivage) => {
    invalider();
    const notre = res.echecs.find((e) => e.id === r.id);
    setTelecharge(false);
    if (notre) {
      setEchec(notre.raison); // nommé inline, la vue ne bouge pas
      return;
    }
    ouvrirLecture(true);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" disabled={raison != null} onClick={lire}>
          {t("detail.lire")}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void ouvrirPageWeb(r.url).catch(() => undefined)}
        >
          {t("detail.voirPage")}
        </button>
      </div>
      {/* §10 : le bouton nomme ce qui manque — la raison est posée À L'ÉCRAN,
          pas seulement en title. */}
      {raison && <p className="text-xs text-app-muted">{raison}</p>}
      {telecharge && (
        <ArchiveJob ids={[r.id]} onTermine={auTerme} onErreur={(m) => { setTelecharge(false); setEchec(m); }} />
      )}
      {echec && <p role="alert" className="text-xs text-app-broken">{t("state.error", { message: echec })}</p>}
    </div>
  );
}
