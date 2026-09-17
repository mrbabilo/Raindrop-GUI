import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { trierCollections } from "../lib/ordre";
import type { Collection, RaindropUser, Tag } from "../../shared/types";

// Noms du brief, formes du DTO partagé : une seule définition des DTO
// (shared/types.ts), consommés tels quels — le front ne voit jamais le
// format brut Raindrop.
export type UserInfo = RaindropUser;
export type { Tag };

// Trié ICI, et pas dans chaque écran : l'API rend les collections dans son
// propre ordre, et un tri par appelant ferait lire le même arbre de trois
// façons (sidebar, palette ⌘K, destinations de déplacement).
export const useCollections = () =>
  useQuery({
    queryKey: ["collections"],
    queryFn: () =>
      api.get<{ items: Collection[] }>("/api/collections").then((r) => trierCollections(r.items)),
  });

export const useTags = () =>
  useQuery({
    queryKey: ["tags"],
    queryFn: () => api.get<{ items: Tag[] }>("/api/tags").then((r) => r.items),
  });

export const useUser = () =>
  useQuery({ queryKey: ["user"], queryFn: () => api.get<UserInfo>("/api/user") });

// L'état de la connexion MCP est volatil : rafraîchi toutes les 15 s pour
// que l'indicateur du shell suive sans action de l'utilisateur.
export const useHealth = () =>
  useQuery({
    queryKey: ["health"],
    queryFn: () => api.get<{ status: string; mcp: string }>("/api/health"),
    refetchInterval: 15_000,
  });
