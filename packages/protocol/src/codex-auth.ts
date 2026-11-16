export type CodexAuthFile = {
  auth_mode?: string;
  OPENAI_API_KEY?: string | null;
  tokens: {
    id_token?: unknown;
    access_token: string;
    refresh_token: string;
    account_id?: string | null;
  };
  last_refresh?: string;
};

export function parseCodexAuth(text: string): CodexAuthFile | undefined {
  const trimmed = text.trim();

  if (!trimmed.startsWith("{")) return undefined;

  try {
    const value = JSON.parse(trimmed) as Partial<CodexAuthFile> | null;
    const tokens = value?.tokens;

    if (
      !tokens ||
      typeof tokens.access_token !== "string" ||
      typeof tokens.refresh_token !== "string" ||
      tokens.access_token.length === 0 ||
      tokens.refresh_token.length === 0
    ) {
      return undefined;
    }

    return value as CodexAuthFile;
  } catch {
    return undefined;
  }
}

export function codexAuthSecrets(auth: CodexAuthFile): string[] {
  const { id_token: idToken, access_token, refresh_token } = auth.tokens;
  const secrets = [access_token, refresh_token];

  if (typeof idToken === "string") secrets.push(idToken);

  if (auth.OPENAI_API_KEY) secrets.push(auth.OPENAI_API_KEY);

  return secrets;
}
