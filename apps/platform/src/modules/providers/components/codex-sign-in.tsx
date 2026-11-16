import { Button } from "@aven/ui/button";

import type { CodexSignInState } from "../hooks/use-codex-sign-in";

type Props = {
  state: CodexSignInState;
  connected: boolean;
  onStart: () => void;
  onCancel: () => void;
};

export function CodexSignIn({ state, connected, onStart, onCancel }: Props) {
  const starting = state.status === "starting";
  const idleLabel = connected ? "Sign in again with ChatGPT" : "Sign in with ChatGPT";

  if (state.status === "waiting") {
    const { code } = state;

    return (
      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <ol className="flex list-decimal flex-col gap-1 pl-4 text-sm">
          <li>
            Open{" "}
            <a
              href={code.verificationUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium underline"
            >
              {code.verificationUrl}
            </a>{" "}
            and sign in to ChatGPT.
          </li>
          <li>Enter this one-time code (it expires in 15 minutes):</li>
        </ol>
        <div className="rounded-md bg-muted px-3 py-2 text-center font-mono text-xl tracking-widest">
          {code.userCode}
        </div>
        <p className="text-xs text-muted-foreground">
          Waiting for you to approve. Continue only if you started this sign-in here.
        </p>
        <Button type="button" variant="outline" size="xs" className="self-start" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    );
  }

  const label = starting ? "Getting a code…" : idleLabel;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Sign in with your ChatGPT account (Plus, Pro, Business or Enterprise) to use your Codex
        subscription. Aven keeps the sign-in encrypted and renews it when Codex refreshes it.
      </p>
      <Button type="button" className="self-start" disabled={starting} onClick={onStart}>
        {label}
      </Button>
      {state.status === "failed" && <p className="text-xs text-destructive">{state.error}</p>}
    </div>
  );
}
