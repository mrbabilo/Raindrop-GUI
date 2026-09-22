import { describe, it, expect } from "vitest";
import { errorStatus } from "./errors.js";

describe("errorStatus", () => {
  it("mappe chaque code sur le statut HTTP de la spec", () => {
    expect(errorStatus("INVALID_INPUT")).toBe(400);
    expect(errorStatus("RATE_LIMITED")).toBe(429);
    expect(errorStatus("RAINDROP_API")).toBe(502);
    expect(errorStatus("MCP_CRASHED")).toBe(503);
    expect(errorStatus("MCP_TIMEOUT")).toBe(504);
    expect(errorStatus("NOT_FOUND")).toBe(404);
    expect(errorStatus("STOCKAGE")).toBe(500);
  });
});
