import { codexAuthSecrets, parseCodexAuth } from "@aven/protocol/codex-auth";
import type { HostedRunContext, RunInput } from "@aven/agent-backend/types";
import type { RunEnvVar, RunSecrets } from "@aven/protocol/types";

import { renewCodexAuth } from "./codex-auth-renewal";
import { collectRunSecretVariables, secretRedactor } from "../security/secret-redaction";

type HostedKind = "claude" | "codex";

type RenewCaller = {
  call(method: "codex.auth", params: { previous: string; token: string }): Promise<unknown>;
};

export function createHostedRunInput(
  kind: HostedKind,
  input: Omit<HostedRunContext, "redact" | "renewed" | "env"> & {
    env?: readonly RunEnvVar[];
    secrets?: RunSecrets;
    caller?: RenewCaller;
  },
): RunInput {
  const { env = [], secrets, caller, ...rest } = input;
  const variables = collectRunSecretVariables({
    ...secrets,
    env: secrets?.env ?? [...env],
    claudeToken: kind === "claude" ? (rest.token ?? secrets?.claudeToken) : secrets?.claudeToken,
    codexToken: kind === "codex" ? (rest.token ?? secrets?.codexToken) : secrets?.codexToken,
  });

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
