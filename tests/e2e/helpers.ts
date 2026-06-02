import { type Page } from "@playwright/test";

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "raphael@orayasystem.fr";
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "R123";
export const CLIENT_EMAIL = process.env.E2E_CLIENT_EMAIL ?? "contact@syndessolutions.fr";
export const CLIENT_PASSWORD = process.env.E2E_CLIENT_PASSWORD ?? "";

/** Se connecte en tant que client et attend la redirection vers /dashboard */
export async function loginAsClient(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(CLIENT_EMAIL);
  await page.getByLabel("Mot de passe").fill(CLIENT_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

/** Se connecte en tant qu'admin et attend la redirection */
export async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Mot de passe").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/dashboard|\/admin/, { timeout: 15_000 });
}
