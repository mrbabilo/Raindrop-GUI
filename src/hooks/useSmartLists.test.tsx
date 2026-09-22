import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { useSmartLists, useCreerSmartList, useRenommerSmartList, useSupprimerSmartList } from "./useSmartLists";
import type { SmartList } from "../../shared/types";

const getMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/api", () => ({ api: { get: getMock, send: sendMock } }));

const sl = (champs: Partial<SmartList>): SmartList => ({
  id: "sl-1", label: "Rust", vue: { collectionId: 0, tags: ["rust"] }, cree: "2026-09-22T10:00:00Z", ...champs,
});

// Harnais : rend la liste et expose les trois mutations par boutons — le
// contrat testé est l'appel réseau et l'invalidation, pas le composant.
const Harnais = () => {
  const { data, refetch } = useSmartLists();
  const creer = useCreerSmartList();
  const renommer = useRenommerSmartList();
  const supprimer = useSupprimerSmartList();
  return (
    <div>
      <ul>{(data ?? []).map((s) => <li key={s.id}>{s.label}</li>)}</ul>
      <button type="button" onClick={() => void refetch()}>refetch</button>
      <button type="button" onClick={() => creer.mutate({ label: "Nouvelle", vue: { collectionId: 0 } })}>creer</button>
      <button type="button" onClick={() => renommer.mutate({ id: "sl-1", label: "Autre nom" })}>renommer</button>
      <button type="button" onClick={() => supprimer.mutate("sl-1")}>supprimer</button>
    </div>
  );
};

const rendre = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Harnais />
    </QueryClientProvider>,
  );

beforeEach(() => {
  getMock.mockReset();
  sendMock.mockReset().mockResolvedValue({});
  getMock.mockResolvedValue({ items: [sl({})] });
});

describe("useSmartLists", () => {
  it("GET /api/smartlists rend les items", async () => {
    rendre();
    expect(await screen.findByText("Rust")).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith("/api/smartlists");
  });

  it("creer → POST portant label et vue", async () => {
    rendre();
    await userEvent.click(screen.getByText("creer"));
    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith("POST", "/api/smartlists", { label: "Nouvelle", vue: { collectionId: 0 } }),
    );
  });

  it("renommer → PATCH /:id portant le label", async () => {
    rendre();
    await userEvent.click(screen.getByText("renommer"));
    await waitFor(() => expect(sendMock).toHaveBeenCalledWith("PATCH", "/api/smartlists/sl-1", { label: "Autre nom" }));
  });

  it("supprimer → DELETE /:id", async () => {
    rendre();
    await userEvent.click(screen.getByText("supprimer"));
    await waitFor(() => expect(sendMock).toHaveBeenCalledWith("DELETE", "/api/smartlists/sl-1"));
  });

  // L'invalidation est le contrat silencieux : après une écriture, le GET
  // est rejoué (sinon l'entrée n'apparaît qu'au prochain refetch indirect).
  it("une écriture invalide la requête : le GET est rejoué", async () => {
    rendre();
    expect(await screen.findByText("Rust")).toBeInTheDocument();
    getMock.mockResolvedValue({ items: [] }); // l'état APRÈS suppression
    await userEvent.click(screen.getByText("supprimer"));
    await waitFor(() => expect(getMock.mock.calls.length).toBeGreaterThan(1));
    await waitFor(() => expect(screen.queryByText("Rust")).not.toBeInTheDocument());
  });
});
