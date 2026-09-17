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
  defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
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
