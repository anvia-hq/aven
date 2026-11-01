import { ConflictError, ForbiddenError, UnprocessableError } from "../../errors";
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
import { saveGithubApp } from "./app-store";
import { github, type GithubClient, type GithubConfig } from "./client";

type Person = { id: string; email: string };

/**
 * Creating the GitHub App from the platform (decision 0074): the manifest a platform owner posts to
 * GitHub, and what is done with the app GitHub sends the browser back for.
 */
export function createGithubAppSetup({
  client = github,
  urls = githubUrlsFromEnv(),
  origin = () => process.env.BETTER_AUTH_URL ?? "http://localhost:5173",
  save = saveGithubApp,
  convert = convertManifest,
  isOwner = platformService.isOwner,
}: {
  client?: Pick<GithubClient, "configured" | "configure">;
  urls?: GithubUrls;
  origin?: () => string;
  save?: (config: GithubConfig) => Promise<void>;
  convert?: (code: string, urls: GithubUrls) => Promise<GithubConfig>;
  isOwner?: (person: Person) => Promise<boolean>;
} = {}) {
  const requireOwner = async (person: Person) => {
    if (!(await isOwner(person))) throw new ForbiddenError("Platform owners only");
    if (client.configured) throw new ConflictError("GitHub is already set up");
  };

  return {
    /** Whether the person is offered the button: an owner, and no app yet. */
    async canSetUp(person: Person) {
      return !client.configured && (await isOwner(person));
    },

    /** What the browser posts to GitHub to have the app created. */
    async manifest(
      person: Person,
      options: { name?: string; organization?: string; public?: boolean },
    ) {
      await requireOwner(person);
      const base = origin();
      // GitHub wants a name nobody else has taken, so the default carries this server's host.
      const name = options.name ?? `Aven (${new URL(base).hostname})`.slice(0, 34);
      return {
        postUrl: newAppUrl(urls, createSetupState(person.id), options.organization),
        manifest: appManifest(base, name, options.public ?? false),
      };
    },

    /** GitHub made the app and sent the browser back with its code: keep the app and start using it. */
    async complete(person: Person, input: { code: string; state: string }) {
      await requireOwner(person);
      if (!readSetupState(input.state, person.id))
        throw new UnprocessableError("This setup link is not valid or has expired. Start again.");
      const config = await convert(input.code, urls);
      await save(config);
      client.configure(config);
    },
  };
}

export const githubAppSetup = createGithubAppSetup();
