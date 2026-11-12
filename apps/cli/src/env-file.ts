import { generateKeyPairSync, randomBytes } from "node:crypto";
import type { ServerEnvOptions } from "./types";

export function parseEnv(text: string) {
  const values: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);

    if (match) values[match[1]!] = match[2]!;
  }
  return values;
}

export function setEnv(text: string, values: Record<string, string>) {
  const lines = text.split("\n");
  for (const [key, value] of Object.entries(values)) {
    const at = lines.findIndex((line) => line.startsWith(`${key}=`));

    if (at >= 0) lines[at] = `${key}=${value}`;
    else {
      if (lines.at(-1) === "") lines.pop();

      lines.push(`${key}=${value}`, "");
    }
  }
  return lines.join("\n");
}

export function newSecrets() {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return {
    BETTER_AUTH_SECRET: randomBytes(32).toString("base64"),
    PROVIDER_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    POSTGRES_PASSWORD: randomBytes(24).toString("hex"),
    AVEN_LOCAL_RUNNER_TOKEN: `avrt_${randomBytes(24).toString("hex")}`,
    WORKLOAD_IDENTITY_PRIVATE_KEY: (privateKey.export({ type: "pkcs8", format: "pem" }) as string)
      .trim()
      .replaceAll("\n", "\\n"),
  };
}

type AddedKeyDefault = { from: "install"; value: string } | { from: "template" };

const ADDED_KEY_POLICY: Record<string, AddedKeyDefault> = {
  AVEN_BIND: { from: "install", value: "" },
  AVEN_LOCAL_RUNNER: { from: "template" },
};

export function addMissingKeys(existing: string, template: string) {
  const have = parseEnv(existing);
  const secrets: Record<string, string> = newSecrets();
  const missing: Record<string, string> = {};
  for (const [key, templateValue] of Object.entries(parseEnv(template))) {
    if (key in have) continue;

    const policy = ADDED_KEY_POLICY[key];

    if (key in secrets) missing[key] = secrets[key]!;
    else if (policy?.from === "template") missing[key] = templateValue;
    else if (policy?.from === "install") missing[key] = policy.value;
  }
  return setEnv(existing, missing);
}

export function newServerEnv(template: string, options: ServerEnvOptions) {
  const values: Record<string, string> = {
    AVEN_VERSION: options.version,
    AVEN_PORT: String(options.port),
    BETTER_AUTH_URL: options.origin,
    TRUSTED_ORIGINS: options.origin,
    ...newSecrets(),
  };

  if (options.bind !== undefined) values.AVEN_BIND = options.bind;

  if (options.registration !== undefined) values.AVEN_REGISTRATION = options.registration;

  if (options.ownerEmail) values.PLATFORM_OWNER_EMAILS = options.ownerEmail;

  if (options.apiPort) values.AVEN_API_PORT = String(options.apiPort);

  if (options.domain) {
    values.AVEN_SITE_ADDRESS = options.domain;
    values.AVEN_HTTPS_PORT = String(options.httpsPort ?? 443);
    values.AVEN_HTTPS_BIND = "0.0.0.0";
  } else if (options.httpsPort) {
    values.AVEN_HTTPS_PORT = String(options.httpsPort);
  }

  return setEnv(template, values);
}
