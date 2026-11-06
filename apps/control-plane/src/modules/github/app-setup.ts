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

/**
 * Creating the GitHub App (decisions 0074 and 0123): the manifest a platform owner posts to GitHub
 * for the platform's app, or an owner or admin of a workspace for the workspace's own, and what is
 * done with the app GitHub sends the browser back for.
 */
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

  // A workspace makes its own app once, and only an owner or an admin of it does (decision 0123).
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
    /** Whether the person is offered the button: an owner, and no app yet. */
    async canSetUp(person: Person) {
      return !client.configured && (await isOwner(person));
    },

    /** Whether the person is offered the workspace's own app: an owner or an admin of it, with none yet. */
    async canSetUpWorkspace(person: Person, organizationId: string) {
      return (await isAdmin(organizationId, person.id)) && !(await hasOwnApp(organizationId));
    },

    /**
     * What the browser posts to GitHub to have the app created: the platform's, or, with an
     * `organizationId`, the workspace's own.
     */
    async manifest(
      person: Person,
      options: { name?: string; organization?: string; public?: boolean },
      organizationId?: string,
    ) {
      if (organizationId === undefined) await requireOwner(person);
      else await requireWorkspaceAdmin(person, organizationId);
      const base = origin();
      // GitHub wants a name nobody else has taken, so the default carries this server's host.
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

    /**
     * GitHub made the app and sent the browser back with its code: keep the app and start using it.
     * `organizationId` is the workspace the person is in, which a workspace's app has to be for.
     */
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
