import { useEffect, useState } from "react";
import { t } from "../i18n/fr";
import { api } from "../lib/api";
import {
  choisirDossierSauvegarde,
  etatSauvegarde,
  retirerDossierSauvegarde,
  type Amorce,
  type EtatSauvegarde,
} from "../lib/amorce";
import { useUser } from "../hooks/useStaticData";
import {
  coutBalayage,
  formatterHorodatage,
  formatterOctets,
  libelleProgression,
  useArchives,
  useBackupStatus,
  useInvalidateSauvegarde,
  type ResultatSauvegarde,
} from "../hooks/useBackup";
import { annuler, suivreJob, type SauvegardeEnVol } from "../lib/suiviSauvegarde";

/**
 * La sauvegarde locale dans les Réglages (spec sélection §3). Deux sources
 * qu'il faut combiner : le DOSSIER vient de Rust (un chemin de disque, que
 * le webview ne peut ni lire ni vérifier), l'ÉTAT DU MOTEUR vient du sidecar.
 *
 * Un composant à part et non une section de `Reglages` : dossier, statut, job
 * et erreur forment une responsabilité distincte du pont MCP et du jeton.
 */
export function SectionSauvegarde({ onEtat }: { onEtat: (a: Amorce) => void }) {
  const [dossier, setDossier] = useState<EtatSauvegarde | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const statut = useBackupStatus();
  const archives = useArchives();
  const invalider = useInvalidateSauvegarde();
  const vol = suivreJob("backup");

  useEffect(() => {
    void etatSauvegarde().then(setDossier);
  }, []);

  // Une fin de job change le statut ET l'inventaire (`purgerOrphelins` tourne
  // à la fin d'un balayage complet) : sans cette relecture, le panneau
  // afficherait encore l'avant.
  useEffect(() => {
    if (vol?.fin) invalider();
  }, [vol?.fin, invalider]);

  const geste = async (action: () => Promise<Amorce>) => {
    if (occupe) return;
    setOccupe(true);
    setErreur(null);
    const amorce = await action();
    setOccupe(false);
    void etatSauvegarde().then(setDossier);
    invalider();
    // Sidecar mort, Node disparu : l'application EST en panne — la montrer
    // derrière un panneau serait un mensonge. Les écrans d'amorçage portent
    // les issues (Réessayer, Saisir un autre jeton).
    if (amorce.ecran !== "app") onEtat(amorce);
  };

  const lancer = async () => {
    if (occupe) return;
    setOccupe(true);
    setErreur(null);
    try {
      // Toujours `incremental` : c'est le MOTEUR qui décide d'escalader en
      // balayage complet (aucun instantané valide, sept jours passés,
      // empreinte qui ne se vérifie plus) et qui dit pourquoi. Faire choisir
      // l'utilisateur serait lui confier une décision que le code prend mieux.
      await api.send<{ jobId: string }>("POST", "/api/backup/run", { mode: "incremental" });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setOccupe(false);
    }
  };

  const signets = useUser().data?.bookmarksCount;
  const dernier = statut.data?.dernier ?? null;
  const actif = statut.data?.actif === true;
  const jamais = actif && (statut.data?.instantanes ?? 0) === 0;

  return (
    <div className="mb-4 border-t border-app-border pt-4">
      <p className="mb-1 text-xs uppercase tracking-wide text-app-muted">{t("sauvegarde.titre")}</p>

      {dossier?.introuvable ? (
        <p className="mb-2 text-sm">
          {t("sauvegarde.introuvable", { chemin: dossier.dossier ?? "" })}
          <span className="block text-xs text-app-muted">{t("sauvegarde.introuvable.aide")}</span>
        </p>
      ) : dossier?.dossier ? (
        <p className="mb-2 text-sm">
          {t("sauvegarde.dossier")}
          {/* Le chemin FINAL — celui où les fichiers atterrissent — et non
              le parent désigné : c'est lui qui répond à « où est-ce ? ». */}
          <span className="url ml-1 break-all text-xs text-app-muted">
            {statut.data?.dossier ?? dossier.dossier}
          </span>
        </p>
      ) : (
        <p className="mb-2 text-sm text-app-muted">{t("sauvegarde.aucun")}</p>
      )}

      {/* Inactif n'est pas une panne : la route formule sa raison, on la montre. */}
      {statut.data?.actif === false && statut.data.raison && !dossier?.introuvable && (
        <p className="mb-2 text-xs text-app-muted">{statut.data.raison}</p>
      )}

      {actif && (
        <div className="mb-2 flex flex-col gap-0.5 text-sm">
          {dernier ? (
            <span>
              {t("sauvegarde.dernier", { date: formatterHorodatage(dernier.horodatage) })}
              {" ("}
              {dernier.complet ? t("sauvegarde.complet") : t("sauvegarde.incremental")}
              {")"}
            </span>
          ) : (
            <span className="text-app-muted">{t("sauvegarde.jamais")}</span>
          )}
          {(statut.data?.instantanes ?? 0) > 0 && (
            <span className="text-xs text-app-muted">
              {t("sauvegarde.instantanes", { n: statut.data?.instantanes ?? 0 })}
            </span>
          )}
          {archives.data && archives.data.set.size > 0 && (
            <span className="text-xs text-app-muted">
              {t("sauvegarde.archives", {
                n: archives.data.set.size,
                volume: formatterOctets(archives.data.octets),
              })}
            </span>
          )}
          {/* Annoncé AVANT le geste, et CALCULÉ sur la bibliothèque réelle :
              une durée en dur ne vaudrait que pour la bibliothèque qui a
              servi à la mesurer. Compte inconnu → on dit ce que c'est, sans
              inventer de chiffre. */}
          {jamais && vol === null && (
            <span className="text-xs text-app-muted">{avertissementPremiere(signets)}</span>
          )}
        </div>
      )}

      {vol !== null && <VolSauvegarde vol={vol} />}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn" disabled={occupe} onClick={() => void geste(choisirDossierSauvegarde)}>
          {dossier?.dossier ? t("sauvegarde.changer") : t("sauvegarde.choisir")}
        </button>
        {dossier?.dossier && (
          <button
            type="button"
            className="btn"
            title={t("sauvegarde.retirer.note")}
            disabled={occupe}
            onClick={() => void geste(retirerDossierSauvegarde)}
          >
            {t("sauvegarde.retirer")}
          </button>
        )}
        {actif && (
          <button
            type="button"
            className="btn ml-auto"
            disabled={occupe || (vol !== null && vol.fin === undefined)}
            onClick={() => void lancer()}
          >
            {t("sauvegarde.lancer")}
          </button>
        )}
      </div>

      {erreur !== null && (
        <p role="alert" className="mt-2 text-xs text-app-broken">
          {t("state.error", { message: erreur })}
        </p>
      )}
    </div>
  );
}

/** Ce que coûtera la première sauvegarde, sur CETTE bibliothèque. */
function avertissementPremiere(signets: number | undefined): string {
  if (signets === undefined) return t("sauvegarde.premiere.sansCompte");
  const { requetes, duree } = coutBalayage(signets);
  return t("sauvegarde.premiere", {
    duree,
    requetes,
    signets: signets.toLocaleString("fr-FR"),
  });
}

/**
 * Un COMPTEUR NOMMÉ, pas une barre (spec sélection §3). Les faits qui
 * l'imposent : la corbeille et les auxiliaires n'ont un label que depuis ce
 * lot, le rejeu du balayage ramène le numérateur à zéro, et l'incrémental
 * pose `done === total` avant la fusion. Une barre en pourcentage mentirait
 * dans les trois cas ; un compteur nommé dit la vérité à chaque instant.
 */
function VolSauvegarde({ vol }: { vol: SauvegardeEnVol }) {
  const [plafond, setPlafond] = useState(0);
  const recule = vol.fin === undefined && vol.done < plafond;
  useEffect(() => setPlafond((p) => (vol.done > p ? vol.done : p)), [vol.done]);

  if (vol.fin?.kind === "cancelled") {
    return <p className="mb-2 text-sm text-app-muted">{t("sauvegarde.annulee")}</p>;
  }
  if (vol.fin?.kind === "error") {
    return (
      <p role="alert" className="mb-2 text-sm text-app-broken">
        {t("state.error", { message: vol.fin.message })}
      </p>
    );
  }
  if (vol.fin?.kind === "done") {
    // La raison d'une escalade en balayage complet, portée jusqu'à l'écran :
    // le « et le dit » du §6, qui n'avait jusqu'ici aucun lecteur.
    const bascule = (vol.fin.resultat as ResultatSauvegarde).bascule;
    return (
      <p className="mb-2 text-sm">
        {t("sauvegarde.termine")}
        {bascule !== undefined && (
          <span className="block text-xs text-app-muted">{t("sauvegarde.bascule", { raison: bascule })}</span>
        )}
      </p>
    );
  }

  const quoi = libelleProgression(vol.label);
  return (
    <p className="mb-2 flex items-center gap-2 text-sm" aria-live="polite">
      <span>
        {recule
          ? t("sauvegarde.reprise")
          : quoi === null
            ? t("sauvegarde.progress.neutre")
            : t("sauvegarde.compteur", {
                done: vol.done.toLocaleString("fr-FR"),
                total: vol.total.toLocaleString("fr-FR"),
                quoi,
              })}
      </span>
      <button type="button" className="btn" onClick={() => void annuler(vol.jobId)}>
        {t("sauvegarde.annuler")}
      </button>
    </p>
  );
}
