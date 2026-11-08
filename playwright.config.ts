import { generateKeyPairSync } from "node:crypto";

import { defineConfig } from "@playwright/test";

import { BOT_RUNNER_HEALTH_PORT, BOT_RUNNER_ID } from "./e2e/bot-runner-config";

const API_PORT = 8100;
const WEB_PORT = 5174;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const API_URL = `http://localhost:${API_PORT}`;
const GITHUB_PORT = 8101;
const GITHUB_URL = `http://localhost:${GITHUB_PORT}`;
const MODEL_PORT = 8102;
const MODEL_URL = `http://localhost:${MODEL_PORT}`;
const GITHUB_APP_PRIVATE_KEY = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();
const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://localhost:5432/aven_e2e";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: WEB_URL,
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium", channel: process.env.E2E_CHANNEL } },
  ],
  webServer: [
    {
      command: "bun e2e/setup-db.ts && bun apps/control-plane/src/index.ts",
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      env: {
        PORT: String(API_PORT),
        DATABASE_URL: E2E_DATABASE_URL,
        BETTER_AUTH_SECRET: "kQ8vZ3mR7xT1pL9wY4nB6cD2fH5jS0aG",
        BETTER_AUTH_URL: WEB_URL,
        TRUSTED_ORIGINS: WEB_URL,
        AGENT_PROVIDER: "anthropic",
        ANTHROPIC_API_KEY: "",
        PROVIDER_ENCRYPTION_KEY: "ZTJlLW9ubHktZW5jcnlwdGlvbi1rZXktMzJieXRlcyE=",
        MODEL_CATALOG_URL: "",
        AVEN_LOCAL_RUNNER: "off",
        AVEN_VERSION: "9.9.9",
        AVEN_RELEASES_URL: "http://127.0.0.1:9/releases",
        AVEN_BOT_RUNNER: BOT_RUNNER_ID,
        PROVIDER_ALLOWED_HOSTS: "localhost,127.0.0.1",
        GITHUB_APP_ID: "1",
        GITHUB_APP_SLUG: "aven-e2e",
        GITHUB_APP_CLIENT_ID: "Iv1.e2e",
        GITHUB_APP_CLIENT_SECRET: "e2e-secret",
        GITHUB_APP_PRIVATE_KEY,
        GITHUB_API_URL: GITHUB_URL,
        GITHUB_WEB_URL: GITHUB_URL,
      },
    },
    {
      command: "bun e2e/fake-github.ts",
      url: `${GITHUB_URL}/health`,
      reuseExistingServer: false,
      env: { FAKE_GITHUB_PORT: String(GITHUB_PORT) },
    },
    {
      command: "bun e2e/bot-runner.ts",
      url: `http://localhost:${BOT_RUNNER_HEALTH_PORT}/health`,
      reuseExistingServer: false,
      env: { AVEN_URL: API_URL },
    },
    {
      command: "bun e2e/fake-model.ts",
      url: `${MODEL_URL}/health`,
      reuseExistingServer: false,
      env: { FAKE_MODEL_PORT: String(MODEL_PORT) },
    },
    {
      command: "bunx --cwd apps/platform vite build && bun run --cwd apps/platform preview",
      url: WEB_URL,
      reuseExistingServer: false,
      env: { WEB_PORT: String(WEB_PORT), API_URL },
    },
  ],
});
