import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineConfig } from "@playwright/test";

import { BOT_RUNNER_HEALTH_PORT, BOT_RUNNER_ID } from "./e2e/bot-runner-config";

const portFromEnv = (value: string | undefined, fallback: number) => {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : fallback;
};

const API_PORT = portFromEnv(process.env.E2E_API_PORT, 8100);
const WEB_PORT = portFromEnv(process.env.E2E_WEB_PORT, 5174);
const WEB_URL = `http://localhost:${WEB_PORT}`;
const API_URL = `http://localhost:${API_PORT}`;
const GITHUB_PORT = portFromEnv(process.env.E2E_GITHUB_PORT, 8101);
const GITHUB_URL = `http://localhost:${GITHUB_PORT}`;
const MODEL_PORT = portFromEnv(process.env.E2E_MODEL_PORT, 8102);
const MODEL_URL = `http://localhost:${MODEL_PORT}`;
const BOT_RUNNER_PORT = portFromEnv(process.env.E2E_BOT_RUNNER_PORT, BOT_RUNNER_HEALTH_PORT);
const DATABASE_NAME = `aven_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}_e2e`;
const DATABASE_BASE_URL = (
  process.env.E2E_DATABASE_BASE_URL ?? "postgres://localhost:5432"
).replace(/\/$/, "");
const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? `${DATABASE_BASE_URL}/${DATABASE_NAME}`;
const RUNTIME_HOME =
  process.env.E2E_RUNTIME_HOME ?? mkdtempSync(join(tmpdir(), "aven-e2e-runtime-"));
const GITHUB_APP_PRIVATE_KEY = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();
process.env.E2E_PLATFORM_OWNERS ??= [0, 1, 2]
  .map((index) => `platform-owner-${index}-${Date.now()}@aven.test`)
  .join(",");
process.env.E2E_DATABASE_URL ??= E2E_DATABASE_URL;
process.env.E2E_API_URL ??= API_URL;
process.env.AVEN_RUNTIME_HOME = RUNTIME_HOME;

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
        AVEN_RUNTIME_HOME: RUNTIME_HOME,
        BETTER_AUTH_SECRET: "kQ8vZ3mR7xT1pL9wY4nB6cD2fH5jS0aG",
        BETTER_AUTH_URL: WEB_URL,
        TRUSTED_ORIGINS: WEB_URL,
        AGENT_PROVIDER: "anthropic",
        ANTHROPIC_API_KEY: "",
        PROVIDER_ENCRYPTION_KEY: "ZTJlLW9ubHktZW5jcnlwdGlvbi1rZXktMzJieXRlcyE=",
        MODEL_CATALOG_URL: "",
        PLATFORM_OWNER_EMAILS: process.env.E2E_PLATFORM_OWNERS,
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
      env: { FAKE_GITHUB_PORT: String(GITHUB_PORT), FAKE_GITHUB_APP_URL: WEB_URL },
    },
    {
      command: "bun e2e/bot-runner.ts",
      url: `http://localhost:${BOT_RUNNER_PORT}/health`,
      reuseExistingServer: false,
      env: {
        AVEN_URL: API_URL,
        AVEN_RUNTIME_HOME: RUNTIME_HOME,
        E2E_BOT_RUNNER_PORT: String(BOT_RUNNER_PORT),
      },
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
