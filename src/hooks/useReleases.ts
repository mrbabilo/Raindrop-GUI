import { useQuery } from "@tanstack/react-query";
import { getVersion } from "@tauri-apps/api/app";

// La version installée vient du shell (la version du tauri.conf.json) et la
// dernière publiée de l'API GitHub publique du dépôt — sans token. Le
// cache est long et l'échec silencieux : c'est un confort, pas un état
// (DESIGN §9 « masqué si nul » — pas de bandeau pour un réseau absent).

export interface ReleaseGithub {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  prerelease: boolean;
  published_at: string | null;
}

const REPO = "mrbabilo/Raindrop-GUI";

/** `releases/latest` EXCLUT les préreleases — or toutes nos publications en
 *  sont : la liste complète, la plus récente en premier. */
export function useReleases() {
  return useQuery({
    queryKey: ["github-releases"],
    queryFn: async (): Promise<ReleaseGithub[]> => {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=5`);
      if (!res.ok) throw new Error(`github releases : http ${res.status}`);
      return (await res.json()) as ReleaseGithub[];
    },
    staleTime: 3_600_000,
    retry: false,
  });
}

export function useVersionInstallee() {
  return useQuery({
    queryKey: ["version-installee"],
    queryFn: () => getVersion(),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}
