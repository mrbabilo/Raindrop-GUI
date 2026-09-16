import { describe, it, expect, vi, afterEach } from "vitest";
import { getConnection } from "./connection";

afterEach(() => {
  vi.unstubAllEnvs();
  delete window.RAINDROP_GUI;
});

describe("getConnection", () => {
  it("prod : baseUrl depuis window.RAINDROP_GUI (injection Tauri), token éphémère", () => {
    window.RAINDROP_GUI = { port: 51234, token: "ephemere" };
    expect(getConnection()).toEqual({
      baseUrl: "http://127.0.0.1:51234",
      token: "ephemere",
    });
  });

  it("dev : même origine (baseUrl vide) et token VITE_LOCAL_API_TOKEN", () => {
    vi.stubEnv("VITE_LOCAL_API_TOKEN", "dev-local-token");
    expect(getConnection()).toEqual({ baseUrl: "", token: "dev-local-token" });
  });

  it("dev sans variable d'env : token = '' (jamais undefined)", () => {
    vi.stubEnv("VITE_LOCAL_API_TOKEN", undefined);
    expect(getConnection()).toEqual({ baseUrl: "", token: "" });
  });
});
