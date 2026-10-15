import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  timeout: 20_000,
  expect: { timeout: 5_000 },
  outputDir: "test-results/ui",
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4178",
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: ["chromium", "webkit"].flatMap((browserName) => [
    {
      name: `${browserName}-clair`,
      use: { browserName: browserName as "chromium" | "webkit", colorScheme: "light" as const, viewport: { width: 1280, height: 800 } },
    },
    {
      name: `${browserName}-sombre-compact`,
      use: { browserName: browserName as "chromium" | "webkit", colorScheme: "dark" as const, viewport: { width: 960, height: 600 } },
    },
  ]),
  webServer: {
    command: "npm run build:front && npm run preview -- --host 127.0.0.1 --port 4178 --strictPort",
    url: "http://127.0.0.1:4178",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
