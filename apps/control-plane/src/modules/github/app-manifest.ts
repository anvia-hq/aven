import { createHmac, timingSafeEqual } from "node:crypto";

import type { GithubConfig } from "./client";

/** Where GitHub's API and web side are: github.com unless the environment says another (Enterprise Server, a test double). */
export const githubUrlsFromEnv = (env: Record<string, string | undefined> = process.env) => ({
  apiUrl: env.GITHUB_API_URL ?? "https://api.github.com",
  webUrl: env.GITHUB_WEB_URL ?? "https://github.com",
});

export type GithubUrls = ReturnType<typeof githubUrlsFromEnv>;

/**
 * The app GitHub is asked to create (decision 0074): the permissions the agent needs to clone, push
 * and open pull requests as the person and to read CI (0041, 0044), no webhook, and the user
 * authorization during installation that 0013 relies on. `origin` is where people open Aven.
 * A private app (the default) can be installed only by the account or organization that owns it;
 * a public one by any, which a team with several organizations needs.
 */
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

/** Where the manifest is posted: the person's own settings, or an organization's. */
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

/**
 * A `state` for the trip to GitHub and back, tied to the person who starts it and, for an app a
 * workspace makes for itself (decision 0123), to that workspace.
 */
export function createSetupState(userId: string, now = Date.now(), organizationId?: string) {
  const claims: unknown[] = [userId, now];
  if (organizationId !== undefined) claims.push(organizationId);
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/**
 * What a `state` made for this person says, less than an hour ago: the workspace the app is for,
 * or null for the platform's. Undefined when it is not theirs, not ours, or too old.
 */
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

/** Trades the code GitHub sent back for the credentials of the app it created. The code works once. */
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
