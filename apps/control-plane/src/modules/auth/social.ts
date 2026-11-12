export function socialProvidersOf(
  env: Record<string, string | undefined>,
  baseURL: string,
): Record<string, { clientId: string; clientSecret: string; redirectURI: string }> {
  const clientId = env.GITHUB_LOGIN_CLIENT_ID;
  const clientSecret = env.GITHUB_LOGIN_CLIENT_SECRET;

  if (!clientId || !clientSecret) return {};

  return {
    github: { clientId, clientSecret, redirectURI: `${baseURL}/api/auth/callback/github` },
  };
}
