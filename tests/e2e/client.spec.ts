import { test, expect } from "@playwright/test";
import { loginAsClient, CLIENT_EMAIL } from "./helpers";

/**
 * Tests du flux client connecté.
 * Prérequis : E2E_CLIENT_EMAIL + E2E_CLIENT_PASSWORD dans l'env,
 * et le compte doit avoir une ligne dans public.clients.
 */

test.describe("Dashboard client", () => {
  test("dashboard s'affiche après login", async ({ page }) => {
    await loginAsClient(page);
    await expect(page).toHaveURL(/\/dashboard/);
    // La sidebar doit montrer l'email du client
    await expect(page.getByText(CLIENT_EMAIL, { exact: false })).toBeVisible({ timeout: 8_000 });
  });

  test("sidebar ne montre PAS le lien Admin pour un client", async ({ page }) => {
    await loginAsClient(page);
    // Attend que la sidebar charge
    await page.waitForTimeout(1_500);
    await expect(page.getByRole("link", { name: /^Admin$/i })).not.toBeVisible();
  });

  test("lien Factures navigue vers /invoices", async ({ page }) => {
    await loginAsClient(page);
    await page.getByRole("link", { name: /Factures/i }).click();
    await expect(page).toHaveURL(/\/invoices/);
    await expect(page.getByRole("heading", { name: /Factures/i })).toBeVisible({ timeout: 8_000 });
  });

  test("lien Débiteurs navigue vers /debtors", async ({ page }) => {
    await loginAsClient(page);
    await page.getByRole("link", { name: /Débiteurs/i }).click();
    await expect(page).toHaveURL(/\/debtors/);
    await expect(page.getByRole("heading", { name: /Débiteurs/i })).toBeVisible({ timeout: 8_000 });
  });

  test("client redirigé vers /dashboard s'il tente /admin/clients", async ({ page }) => {
    await loginAsClient(page);
    await page.goto("/admin/clients");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 8_000 });
  });

  test("déconnexion redirige vers /login", async ({ page }) => {
    await loginAsClient(page);
    await page.getByRole("button", { name: /Déconnexion/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
  });
});

test.describe("Page factures", () => {
  test("page factures s'affiche avec les filtres", async ({ page }) => {
    await loginAsClient(page);
    await page.goto("/invoices");
    await expect(page.getByRole("heading", { name: /Factures/i })).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole("button", { name: "Toutes" })).toBeVisible();
    await expect(page.getByRole("button", { name: "En retard" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Importer un CSV/i })).toBeVisible();
  });

  test("bouton importer CSV navigue vers /invoices/import", async ({ page }) => {
    await loginAsClient(page);
    await page.goto("/invoices");
    await page.getByRole("link", { name: /Importer un CSV/i }).click();
    await expect(page).toHaveURL(/\/invoices\/import/);
    await expect(page.getByRole("heading", { name: /Importer un CSV/i })).toBeVisible({ timeout: 8_000 });
  });
});

test.describe("Page débiteurs", () => {
  test("page débiteurs s'affiche avec KPIs", async ({ page }) => {
    await loginAsClient(page);
    await page.goto("/debtors");
    await expect(page.getByRole("heading", { name: /Débiteurs/i })).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/Débiteurs suivis/i)).toBeVisible();
    await expect(page.getByText(/Encours total/i)).toBeVisible();
  });

  test("filtre de risque fonctionne", async ({ page }) => {
    await loginAsClient(page);
    await page.goto("/debtors");
    await page.getByRole("button", { name: /Risque élevé/i }).click();
    // La page ne plante pas — filtre appliqué
    await expect(page.getByRole("heading", { name: /Débiteurs/i })).toBeVisible();
  });
});
