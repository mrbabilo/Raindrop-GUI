import { describe, it, expect, vi, afterEach } from "vitest";
import { ouvrirPageWeb } from "./pageWeb";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

describe("ouvrirPageWeb", () => {
  afterEach(() => {
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.restoreAllMocks();
  });

  it("hors Tauri (dev navigateur, tests) : window.open, jamais l'API Tauri", async () => {
    const ouvert = vi.spyOn(window, "open").mockReturnValue(null);
    await ouvrirPageWeb("https://exemple.fr/page");
    expect(ouvert).toHaveBeenCalledWith("https://exemple.fr/page", "_blank", "noopener");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("sous l'origine Tauri : la commande du shell, jamais window.open", async () => {
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    const ouvert = vi.spyOn(window, "open").mockReturnValue(null);
    invokeMock.mockResolvedValue(undefined);
    await ouvrirPageWeb("https://exemple.fr/page");
    expect(invokeMock).toHaveBeenCalledWith("ouvrir_page_web", { url: "https://exemple.fr/page" });
    expect(ouvert).not.toHaveBeenCalled();
  });
});
