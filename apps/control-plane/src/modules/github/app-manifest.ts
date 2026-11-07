import { createHmac, timingSafeEqual } from "node:crypto";

import type { GithubConfig } from "./client";

export const githubUrlsFromEnv = (env: Record<string, string | undefined> = process.env) => ({
  apiUrl: env.GITHUB_API_URL ?? "https://api.github.com",
  webUrl: env.GITHUB_WEB_URL ?? "https://github.com",
});

export type GithubUrls = ReturnType<typeof githubUrlsFromEnv>;

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
      contents: "write",
      pull_requests: "write",
      issues: "read",
      actions: "read",
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

const STATE_TTL_MS = 60 * 60_000;

function sign(payload: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  return createHmac("sha256", secret).update(`github-app-setup:${payload}`).digest("base64url");
}

export function createSetupState(userId: string, now = Date.now(), organizationId?: string) {
  const claims: unknown[] = [userId, now];
  if (organizationId !== undefined) claims.push(organizationId);
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSetupState(
  state: string,
  userId: string,
  now = Date.now(),
): { organizationId: string | null } | undefined {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return undefined;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return undefined;
  try {
    const [user, issuedAt, organizationId] = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    ) as unknown[];
    const fresh =
      typeof issuedAt === "number" && now - issuedAt >= 0 && now - issuedAt < STATE_TTL_MS;
    if (user !== userId || !fresh) return undefined;
    return { organizationId: typeof organizationId === "string" ? organizationId : null };
  } catch {
    return undefined;
  }
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
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response> = fetch,
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
