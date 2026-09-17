import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { TagsView } from "./TagsView";
import { tags } from "../test/fixtures";

// Le vrai useTagManage (useMutations) est exercé : c'est lui le contrat
// (endpoint + corps + invalidations) — seul le transport (api.send) est mocké.
// vi.mock est hissé au-dessus des const : les mocks passent par vi.hoisted /
// factory asynchrone (pattern App.test.tsx, TDZ).
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn(async () => ({})) }));
vi.mock("../lib/api", () => ({ api: { send: sendMock } }));
vi.mock("../hooks/useStaticData", async () => {
  const { tags } = await import("../test/fixtures");
  return { useTags: () => ({ data: tags }), useCollections: () => ({ data: [] }) };
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

beforeEach(() => sendMock.mockReset().mockResolvedValue({}));

describe("TagsView", () => {
  it("renomme un tag (rename → new_name)", async () => {
    render(<TagsView />, { wrapper });
    await userEvent.click(screen.getAllByRole("button", { name: "Renommer" })[0]!);
    await userEvent.type(screen.getByRole("textbox"), "ts");
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith("POST", "/api/tags/manage", {
        operation: "rename",
        tags: ["typescript"],
        new_name: "ts",
      }),
    );
  });

  it("fusionne les tags cochés vers un nom cible", async () => {
    render(<TagsView />, { wrapper });
    await userEvent.click(screen.getByRole("checkbox", { name: "rust" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "design" }));
    await userEvent.type(screen.getByPlaceholderText("Nouveau nom"), "dev");
    await userEvent.click(screen.getByRole("button", { name: "Fusionner" }));
    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith("POST", "/api/tags/manage", {
        operation: "merge",
        tags: ["rust", "design"],
        new_name: "dev",
      }),
    );
  });

  // Confirm inline niveau 1 : le premier geste arme seulement — le vrai
  // envoi (irréversible côté Raindrop) exige le second.
  it("supprime un tag : deux gestes réels avant l'envoi", async () => {
    render(<TagsView />, { wrapper });
    await userEvent.click(screen.getAllByRole("button", { name: "Supprimer" })[0]!);
    expect(sendMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Confirmer" }));
    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith("POST", "/api/tags/manage", {
        operation: "delete",
        tags: ["typescript"],
      }),
    );
  });

  // R8P-1 : tout échec est inline (role="alert"), état conservé — cases et
  // saisie restent en place pour retenter.
  it("échec de fusion : erreur inline, état conservé", async () => {
    sendMock.mockRejectedValueOnce(new Error("boom"));
    render(<TagsView />, { wrapper });
    await userEvent.click(screen.getByRole("checkbox", { name: "rust" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "design" }));
    await userEvent.type(screen.getByPlaceholderText("Nouveau nom"), "dev");
    await userEvent.click(screen.getByRole("button", { name: "Fusionner" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Erreur : boom");
    expect(screen.getByRole("checkbox", { name: "rust" })).toBeChecked();
    expect(screen.getByPlaceholderText("Nouveau nom")).toHaveValue("dev");
  });
});
