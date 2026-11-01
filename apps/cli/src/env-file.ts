import { generateKeyPairSync, randomBytes } from "node:crypto";

/** The `KEY=value` lines of an env file; comments and blank lines are skipped, a value is whatever follows the first `=`. */
export function parseEnv(text: string) {
  const values: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (match) values[match[1]!] = match[2]!;
  }
  return values;
}

/** Sets values in an env file's text: a key that is there keeps its place, a new one goes at the end. Comments stay. */
export function setEnv(text: string, values: Record<string, string>) {
  const lines = text.split("\n");
  for (const [key, value] of Object.entries(values)) {
    const at = lines.findIndex((line) => line.startsWith(`${key}=`));
    if (at >= 0) lines[at] = `${key}=${value}`;
    else {
      // New keys go before the trailing newline, not after it.
      if (lines.at(-1) === "") lines.pop();
      lines.push(`${key}=${value}`, "");
    }
  }
  return lines.join("\n");
}

/** The secrets of a new install, each in the form the server reads it. */
export function newSecrets() {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return {
    BETTER_AUTH_SECRET: randomBytes(32).toString("base64"),
    PROVIDER_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    POSTGRES_PASSWORD: randomBytes(24).toString("hex"),
    AVEN_LOCAL_RUNNER_TOKEN: `avrt_${randomBytes(24).toString("hex")}`,
    // One line with a literal `\n` for each line break, which an env file can hold.
    WORKLOAD_IDENTITY_PRIVATE_KEY: (privateKey.export({ type: "pkcs8", format: "pem" }) as string)
      .trim()
      .replaceAll("\n", "\\n"),
  };
}

/**
 * An existing `.env` with what a newer template has added: a key it lacks gets the template's value,
 * or a new secret when it is one the installer makes. What is there is never changed.
 */
export function addMissingKeys(existing: string, template: string) {
  const have = parseEnv(existing);
  const secrets: Record<string, string> = newSecrets();
  const missing: Record<string, string> = {};
  for (const [key, value] of Object.entries(parseEnv(template)))
    if (!(key in have)) missing[key] = secrets[key] ?? value;
  return setEnv(existing, missing);
}

export type ServerEnvOptions = {
  /** Where people open Aven, such as http://localhost:2836. No path. */
  origin: string;
  /** The port the web entry point is published on. */
  port: number;
  /** The release the images are pulled at. */
  version: string;
  /** The person who becomes the platform owner (and can close sign-ups), if known. */
  ownerEmail?: string;
  /** A domain to serve over HTTPS, for which Caddy gets a certificate. */
  domain?: string;
  /** The HTTPS port; the standard one for a domain. */
  httpsPort?: number;
  /** The API's port on this machine. */
  apiPort?: number;
};

/** A new install's `.env`: the template with the secrets made and the address filled in. */
export function newServerEnv(template: string, options: ServerEnvOptions) {
  const values: Record<string, string> = {
    AVEN_VERSION: options.version,
    AVEN_PORT: String(options.port),
    BETTER_AUTH_URL: options.origin,
    TRUSTED_ORIGINS: options.origin,
    ...newSecrets(),
  };
  if (options.ownerEmail) values.PLATFORM_OWNER_EMAILS = options.ownerEmail;
  if (options.apiPort) values.AVEN_API_PORT = String(options.apiPort);
  if (options.domain) {
    // Caddy answers to the domain, and needs the world to reach it on both standard ports.
    values.AVEN_SITE_ADDRESS = options.domain;
    values.AVEN_HTTPS_PORT = String(options.httpsPort ?? 443);
    values.AVEN_HTTPS_BIND = "0.0.0.0";
  } else if (options.httpsPort) {
    // Not served over HTTPS, so this port is published on this machine only.
    values.AVEN_HTTPS_PORT = String(options.httpsPort);
  }
  return setEnv(template, values);
}
