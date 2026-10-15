import { test, expect, capture } from "./fixtures";

// Tests de comportement attendu, volontairement NON marqués test.fail/skip.
// Le tag @audit identifie les régressions issues de l’audit initial.
test("@audit A08 les réglages reçoivent et contiennent le focus", async ({ page, openApp }) => {
  await openApp();
  await page.getByRole("button", { name: "Réglages", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Réglages", exact: true })).toBeVisible();
  await capture(page, "reglages-focus");
  const dialog = page.getByRole("dialog", { name: "Réglages", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  const refreshPrevented = await page.evaluate(() => {
    const event = new KeyboardEvent("keydown", { key: "r", metaKey: true, bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(refreshPrevented).toBe(true);
  await page.keyboard.press("Meta+e");
  await page.keyboard.press("Meta+k");
  await expect(page.locator('input[role="combobox"]')).toHaveCount(0);
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  const controls = dialog.locator(
    'button:visible:not([disabled]), input:visible:not([disabled]), select:visible:not([disabled]), textarea:visible:not([disabled]), a[href]:visible',
  ).filter({ visible: true });
  await controls.first().focus();
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await controls.last().focus();
  await page.keyboard.press("Tab");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Réglages", exact: true })).toBeFocused();
});

test("@audit A08 Échap ferme les réglages sans fermer la fiche", async ({ page, openApp }) => {
  await openApp();
  await page.locator('main [data-index="0"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Fermer le détail" })).toBeVisible();
  await page.getByRole("button", { name: "Réglages", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Réglages", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Réglages", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Fermer le détail" })).toBeVisible();
});

test("@audit A09 la palette fait défiler son option active", async ({ page, openApp }) => {
  await openApp();
  // Attendre les collections avant de déplacer la sélection dans leurs options.
  await expect(page.getByRole("button", { name: /Bibliothèque de travail/ })).toBeVisible();
  await page.keyboard.press("Meta+k");
  const combo = page.locator('input[role="combobox"]');
  await expect(combo).toBeFocused();
  for (let i = 0; i < 20; i++) await combo.press("ArrowDown");
  const active = await combo.getAttribute("aria-activedescendant");
  expect(active).toBeTruthy();
  await expect(page.locator(`[id="${active}"]`)).toHaveAttribute("aria-selected", "true");
  await capture(page, "palette-option-active");
  // toBeVisible ne détecte pas une option masquée par overflow : géométrie réelle.
  expect(await page.locator(`[id="${active}"]`).evaluate((option) => {
    const list = option.closest('[role="listbox"]')!;
    const a = option.getBoundingClientRect();
    const b = list.getBoundingClientRect();
    return a.top >= b.top && a.bottom <= b.bottom;
  })).toBe(true);
});

test("@audit A04 une création terminée conserve le brouillon suivant", async ({ page, api, openApp }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  api.overrides.set("POST /api/raindrops", async (route) => {
    await pending;
    const created = { ...api.items[0]!, id: 2000 };
    api.items.unshift(created);
    await route.fulfill({ json: created });
  });
  await openApp();
  const input = page.getByTestId("composer-input");
  await input.fill("https://a.example.test");
  const sent = page.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname === "/api/raindrops");
  try {
    await page.getByRole("button", { name: "Sauvegarder", exact: true }).click();
    await sent;
    await input.fill("https://b.example.test");
    const response = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/raindrops");
    release();
    await response;
    // La mutation invalide la liste après réponse : attendre ce rendu, pas un sleep.
    await expect(page.getByTestId("row-2000")).toBeVisible();
    await expect(input).toHaveValue("https://b.example.test");
  } finally { release(); }
});

test("@audit A02 la suppression de collections verrouille Exécuter", async ({ page, api, openApp }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  // Retenir le premier DELETE, les suivants répondent normalement au teardown.
  for (let id = 102; id <= 130; id++) {
    api.overrides.set(`DELETE /api/collections/${id}`, async (route) => {
      await pending;
      await route.fulfill({ json: { deleted: true } });
    });
  }
  await openApp();
  await page.getByRole("button", { name: "Nettoyage", exact: true }).click();
  await page.getByRole("button", { name: /Collections vides/ }).click();
  await page.getByRole("button", { name: "Supprimer les collections vides", exact: true }).click();
  await page.getByPlaceholder(/Tapez SUPPRIMER/).fill("SUPPRIMER");
  const execute = page.getByRole("button", { name: "Exécuter", exact: true });
  const sent = page.waitForRequest((r) => r.method() === "DELETE");
  try {
    await execute.click();
    await sent;
    await expect(execute).toBeDisabled();
  } finally { release(); }
});
