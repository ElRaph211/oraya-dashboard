import { defineConfig, devices } from "@playwright/test";

/**
 * Oraya — Playwright e2e config.
 *
 * Variables d'env :
 *   E2E_BASE_URL        URL du dev server (défaut: http://localhost:5173)
 *   E2E_ADMIN_EMAIL     Email admin (défaut: raphael@orayasystem.fr)
 *   E2E_ADMIN_PASSWORD  Mot de passe admin (défaut: R123)
 *   E2E_CLIENT_EMAIL    Email d'un compte client de test
 *   E2E_CLIENT_PASSWORD Mot de passe du compte client de test
 *
 * Lancer :
 *   npm run test:e2e            → tous les tests (headless)
 *   npm run test:e2e:headed     → avec navigateur visible
 *   npm run test:e2e:ui         → interface graphique Playwright
 *   npm run test:e2e:auth       → seulement auth.spec.ts
 *   npm run test:e2e:import     → seulement import.spec.ts
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "fr-FR",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.CI
    ? {
        command: "npm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: false,
        timeout: 60_000,
      }
    : undefined,
});
