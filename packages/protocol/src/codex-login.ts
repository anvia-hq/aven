export const CODEX_LOGIN_MISSING =
  "Set a ChatGPT login in Settings before this thread can run on Codex";

export const CODEX_LOGIN_REJECTED = "The ChatGPT login was rejected. Save it again in Settings.";

export const CODEX_TURNS_USED = "The run used all of its turns";

export const CODEX_BUDGET_USED = "The run used all of its budget";

export const CODEX_NOTHING_TO_COMPACT = "There is nothing to compact yet.";

export const CODEX_INTERRUPTED =
  "Continue the work that was interrupted. The workspace is as the interrupted call left it. An in-flight tool call was not replayed: check the files, git status and running processes before repeating it, and do not assume it succeeded.";

export const CODEX_MODELS = [
  { id: "gpt-5.4", label: "GPT-5.4" },
  { id: "gpt-5.1-codex-max", label: "Codex Max" },
  { id: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
] as const;

const TOKEN = /^[A-Za-z0-9._~+/=-]{20,}$/;

export function codexModelId(modelId: string | undefined): string | undefined {
  return CODEX_MODELS.some((model) => model.id === modelId) ? modelId : undefined;
}

export function codexAccessToken(login: string): string | undefined {
  const text = login.trim();

  if (!text || text.length > 100_000) return undefined;

  if (!text.startsWith("{")) return TOKEN.test(text) && text.length >= 20 ? text : undefined;

  try {
    const parsed: unknown = JSON.parse(text);
    const token = accessToken(parsed);

    return token && TOKEN.test(token) && token.length >= 20 ? token : undefined;
  } catch {
    return undefined;
  }
}

export function codexSecretValues(login: string): string[] {
  const token = codexAccessToken(login);
  const secrets = token ? [token] : [];

  if (!login.trim().startsWith("{")) return secrets;

  try {
    const parsed: unknown = JSON.parse(login);
    const tokens = record(record(parsed)?.tokens);

    for (const key of ["access_token", "refresh_token", "id_token"]) {
      const value = tokens?.[key];

      if (typeof value === "string" && value.length >= 8) secrets.push(value);
    }
  } catch {
    return secrets;
  }

  return [...new Set(secrets)];
}

function accessToken(value: unknown): string | undefined {
  const tokens = record(record(value)?.tokens);
  const token = tokens?.access_token;

  return typeof token === "string" ? token : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}
