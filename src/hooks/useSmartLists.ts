import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useInvalidate } from "./useMutations";
import type { SmartList, SmartListView } from "../../shared/types";

// Le répertoire des vues sauvegardées (spec 2026-09-22) : un JSON local,
// le GET est bon marché — chaque écriture invalide la clé entière, pas de
// mise à jour optimiste à maintenir.

export const useSmartLists = () =>
  useQuery({
    queryKey: ["smartlists"],
    queryFn: () => api.get<{ items: SmartList[] }>("/api/smartlists").then((r) => r.items),
  });

export const useCreerSmartList = () => {
  const invalidate = useInvalidate();
  return useMutation({
    // Le sidecar pose id et cree — le front n'a pas voix dessus (spec §3).
    mutationFn: (v: { label: string; vue: SmartListView }) =>
      api.send<SmartList>("POST", "/api/smartlists", v),
    onSuccess: () => invalidate("smartlists"),
  });
};

export const useRenommerSmartList = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { id: string; label: string }) =>
      api.send<SmartList>("PATCH", `/api/smartlists/${v.id}`, { label: v.label }),
    onSuccess: () => invalidate("smartlists"),
  });
};

export const useSupprimerSmartList = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.send("DELETE", `/api/smartlists/${id}`),
    onSuccess: () => invalidate("smartlists"),
  });
};
