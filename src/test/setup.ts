import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

// jsdom n'implémente pas matchMedia : défaut "clair", que les tests du
// thème (src/lib/theme.test.ts) remplacent explicitement selon leur cas.
// setup.ts est partagé avec le projet "node" (pas de `window`) : garde requise.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as typeof window.matchMedia;
}
