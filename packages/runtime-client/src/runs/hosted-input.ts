import { codexAuthSecrets, parseCodexAuth } from "@aven/protocol/codex-auth";
import type { HostedRunContext, RunInput } from "@aven/agent-backend/types";
import type { RunEnvVar } from "@aven/protocol/types";

import { renewCodexAuth } from "./codex-auth-renewal";
import { secretRedactor } from "../security/secret-redaction";

type HostedKind = "claude" | "codex";

type RenewCaller = {
  call(method: "codex.auth", params: { previous: string; token: string }): Promise<unknown>;
};

export function createHostedRunInput(
  kind: HostedKind,
  input: Omit<HostedRunContext, "redact" | "renewed" | "env"> & {
    env?: readonly RunEnvVar[];
    caller?: RenewCaller;
  },
): RunInput {
  const { env = [], caller, ...rest } = input;
  const variables = [...env];
  const auth = kind === "codex" && rest.token ? parseCodexAuth(rest.token) : undefined;

  if (auth) {
    codexAuthSecrets(auth).forEach((value, index) =>
      variables.push({ name: `CODEX_AUTH_${index}`, value, secret: true }),
    );
  } else if (rest.token) {
    variables.push({
      name: kind === "claude" ? "CLAUDE_CODE_OAUTH_TOKEN" : "CODEX_API_KEY",
      value: rest.token,
      secret: true,
    });
  }

  let redact = secretRedactor(variables);
  const hosted: HostedRunContext = {
    ...rest,
    env,
    redact: (text: string) => (redact ? redact(text) : text),
    renewed: caller
      ? (token: string, previous: string) => {
          const fresh = parseCodexAuth(token);

          if (fresh) {
            codexAuthSecrets(fresh).forEach((value, index) =>
              variables.push({ name: `CODEX_RENEWED_${index}`, value, secret: true }),
            );
            redact = secretRedactor(variables);
          }

          renewCodexAuth(caller, previous, token);
        }
      : undefined,
  };
  return kind === "claude" ? { claude: hosted } : { codex: hosted };
}
