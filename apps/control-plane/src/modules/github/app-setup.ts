import { ConflictError, ForbiddenError, UnprocessableError } from "@aven/server-kit/errors";
import { platformService } from "../platform/service";
import {
  appManifest,
  convertManifest,
  createSetupState,
  githubUrlsFromEnv,
  newAppUrl,
  readSetupState,
} from "./app-manifest";
import { saveGithubApp } from "./app-store";
import { github, type GithubClient } from "@aven/github/client";
import type { GithubUrls } from "./types";
import type { GithubConfig } from "@aven/github/types";

type Person = { id: string; email: string };

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
    async canSetUp(person: Person) {
      return !client.configured && (await isOwner(person));
    },

    async manifest(
      person: Person,
      options: { name?: string; organization?: string; public?: boolean },
    ) {
      await requireOwner(person);

      const base = origin();
      const name = options.name ?? `Aven (${new URL(base).hostname})`.slice(0, 34);
      return {
        postUrl: newAppUrl(urls, createSetupState(person.id), options.organization),
        manifest: appManifest(base, name, options.public ?? false),
      };
    },

    async complete(person: Person, input: { code: string; state: string }) {
      if (!readSetupState(input.state, person.id)) {
        throw new UnprocessableError("This setup link is not valid or has expired. Start again.");
      }

      await requireOwner(person);
      const config = await convert(input.code, urls);
      await save(config);
      client.configure(config);
    },
  };
}

export const githubAppSetup = createGithubAppSetup();
