export function emailLoginOf(env: Record<string, string | undefined>, githubEnabled: boolean) {
  if (env.AVEN_EMAIL_LOGIN !== "off") return true;

  if (!githubEnabled) {
    throw new Error(
      "AVEN_EMAIL_LOGIN=off leaves nobody able to sign in without GitHub sign-in: set GITHUB_LOGIN_CLIENT_ID and GITHUB_LOGIN_CLIENT_SECRET, or leave email sign-in on",
    );
  }

  return false;
}
