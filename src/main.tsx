import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { AppStateProvider } from "./state/appState";
import { DragProvider } from "./state/drag";
import App from "./App";
import { PremierLancement } from "./components/PremierLancement";
import { Diagnostic, EcranPanne } from "./components/EcranAmorce";
import { amorcer, type Amorce } from "./lib/amorce";
import "./styles.css";

// retry: false — les erreurs sont traitées par code + statut (ApiError),
// pas retentées à l'aveugle. staleTime 30 s : pas de refetch au simple
// remontage d'un composant.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 30_000,
      // refetchOnWindowFocus: false — même argument que `networkMode` :
      // notre API est locale, et au retour de fenêtre le défaut v5
      // refetcherait TOUTES les pages chargées d'une liste infinie à
      // travers la file 550 ms (une fiche en « Chargement… » pendant que
      // la liste se rattrape). La fraîcheur continue se demande
      // explicitement (refetchInterval sur status et jobs), les écritures
      // de l'app invalident, et le reste se rattrape à la navigation ; la
      // resynchronisation hors-app sera un geste explicite (lot hors ligne).
      refetchOnWindowFocus: false,
      // `networkMode: "always"` — et ce n'est pas un contournement.
      //
      // Par défaut (« online »), react-query MET EN PAUSE toute requête quand
      // `onlineManager` se croit hors ligne : la requête reste `pending`
      // indéfiniment, sans partir et SANS ÉCHOUER. Rien ne s'affiche, rien ne
      // s'explique — un « Chargement… » éternel et un défilement infini qui
      // n'appelle plus rien.
      //
      // Or `onlineManager` se règle sur `navigator.onLine`, qui parle de
      // l'accès à INTERNET. Notre API, elle, est LOCALE : le sidecar écoute
      // sur 127.0.0.1, et sa joignabilité n'a rien à voir avec la connexion
      // de la machine. Réglage de PRINCIPE, pas un correctif : mesuré le
      // 2026-09-19 par sonde, `navigator.onLine` vaut `true` sous
      // `tauri://localhost` — ne jamais l'invoquer comme cause d'un
      // « pending » éternel (CLAUDE.md). Hors ligne pour de bon (Wi-Fi
      // coupé), il gèlerait pourtant une app dont le serveur est local.
      //
      // L'état réseau qui compte pour nous est déjà mesuré ailleurs, et
      // mieux : `useHealth` interroge le sidecar, et la bannière hors-ligne
      // dit ce qu'il en est.
      networkMode: "always",
    },
    mutations: { networkMode: "always" },
  },
});

function Racine({ amorce }: { amorce: Amorce }) {
  const [etat, setEtat] = useState(amorce);
  switch (etat.ecran) {
    case "premier-lancement":
      return <PremierLancement onPret={setEtat} />;
    case "diagnostic":
      return <Diagnostic detail={etat.detail} onEtat={setEtat} />;
    case "panne":
      return <EcranPanne detail={etat.detail} onEtat={setEtat} />;
    default:
      return <App onEtat={setEtat} />;
  }
}

// `then` plutôt qu'un `await` de haut niveau : cela évite d'imposer une
// cible de compilation particulière au bundle. Le rendu n'a lieu qu'une
// fois l'état d'amorçage connu — `appliquer()` a alors déjà posé
// window.RAINDROP_GUI si l'application peut s'ouvrir.
void amorcer().then((amorce) => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <AppStateProvider>
          <DragProvider>
            <Racine amorce={amorce} />
          </DragProvider>
        </AppStateProvider>
      </QueryClientProvider>
    </React.StrictMode>,
  );
});
