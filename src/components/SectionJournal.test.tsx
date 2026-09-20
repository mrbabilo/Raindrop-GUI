import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { SectionJournal } from "./SectionJournal";

const { getMock, writeTextMock } = vi.hoisted(() => ({ getMock: vi.fn(), writeTextMock: vi.fn() }));
vi.mock("../lib/api", () => ({ api: { get: getMock } }));

const entries = [
  { ts: "2026-09-20T10:00:00Z", level: "info", msg: "corbeille", id: 12 },
  { ts: "2026-09-20T10:01:00Z", level: "info", msg: "bulk", operation: "delete", ids: [11, 12] },
];

const renderJournal = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SectionJournal />
    </QueryClientProvider>,
  );

beforeEach(() => {
  getMock.mockReset().mockResolvedValue({ entries });
  writeTextMock.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText: writeTextMock }, configurable: true });
});

describe("SectionJournal", () => {
  it("rend les entrées du jour, formatées lisibles", async () => {
    renderJournal();
    expect((await screen.findByText(/corbeille · id=12/)).tagName).toBe("PRE");
    expect(screen.getByText(/bulk · operation=delete/)).toBeInTheDocument();
  });

  it("un journal vide DIT qu'il est vide — jamais un bloc blanc", async () => {
    getMock.mockResolvedValue({ entries: [] });
    renderJournal();
    expect(await screen.findByText("Rien encore aujourd'hui.")).toBeInTheDocument();
  });

  it("une erreur de lecture reste nommée", async () => {
    getMock.mockRejectedValue(new Error("http 502"));
    // Sans retry:false, react-query retente 3 fois (≈ 3 s de backoff) avant
    // d'admettre l'erreur — le findByRole partait en timeout.
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SectionJournal />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("http 502");
  });

  it("« Copier » écrit le journal formaté au presse-papiers, et le dit", async () => {
    renderJournal();
    await userEvent.click(await screen.findByRole("button", { name: "Copier" }));
    expect(writeTextMock).toHaveBeenCalledTimes(1);
    const texte = writeTextMock.mock.calls[0]![0] as string;
    expect(texte).toContain("corbeille · id=12");
    expect(texte).toContain("bulk · operation=delete");
    expect(await screen.findByRole("button", { name: "Copié" })).toBeInTheDocument();
  });

  it("« Rafraîchir » relit le journal", async () => {
    renderJournal();
    await screen.findByText(/corbeille · id=12/);
    await userEvent.click(screen.getByRole("button", { name: "Rafraîchir" }));
    await vi.waitFor(() => expect(getMock).toHaveBeenCalledTimes(2));
  });
});
