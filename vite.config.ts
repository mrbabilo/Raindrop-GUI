import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// R13 : `port: 0` = binding en cours → on attend (bloquant) que le lockfile
// porte un port > 0. Config Vite = processus Node, pas navigateur :
// Atomics.wait y est légal (attente synchrone de 250 ms).
function sidecarPort(): number {
  const dir =
    process.env.APPDATA_DIR ??
    join(homedir(), "Library", "Application Support", "Raindrop-GUI");
  const file = join(dir, "sidecar.json");
  for (let i = 0; i < 40; i++) {
    try {
      const data = JSON.parse(readFileSync(file, "utf8")) as { port: number };
      if (data.port > 0) return data.port;
    } catch {
      /* pas encore écrit */
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error(
    `sidecar introuvable (${file}) — lancez ./scripts/dev-sidecar.sh`,
  );
}

// Options de test communes aux deux projets (ruling R1P : l'ancien
// vitest.config.ts est supprimé, tout vitest vit ici ; timeouts 15000
// repris de l'ancien fichier — scans SSE et jobs lents).
const sharedTest = {
  globals: true,
  setupFiles: ["src/test/setup.ts"],
  css: false,
  testTimeout: 15000,
  hookTimeout: 15000,
} as const;

export default defineConfig(({ command, isPreview }) => ({
  // tailwindcss() manquait ici (relevé pendant Task 2) : sans lui,
  // `@import "tailwindcss"` ne fait qu'inliner le CSS par défaut du paquet
  // (variables --color-red-*, etc.) sans jamais scanner le code source —
  // aucune classe utilitaire (grid, border-b, rounded…) n'est générée.
  // Vérifié : `npm run build:front` puis grep sur dist/assets/*.css.
  plugins: [tailwindcss(), react()],
  // Le proxy ne concerne que le serveur de dev : sans ce garde, la config
  // serait évaluée aussi par `vite build`/`vite preview` (exigerait un
  // sidecar en marche) et par vitest (`npm test`, process.env.VITEST positionné).
  server:
    command === "serve" &&
    !isPreview &&
    process.env.VITEST === undefined &&
    // Sous Tauri (`tauri dev` pose TAURI_ENV_PLATFORM avant d'appeler cette
    // commande), le front parle DIRECTEMENT au sidecar par
    // window.RAINDROP_GUI : le proxy n'a rien à faire, et sidecarPort()
    // bloquerait 10 s sur un lockfile que Tauri n'a pas encore écrit.
    process.env.TAURI_ENV_PLATFORM === undefined
      ? {
          port: 5173,
          proxy: {
            "/api": {
              target: `http://127.0.0.1:${sidecarPort()}`,
              changeOrigin: false,
            },
          },
        }
      : { port: 5173, strictPort: true },
  // Deux environnements : node pour sidecar/shared (leur code lit
  // import.meta.url comme file:// — casse sous jsdom), jsdom pour le front.
  test: {
    // pool/poolOptions n'est pas configurable par projet (partagé par tout
    // le run) : posé ici, au niveau racine. Node ≥ 22 expose un
    // `globalThis.localStorage` natif (expérimental, muet sans
    // --localstorage-file) qui masque celui de jsdom lors du peuplement des
    // globals — theme.ts le lirait `undefined`. Sans effet sur le projet
    // node (aucun code sidecar/shared n'y touche).
    pool: "forks",
    poolOptions: {
      forks: { execArgv: ["--no-experimental-webstorage"] },
    },
    projects: [
      {
        test: {
          ...sharedTest,
          name: "node",
          environment: "node",
          include: ["shared/**/*.test.ts", "sidecar/**/*.test.ts"],
        },
      },
      {
        // plugins/react requis ici : les projets inline vitest ne reprennent
        // pas les plugins Vite racine → runtime JSX automatic sinon absent.
        plugins: [react()],
        test: {
          ...sharedTest,
          name: "front",
          environment: "jsdom",
          include: ["src/**/*.test.tsx", "src/**/*.test.ts"],
        },
      },
    ],
  },
}));
