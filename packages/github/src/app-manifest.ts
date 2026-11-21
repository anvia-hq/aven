import type { GithubConfig, GithubFetch, GithubUrls } from "./types";

export const githubUrlsFromEnv = (
  env: Record<string, string | undefined> = process.env,
): GithubUrls => ({
  apiUrl: env.GITHUB_API_URL ?? "https://api.github.com",
  webUrl: env.GITHUB_WEB_URL ?? "https://github.com",
});

export function appManifest(origin: string, name: string, isPublic = false) {
  const base = origin.replace(/\/$/, "");
  return {
    name,
    url: base,
    redirect_url: `${base}/api/github/app/callback`,
    callback_urls: [`${base}/api/github/callback`],
    request_oauth_on_install: true,
    public: isPublic,
    default_permissions: {
      administration: "write",
      contents: "write",
      pull_requests: "write",
      issues: "read",
      actions: "write",
      workflows: "write",
      checks: "read",
      statuses: "read",
      metadata: "read",
    },
    default_events: [] as string[],
  };
}

export function newAppUrl(urls: GithubUrls, state: string, organization?: string) {
  const path = organization
    ? `organizations/${encodeURIComponent(organization)}/settings/apps/new`
    : "settings/apps/new";
  return `${urls.webUrl}/${path}?state=${encodeURIComponent(state)}`;
}

type Conversion = {
  id: number;
  slug: string;
  client_id: string;
  client_secret: string;
  pem: string;
};

export async function convertManifest(
  code: string,
  urls: GithubUrls,
  fetchImpl: GithubFetch = fetch,
): Promise<GithubConfig> {
  const response = await fetchImpl(
    `${urls.apiUrl}/app-manifests/${encodeURIComponent(code)}/conversions`,
    {
      method: "POST",
      headers: { accept: "application/vnd.github+json", "user-agent": "aven" },
    },
  );

  if (!response.ok) throw new Error(`GitHub answered ${response.status} for the app's code`);

  const app = (await response.json()) as Conversion;

  if (!app.id || !app.slug || !app.client_id || !app.client_secret || !app.pem)
    throw new Error("GitHub's answer for the app's code is missing its credentials");

  return {
    appId: String(app.id),
    privateKey: app.pem,
    slug: app.slug,
    clientId: app.client_id,
    clientSecret: app.client_secret,
    ...urls,
  };
}
