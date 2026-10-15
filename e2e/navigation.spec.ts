import { test, expect, capture } from "./fixtures";

test("bibliothèque lisible, thème et capture de revue", async ({ page, openApp }, info) => {
  await openApp();
  await expect(page.getByTestId("row-1000")).toBeVisible();
  await expect(page.locator("html")).toHaveClass(info.project.use.colorScheme === "dark" ? /dark/ : /^$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture(page, "bibliotheque");
});

test("replier puis rouvrir la navigation reste possible", async ({ page, openApp }) => {
  await openApp();
  await page.getByRole("button", { name: "Replier la barre latérale" }).click();
  await expect(page.getByRole("button", { name: "Nettoyage", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Déplier la barre latérale" }).click();
  await expect(page.getByRole("button", { name: "Nettoyage", exact: true })).toBeVisible();
});

test("flèches, sélection et ouverture du détail au clavier", async ({ page, openApp }) => {
  await openApp();
  const first = page.locator('main [data-index="0"]');
  const second = page.locator('main [data-index="1"]');
  await first.focus();
  await page.keyboard.press("ArrowDown");
  await expect(second).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("row-1001").getByRole("checkbox")).toBeChecked();
  await page.keyboard.press("Home");
  await expect(first).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Fermer le détail" })).toBeVisible();
  await expect(page.locator("aside h2")).toContainText("Guide de conception accessible");
  await capture(page, "bibliotheque-detail");
});

test("maintenir et survoler les cases peint la sélection puis la désélection", async ({ page, openApp }) => {
  await openApp();
  const cases = [0, 1, 2].map((i) => page.getByRole("checkbox", { name: `Sélectionner ${i === 0 ? "Guide de conception accessible — navigation, couleurs et interactions" : `Ressource ${String(i + 1).padStart(2, "0")}`}` }));
  const centres = await Promise.all(cases.map(async (c) => {
    const box = await c.boundingBox();
    if (!box) throw new Error("Case de sélection invisible");
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }));

  await page.mouse.move(centres[0]!.x, centres[0]!.y);
  await page.mouse.down();
  await page.mouse.move(centres[1]!.x, centres[1]!.y);
  await page.mouse.move(centres[2]!.x, centres[2]!.y);
  await page.mouse.up();
  for (const checkbox of cases) await expect(checkbox).toBeChecked();

  await page.mouse.move(centres[0]!.x, centres[0]!.y);
  await page.mouse.down();
  await page.mouse.move(centres[1]!.x, centres[1]!.y);
  await page.mouse.move(centres[2]!.x, centres[2]!.y);
  await page.mouse.up();
  for (const checkbox of cases) await expect(checkbox).not.toBeChecked();
});

test("la recherche vide garde une issue vers les résultats", async ({ page, openApp }) => {
  await openApp();
  const search = page.getByRole("textbox", { name: "Rechercher", exact: true });
  await search.fill("introuvable-xyz");
  await expect(page.getByText("Aucun signet ne correspond à la recherche et aux filtres.", { exact: true })).toBeVisible();
  await search.clear();
  await expect(page.getByTestId("row-1000")).toBeVisible();
});

test("erreur de liste puis réessai rétablit les résultats", async ({ page, api, openApp }) => {
  api.overrides.set("GET /api/raindrops", (route) => route.fulfill({
    status: 503, json: { error: { code: "MCP_CRASHED", message: "Connexion indisponible pour le test" } },
  }));
  await openApp();
  await expect(page.getByRole("alert")).toContainText("La connexion à Raindrop s'est interrompue");
  await expect(page.getByText("Aucun signet ne correspond à la recherche et aux filtres.", { exact: true })).toHaveCount(0);
  api.overrides.delete("GET /api/raindrops");
  await page.getByRole("button", { name: "Réessayer", exact: true }).click();
  await expect(page.getByTestId("row-1000")).toBeVisible();
});

test("mosaïque : ouvrir un signet et revenir à la liste", async ({ page, openApp }) => {
  await openApp();
  await page.getByRole("button", { name: "Afficher en mosaïque" }).click();
  await expect(page.getByTestId("tile-1000")).toBeVisible();
  await capture(page, "mosaique");
  await page.getByTestId("tile-1000").click();
  await expect(page.getByRole("button", { name: "Fermer le détail" })).toBeVisible();
  await page.getByRole("button", { name: "Afficher en liste" }).click();
  await expect(page.getByTestId("row-1000")).toBeVisible();
});

test("Nettoyage distingue une analyse absente de zéro problème", async ({ page, openApp }) => {
  await openApp();
  await page.getByRole("button", { name: "Nettoyage", exact: true }).click();
  await expect(page.getByRole("button", { name: /Liens morts/ })).toContainText(/jamais/i);
  for (const etat of ["dead", "redirect", "indeterminate", "duplicate"]) {
    await expect(page.locator(`[data-diagnostic="${etat}"]`).first()).toBeVisible();
  }
  await capture(page, "nettoyage");
});

test("la Revue interdit l'exécution avant confirmation", async ({ page, openApp }) => {
  await openApp();
  await page.getByRole("button", { name: "Nettoyage", exact: true }).click();
  await page.getByRole("button", { name: /Collections vides/ }).click();
  await page.getByRole("button", { name: "Supprimer les collections vides", exact: true }).click();
  const execute = page.getByRole("button", { name: "Exécuter", exact: true });
  await expect(execute).toBeDisabled();
  await page.getByPlaceholder(/Tapez SUPPRIMER/).fill("SUPPRIMER");
  await expect(execute).toBeEnabled();
  await expect(execute).toBeInViewport();
  await capture(page, "revue");
});
