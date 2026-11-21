import { VERSION_RE, isBehind } from "@aven/protocol/release";

export const serverBuild = (env: string | undefined = process.env.AVEN_VERSION) =>
  env !== undefined && VERSION_RE.test(env) ? env : undefined;

export { isBehind };
