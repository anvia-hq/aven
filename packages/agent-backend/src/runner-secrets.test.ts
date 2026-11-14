import { expect, test } from "bun:test";

import { withoutRunnerSecrets } from "@aven/agent-backend/runner-secrets";

test("the runner's own credentials and the server's secrets stay out of what the agent runs with", () => {
  const kept = withoutRunnerSecrets({
    AVEN_RUNTIME_TOKEN: "avrt_x",
    AVEN_URL: "http://localhost:8000",
    AVEN_DIRS: "/code",
    DATABASE_URL: "postgres://x",
    BETTER_AUTH_SECRET: "s",
    GITHUB_APP_PRIVATE_KEY: "k",
    OPENAI_API_KEY: "sk",
    PATH: "/usr/bin",
    HOME: "/home/me",
    LANG: "en_US.UTF-8",
  });
  expect(kept).toEqual({ PATH: "/usr/bin", HOME: "/home/me", LANG: "en_US.UTF-8" });
});
