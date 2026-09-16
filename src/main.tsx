import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { AppStateProvider } from "./state/appState";
import App from "./App";
import "./styles.css";

// retry: false — les erreurs sont traitées par code + statut (ApiError),
// pas retentées à l'aveugle. staleTime 30 s : pas de refetch au simple
// remontage d'un composant.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppStateProvider>
        <App />
      </AppStateProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
