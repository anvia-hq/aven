import { ConflictError, ForbiddenError, UnprocessableError } from "../../errors";
import { isOwnerOrAdmin } from "../auth/members";
import { platformService } from "../platform/service";
import {
  appManifest,
  convertManifest,
  createSetupState,
  githubUrlsFromEnv,
  newAppUrl,
  readSetupState,
  type GithubUrls,
} from "./app-manifest";
import { saveGithubApp, saveOrganizationApp } from "./app-store";
import { github, type GithubClient, type GithubConfig } from "./client";
import { githubClients, PLATFORM_APP, type GithubClients } from "./clients";

type Person = { id: string; email: string };

export function createGithubAppSetup({
  client = github,
  urls = githubUrlsFromEnv(),
  origin = () => process.env.BETTER_AUTH_URL ?? "http://localhost:5173",
  save = saveGithubApp,
  saveOrganization = saveOrganizationApp,
  convert = convertManifest,
  isOwner = platformService.isOwner,
  isAdmin = isOwnerOrAdmin,
  clients = githubClients,
}: {
  client?: Pick<GithubClient, "configured" | "configure">;
  urls?: GithubUrls;
  origin?: () => string;
  save?: (config: GithubConfig) => Promise<void>;
  saveOrganization?: (
    organizationId: string,
    userId: string,
    config: GithubConfig,
  ) => Promise<string>;
  convert?: (code: string, urls: GithubUrls) => Promise<GithubConfig>;
  isOwner?: (person: Person) => Promise<boolean>;
  isAdmin?: (organizationId: string, userId: string) => Promise<boolean>;
  clients?: Pick<GithubClients, "forOrganization" | "forget">;
} = {}) {
  const requireOwner = async (person: Person) => {
    if (!(await isOwner(person))) throw new ForbiddenError("Platform owners only");
    if (client.configured) throw new ConflictError("GitHub is already set up");
  };

  const hasOwnApp = async (organizationId: string) =>
    (await clients.forOrganization(organizationId)).key !== PLATFORM_APP;
  const requireWorkspaceAdmin = async (person: Person, organizationId: string) => {
    if (!(await isAdmin(organizationId, person.id))) {
      throw new ForbiddenError("Only an owner or an admin can set up the workspace's GitHub App");
    }
    if (await hasOwnApp(organizationId)) {
      throw new ConflictError("This workspace already has its own GitHub App");
    }
  };

  return {
    async canSetUp(person: Person) {
      return !client.configured && (await isOwner(person));
    },

    async canSetUpWorkspace(person: Person, organizationId: string) {
      return (await isAdmin(organizationId, person.id)) && !(await hasOwnApp(organizationId));
    },

    async manifest(
      person: Person,
      options: { name?: string; organization?: string; public?: boolean },
      organizationId?: string,
    ) {
      if (organizationId === undefined) await requireOwner(person);
      else await requireWorkspaceAdmin(person, organizationId);
      const base = origin();
      const name = options.name ?? `Aven (${new URL(base).hostname})`.slice(0, 34);
      return {
        postUrl: newAppUrl(
          urls,
          createSetupState(person.id, Date.now(), organizationId),
          options.organization,
        ),
        manifest: appManifest(base, name, options.public ?? false),
      };
    },

    async complete(
      person: Person,
      input: { code: string; state: string },
      organizationId?: string,
    ) {
      const state = readSetupState(input.state, person.id);
      if (!state) {
        throw new UnprocessableError("This setup link is not valid or has expired. Start again.");
      }
      if (state.organizationId === null) {
        await requireOwner(person);
        const config = await convert(input.code, urls);
        await save(config);
        client.configure(config);
        return;
      }
      if (state.organizationId !== organizationId) {
        throw new UnprocessableError("This setup link is for another workspace. Start again.");
      }
      await requireWorkspaceAdmin(person, state.organizationId);
      const config = await convert(input.code, urls);
      await saveOrganization(state.organizationId, person.id, config);
      clients.forget(state.organizationId);
    },
  };
}

export const githubAppSetup = createGithubAppSetup();
