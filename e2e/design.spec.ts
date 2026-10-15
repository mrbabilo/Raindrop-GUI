import { test, expect, capture } from "./fixtures";

test("Revue : toute la largeur, fiche conservée au retour", async ({ page, openApp }) => {
  await openApp();
  await page.locator('main [data-index="0"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Fermer le détail" })).toBeVisible();
  await page.getByRole("button", { name: "Nettoyage", exact: true }).click();
  await page.getByRole("button", { name: /Collections vides/ }).click();
  await page.getByRole("button", { name: "Supprimer les collections vides", exact: true }).click();
  await expect(page.getByRole("button", { name: "Fermer le détail" })).toHaveCount(0);
  const action = page.getByRole("button", { name: "Exécuter", exact: true });
  await expect(action).toBeInViewport();
  expect(await page.locator("main").evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(650);
  await capture(page, "revue-largeur-pilote");
  await page.getByRole("button", { name: "Retour", exact: true }).click();
  await expect(page.getByRole("button", { name: "Fermer le détail" })).toBeVisible();
});

test("Bibliothèque : titre, filtres nommés et champ utilisables en fenêtre compacte", async ({ page, openApp }) => {
  await openApp();
  await expect(page.getByRole("heading", { name: /Tous/ })).toBeVisible();
  const filters = page.getByRole("button", { name: "Filtres", exact: true });
  await expect(filters).toHaveText("Filtres");
  await expect(filters).toBeInViewport();
  expect(await page.getByRole("textbox", { name: "Rechercher", exact: true }).evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(140);
  await filters.click();
  await expect(filters).toHaveAttribute("aria-expanded", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByTestId("composer-input").fill("https://example.test/design");
  const contrast = await page.getByRole("button", { name: "Sauvegarder", exact: true }).evaluate((el) => {
    const css = getComputedStyle(el);
    const luminance = (color: string) => {
      const values = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722;
    };
    const a = luminance(css.color), b = luminance(css.backgroundColor);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await capture(page, "bibliotheque-filtres-pilote");
});

test("Cases : le survol répond en 120 ms et respecte le mouvement réduit", async ({ page, openApp }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openApp();
  const checkbox = page.getByRole("checkbox", { name: /Sélectionner Guide de conception accessible/ });
  const normal = await checkbox.evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(normal).toContain("0.12s");
  await checkbox.hover();
  await expect(checkbox).not.toHaveCSS("transform", "none");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(checkbox).toHaveCSS("transition-duration", "0s");
});

for (const reducedMotion of ["reduce", "no-preference"] as const) {
  test(`Dialogue : mouvement ${reducedMotion}, focus et état final`, async ({ page, openApp }) => {
    await page.emulateMedia({ reducedMotion });
    await openApp();
    await page.getByRole("button", { name: "Réglages", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Réglages", exact: true });
    const style = await dialog.evaluate((el) => {
      const css = getComputedStyle(el);
      return { name: css.animationName, duration: parseFloat(css.animationDuration) };
    });
    if (reducedMotion === "reduce") expect(style.name).toBe("none");
    else {
      expect(style.name).not.toBe("none");
      expect(style.duration).toBeGreaterThan(0);
      expect(style.duration).toBeLessThanOrEqual(0.25);
    }
    await expect(dialog).toHaveCSS("opacity", "1");
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await capture(page, `reglages-${reducedMotion}`);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Réglages", exact: true })).toBeFocused();
  });
}


test("Chargement : indicateur nommé, mouvement réduit puis résultats", async ({ page, api, openApp }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  api.overrides.set("GET /api/raindrops", async (route) => {
    await pending;
    await route.fulfill({ json: { items: api.items, count: api.items.length, page: 0, perPage: 50 } });
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  try {
    await openApp();
    const loading = page.getByRole("status").filter({ hasText: "Chargement" });
    await expect(loading).toBeVisible();
    const indicator = loading.locator('[aria-hidden="true"]');
    await expect(indicator).toHaveCSS("animation-name", "loading-turn");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(indicator).toHaveCSS("animation-name", "none");
    release();
    await expect(loading).toHaveCount(0);
    await expect(page.getByTestId("row-1000")).toBeVisible();
  } finally { release(); }
});
