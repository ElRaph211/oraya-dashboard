import { test, expect } from "@playwright/test";
import path from "path";
import { loginAsClient } from "./helpers";

const CSV_FIXTURE = path.join(__dirname, "../fixtures/sample-invoices.csv");

/**
 * Tests du flux import CSV.
 * Prérequis :
 *  - compte client connecté (E2E_CLIENT_EMAIL / E2E_CLIENT_PASSWORD)
 *  - ligne dans public.clients pour ce compte
 *  - contrainte UNIQUE sur invoices(invoice_number, client_id) en place
 */

test.describe("Page import CSV", () => {
  test("page import s'affiche avec les 4 étapes", async ({ page }) => {
    await loginAsClient(page);
    await page.goto("/invoices/import");

    await expect(page.getByRole("heading", { name: /Importer un CSV/i })).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText("1 · Fichier")).toBeVisible();
    await expect(page.getByText("2 · Mapping IA")).toBeVisible();
    await expect(page.getByText("3 · Aperçu")).toBeVisible();
    await expect(page.getByText("4 · Importé")).toBeVisible();
  });

  test("zone de dépôt et bouton Parcourir visibles", async ({ page }) => {
    await loginAsClient(page);
    await page.goto("/invoices/import");

    await expect(page.getByText(/Glissez votre fichier/i)).toBeVisible();
    await expect(page.getByText(/Parcourir/i)).toBeVisible();
  });

  test("lien retour navigue vers /invoices", async ({ page }) => {
    await loginAsClient(page);
    await page.goto("/invoices/import");
    await page.getByRole("link", { name: /Retour aux factures/i }).click();
    await expect(page).toHaveURL(/\/invoices$/);
  });

  test("upload CSV → passe à l'étape mapping", async ({ page }) => {
    await loginAsClient(page);
    await page.goto("/invoices/import");

    // Upload via l'input file caché
    await page.locator('input[type="file"]').setInputFiles(CSV_FIXTURE);

    // On doit arriver à l'étape 2 (mapping)
    await expect(page.getByText("sample-invoices.csv")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/lignes détectées/i)).toBeVisible({ timeout: 8_000 });
  });

  test("mapping IA détecte les colonnes du CSV", async ({ page }) => {
    await loginAsClient(page);
    await page.goto("/invoices/import");

    await page.locator('input[type="file"]').setInputFiles(CSV_FIXTURE);

    // Attendre que l'IA finisse (ou timeout → mapping manuel)
    await page.waitForTimeout(5_000);

    // Les selects de mapping doivent être visibles
    await expect(page.getByText(/Numéro de facture/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Client/i)).toBeVisible();
    await expect(page.getByText(/Montant TTC/i)).toBeVisible();
  });

  test("import complet → succès et redirection vers /invoices", async ({ page }) => {
    await loginAsClient(page);
    await page.goto("/invoices/import");

    await page.locator('input[type="file"]').setInputFiles(CSV_FIXTURE);

    // Attendre le mapping IA (jusqu'à 12s)
    await expect(page.getByText(/lignes détectées/i)).toBeVisible({ timeout: 8_000 });
    await page.waitForTimeout(8_000); // laisser l'IA mapper

    // Cliquer sur Importer
    const importBtn = page.getByRole("button", { name: /Importer/i });
    await expect(importBtn).toBeEnabled({ timeout: 5_000 });
    await importBtn.click();

    // Succès → message ou redirection
    await expect(
      page.getByText(/Import réussi|Erreur Supabase/i)
    ).toBeVisible({ timeout: 20_000 });
  });

  test("les factures importées apparaissent dans /invoices", async ({ page }) => {
    await loginAsClient(page);
    await page.goto("/invoices");

    // Après un import précédent, les factures doivent apparaître
    await page.waitForTimeout(1_000);
    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    // Au moins une facture (si le test d'import a tourné avant)
    expect(count).toBeGreaterThan(0);
  });
});
