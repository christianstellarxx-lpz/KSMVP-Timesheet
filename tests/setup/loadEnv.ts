import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load `.env` into process.env for the test run.
 *
 * Vitest does not read `.env` on its own, and `src/lib/prisma.ts` constructs
 * its PrismaClient at module load, so the connection string has to be present
 * before any test file imports it. Existing environment variables always win,
 * so CI can override without editing the file.
 *
 * Resolved from the working directory (Vitest runs from the project root), not
 * `import.meta.url`: under happy-dom that is not a file: URL.
 */
const envPath = resolve(process.cwd(), ".env");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match || line.trimStart().startsWith("#")) continue;
    let value = match[2].trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}
