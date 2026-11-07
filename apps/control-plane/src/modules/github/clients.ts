import { NotFoundError } from "../../errors";
import { loadAppById, loadOrganizationApp } from "./app-store";
import { github as platformClient, GithubClient } from "./client";
import type { GithubClients, GithubConfig } from "./types";

export const PLATFORM_APP = "platform";

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
