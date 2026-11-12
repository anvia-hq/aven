import type { RepositoryAddress } from "./types";

const PART = /^[\w.-]+$/;
const SHORT = /^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/;
const SSH = /^git@([\w.-]+):([\w.-]+)\/([\w.-]+?)(?:\.git)?$/;

const clean = (parts: string[]) =>
  parts.every((part) => PART.test(part) && !/^\.+$/.test(part)) && parts.length === 3;

export function repositoryAddress(input: string): RepositoryAddress {
  const given = input.trim();
  const short = SHORT.exec(given);

  if (short) {
    const [, owner = "", name = ""] = short;

    if (clean(["github.com", owner, name])) {
      return { url: `https://github.com/${owner}/${name}.git`, host: "github.com", owner, name };
    }
  }

  const ssh = SSH.exec(given);

  if (ssh) {
    const [, host = "", owner = "", name = ""] = ssh;

    if (clean([host, owner, name])) return { url: given, host, owner, name };
  }

  if (URL.canParse(given)) {
    const url = new URL(given);
    const [owner = "", name = "", ...rest] = url.pathname
      .replace(/^\/+|\/+$/g, "")
      .replace(/\.git$/, "")
      .split("/");

    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      rest.length === 0 &&
      clean([url.hostname, owner, name])
    ) {
      return { url: `https://${url.host}/${owner}/${name}.git`, host: url.hostname, owner, name };
    }
  }

  throw new Error(
    "Give the repository as owner/name, an https address or git@host:owner/name (not a path on this machine)",
  );
}
