import { test, expect } from "./fixtures";

test("doublon périmé : expliquer puis actualiser uniquement sur demande", async ({ page, api, openApp }) => {
  let scans = 0;
  const item = api.items[0]!;
  api.overrides.set("GET /api/analysis/results/duplicates", async (route) => {
    await route.fulfill({ json: { exact: scans ? [] : [{ key: "https://example.test", items: [item, api.items[1]!] }], normalized: [], fuzzy: [] } });
  });
  api.overrides.set(`GET /api/raindrops/${item.id}`, async (route) => {
    await route.fulfill({ status: 404, json: { error: { code: "SIGNET_INTROUVABLE", message: "introuvable" } } });
  });
  api.overrides.set("POST /api/analysis/scan", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ type: "duplicates" });
    scans++;
    await route.fulfill({ status: 409, json: { error: { code: "SCAN_EN_COURS", message: "Une analyse est déjà en cours." } } });
  });
  await openApp();
  await page.getByRole("button", { name: "Nettoyage", exact: true }).click();
  await page.getByRole("button", { name: /Doublons/ }).first().click();
  await page.getByText(item.title, { exact: true }).first().click();
  await expect(page.getByText(/Ce signet n’est plus accessible/)).toBeVisible();
  await expect(page.getByText(/résultat d’analyse peut être périmé/)).toBeVisible();
  expect(scans).toBe(0);
  await page.getByRole("button", { name: "Actualiser les doublons", exact: true }).click();
  await expect(page.getByText("Une analyse est déjà en cours.", { exact: true })).toBeVisible();
  expect(scans).toBe(1);
  await expect(page.getByRole("button", { name: "Fermer le détail" })).toBeVisible();
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  api.overrides.set("POST /api/analysis/scan", async (route) => {
    scans++;
    await route.fulfill({ status: 202, json: { jobId: "refresh" } });
  });
  api.overrides.set("GET /api/jobs/refresh/events", async (route) => {
    await pending;
    await route.fulfill({ contentType: "text/event-stream", body: 'event: done\ndata: {}\n\n' });
  });
  try {
    await page.getByRole("button", { name: "Actualiser les doublons", exact: true }).click();
    await expect(page.getByRole("button", { name: "Actualiser les doublons", exact: true })).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: "Actualisation des doublons" })).toBeVisible();
    expect(scans).toBe(2);
    finish();
    await expect(page.getByText(item.title, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Actualiser les doublons", exact: true })).toBeEnabled();
  } finally { finish(); }
});


test("une panne de lecture reste réessayable sans déclarer le signet absent", async ({ page, api, openApp }) => {
  api.overrides.set("GET /api/raindrops/1000", async (route) => {
    await route.fulfill({ status: 502, json: { error: { code: "RAINDROP_API", message: "http 500" } } });
  });
  await openApp();
  await page.locator('main [data-index="0"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "http 500" })).toBeVisible();
  await expect(page.getByText(/Ce signet n’est plus accessible/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Actualiser les doublons", exact: true })).toHaveCount(0);
  api.overrides.delete("GET /api/raindrops/1000");
  await page.getByRole("button", { name: "Réessayer", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "http 500" })).toHaveCount(0);
});
