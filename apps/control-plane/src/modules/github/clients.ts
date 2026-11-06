import { NotFoundError } from "../../errors";
import { loadAppById, loadOrganizationApp } from "./app-store";
import { github as platformClient, GithubClient, type GithubConfig } from "./client";

/** The key of the platform's app in `github_user_tokens.app_key`; a workspace's own is its `github_apps` id. */
export const PLATFORM_APP = "platform";

/** The app a workspace acts as, and the client that acts as it. */
export type AppClient = { key: string; client: GithubClient };

/**
 * The GitHub clients of the server, one for each app (decision 0123): the platform's, which the
 * environment or a platform owner set (decision 0074), and the apps workspaces made for
 * themselves. A workspace without one of its own uses the platform's.
 */
export type GithubClients = {
  /** The client of an app by its key (`PLATFORM_APP` or a `github_apps` id). */
  forKey(appKey: string): Promise<GithubClient>;
  /** The app a workspace acts as: its own if it has one, else the platform's. */
  forOrganization(organizationId: string): Promise<AppClient>;
  /** Drops what is kept of a workspace's app, after it was made or replaced. */
  forget(organizationId: string): void;
};

export class GithubAppNotFoundError extends NotFoundError {
  constructor() {
    super("GitHub App not found");
  }
}

export function createGithubClients(
  platform: GithubClient,
  load: {
    byOrganization: (
      organizationId: string,
    ) => Promise<{ id: string; config: GithubConfig } | null>;
    byId: (id: string) => Promise<{ id: string; config: GithubConfig } | null>;
  },
  make: (config: GithubConfig) => GithubClient = (config) => new GithubClient(config),
): GithubClients {
  // A workspace app's client keeps its installation tokens, so it is made once.
  const own = new Map<string, GithubClient>();
  const ofOrganization = new Map<string, string>();

  const kept = (app: { id: string; config: GithubConfig }) => {
    let client = own.get(app.id);
    if (!client) {
      client = make(app.config);
      own.set(app.id, client);
    }
    return client;
  };

  return {
    async forKey(appKey) {
      if (appKey === PLATFORM_APP) return platform;
      const client = own.get(appKey);
      if (client) return client;
      const app = await load.byId(appKey);
      if (!app) throw new GithubAppNotFoundError();
      return kept(app);
    },

    async forOrganization(organizationId) {
      const known = ofOrganization.get(organizationId);
      if (known) return { key: known, client: await this.forKey(known) };
      const app = await load.byOrganization(organizationId);
      if (!app) return { key: PLATFORM_APP, client: platform };
      ofOrganization.set(organizationId, app.id);
      return { key: app.id, client: kept(app) };
    },

    forget(organizationId) {
      const id = ofOrganization.get(organizationId);
      ofOrganization.delete(organizationId);
      if (id) own.delete(id);
    },
  };
}

export const githubClients = createGithubClients(platformClient, {
  byOrganization: loadOrganizationApp,
  byId: loadAppById,
});
