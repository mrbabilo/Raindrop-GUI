import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["shared/**/*.test.ts", "sidecar/**/*.test.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
