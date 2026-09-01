import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Populates process.env from .env so the database-backed tests can reach
    // Postgres. Pure tests are unaffected.
    setupFiles: ["tests/setup/loadEnv.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws on import outside a React Server Component, which
      // would take down any test that touches a server module. Vitest already
      // *is* the server, so stub it out rather than weaken the app's guard.
      "server-only": fileURLToPath(new URL("./tests/setup/serverOnlyStub.ts", import.meta.url)),
    },
  },
});
