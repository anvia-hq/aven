export const RUNTIME_NAME_MAX = 100;

export const RUNNER_TOKEN_PREFIX = "avrt_";

export const RUNNER_TOKEN_MIN_LENGTH = 32;

export function isRunnerTokenFormat(token: string) {
  return token.startsWith(RUNNER_TOKEN_PREFIX) && token.length >= RUNNER_TOKEN_MIN_LENGTH;
}

export const SANDBOX_PROVIDERS = ["boat", "spaces", "lizard", "sprites"] as const;
