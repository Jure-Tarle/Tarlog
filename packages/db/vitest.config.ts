import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
    // @ptl/db carries no unit tests yet (schema is validated at build time via
    // tsc + drizzle-kit). Running `vitest run` with no test files must not fail
    // the recursive `pnpm -r test`; it succeeds cleanly instead.
    passWithNoTests: true,
  },
});
