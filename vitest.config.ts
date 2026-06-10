/**
 * Configuration Vitest pour tests unitaires (logique métier pure).
 *
 * Lancement :
 *   npm test              → tous les tests (mode run)
 *   npm run test:watch    → mode watch
 *   npm run test:ui       → interface Vitest UI
 *   npm run test:coverage → avec couverture
 *
 * Les tests E2E (Playwright) restent gérés à part via npm run test:e2e.
 */

import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "happy-dom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["node_modules", "dist", "tests/e2e", "src/routeTree.gen.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/**/*.test.ts", "src/lib/**/*.functions.ts"],
    },
  },
});
