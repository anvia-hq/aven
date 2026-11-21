import { signHmacJson, verifyHmacJson } from "@aven/server-kit/tokens";

const STATE_TTL_MS = 60 * 60_000;

function stateSecret() {
  const secret = process.env.BETTER_AUTH_SECRET;

  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");

  return secret;
}

export function createSetupState(userId: string, now = Date.now()) {
  return signHmacJson(stateSecret(), [userId, now], "github-app-setup");
}

export function readSetupState(state: string, userId: string, now = Date.now()): boolean {
  const parsed = verifyHmacJson(stateSecret(), state, "github-app-setup");

  if (!Array.isArray(parsed)) return false;

  const [user, issuedAt] = parsed as unknown[];
  const fresh =
    typeof issuedAt === "number" && now - issuedAt >= 0 && now - issuedAt < STATE_TTL_MS;
  return user === userId && fresh;
}
