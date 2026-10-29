import { defineConfig } from "@playwright/test";

// Separate ports and database so e2e never touches the dev servers or dev data.
const API_PORT = 8100;
const WEB_PORT = 5174;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const API_URL = `http://localhost:${API_PORT}`;
const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://localhost:5432/aven_e2e";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      // Recreates the e2e database, applies migrations, then starts the backend.
      command: "bun e2e/setup-db.ts && bun apps/control-plane/src/index.ts",
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      env: {
        PORT: String(API_PORT),
        DATABASE_URL: E2E_DATABASE_URL,
        BETTER_AUTH_SECRET: "kQ8vZ3mR7xT1pL9wY4nB6cD2fH5jS0aG",
        BETTER_AUTH_URL: WEB_URL,
        TRUSTED_ORIGINS: WEB_URL,
        // Never reach a real provider from e2e: starting an agent fails fast and deterministically.
        AGENT_PROVIDER: "anthropic",
        ANTHROPIC_API_KEY: "",
        PROVIDER_ENCRYPTION_KEY: "ZTJlLW9ubHktZW5jcnlwdGlvbi1rZXktMzJieXRlcyE=",
        MODEL_CATALOG_URL: "",
      },
    },
    {
      command: "bun run --cwd apps/platform dev",
      url: WEB_URL,
      reuseExistingServer: false,
      env: { WEB_PORT: String(WEB_PORT), API_URL },
    },
  ],
});
