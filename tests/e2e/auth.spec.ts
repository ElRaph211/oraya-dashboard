import { test, expect } from "@playwright/test";
import { loginAsAdmin, ADMIN_EMAIL, ADMIN_PASSWORD } from "./helpers";

// ---------------------------------------------------------------------------
// Routes publiques
// ---------------------------------------------------------------------------
test.describe("Pages publiques", () => {
  test("page login s'affiche correctement", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Mot de passe")).toBeVisible();
    await expect(page.getByRole("link", { name: "Créer un compte" })).toBeVisible();
  });

  test("page signup s'affiche avec tous les champs", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Créer un compte" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel(/Mot de passe/)).toBeVisible();
    await expect(page.getByLabel(/Nom de l'entreprise/)).toBeVisible();
    await expect(page.getByLabel(/CA annuel/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Créer mon compte/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Se connecter/ })).toBeVisible();
  });

  test("signup → login link navigue vers /login", async ({ page }) => {
    await page.goto("/signup");
    await page.getByRole("link", { name: /Se connecter/ }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("login → signup link navigue vers /signup", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: /Créer un compte/ }).click();
    await expect(page).toHaveURL(/\/signup/);
  });
});

// ---------------------------------------------------------------------------
// Redirections non authentifié
// ---------------------------------------------------------------------------
test.describe("Protection des routes", () => {
  const protectedRoutes = [
    "/dashboard",
    "/invoices",
    "/debtors",
    "/relances",
    "/admin/clients",
    "/admin/logs",
    "/invoices/import",
  ];

  for (const route of protectedRoutes) {
    test(`${route} redirige vers /login si non connecté`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
    });
  }
});

// ---------------------------------------------------------------------------
// Validation formulaire signup (sans appel réseau)
// ---------------------------------------------------------------------------
test.describe("Validation signup", () => {
  test("bouton désactivé si champs manquants", async ({ page }) => {
    await page.goto("/signup");
    const btn = page.getByRole("button", { name: /Créer mon compte/i });
    // Sans rien remplir, le formulaire HTML required bloque
    await btn.click();
    await expect(page).toHaveURL(/\/signup/); // pas de navigation
  });

  test("message d'erreur si CGU non cochées", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Email").fill("test@example.com");
    await page.getByLabel(/Mot de passe/).fill("motdepasse123");
    await page.getByLabel(/Nom de l'entreprise/).fill("Test Corp");
    await page.getByLabel(/CA annuel/).fill("100000");
    // Ne pas cocher CGU ni DPA
    await page.getByRole("button", { name: /Créer mon compte/i }).click();
    await expect(page.getByText(/CGU|DPA/i)).toBeVisible({ timeout: 3_000 });
  });
});

// ---------------------------------------------------------------------------
// Flux admin
// ---------------------------------------------------------------------------
test.describe("Flux admin", () => {
  test("admin se connecte et accède à /admin/clients", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/clients");
    await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=/Mode admin/i")).toBeVisible();
  });

  test("admin voit le lien Admin dans la sidebar", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByRole("link", { name: /Admin/i })).toBeVisible({ timeout: 8_000 });
  });

  test("admin accède à /admin/logs", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/logs");
    await expect(page.getByRole("heading", { name: /Journal/i })).toBeVisible({ timeout: 10_000 });
  });

  test("admin peut se déconnecter", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("button", { name: /Déconnexion/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
  });

  test("non-admin ne peut pas accéder à /admin/clients", async ({ page }) => {
    // Visite non authentifiée → login
    await page.goto("/admin/clients");
    await expect(page).toHaveURL(/\/login/);
  });
});
