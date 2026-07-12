import { defineConfig } from "vitest/config";

/**
 * Vitest — Node-Umgebung für lib/*-Tests (Server-Modus). React-Component-Tests
 * fügt der jeweilige UI-/Modul-Autor bei Bedarf mit eigener Environment-Angabe
 * hinzu. better-sqlite3 (devDep) steht nur für Tests bereit.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next"],
  },
});
