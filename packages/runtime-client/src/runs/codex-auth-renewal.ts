import { errorMessage } from "@aven/agents/values";

type Caller = {
  call(method: "codex.auth", params: { previous: string; token: string }): Promise<unknown>;
};

export function renewCodexAuth(context: Caller, previous: string, token: string) {
  context.call("codex.auth", { previous, token }).catch((error: unknown) => {
    console.warn("Could not save the refreshed Codex sign-in:", errorMessage(error));
  });
}
