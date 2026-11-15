import { useState } from "react";

import { Button } from "@aven/ui/button";
import { Form } from "@aven/ui/form";
import { SettingsSection } from "@/components/settings-section";
import { TextField } from "@aven/ui/text-field";

import { useCodexSetup } from "../hooks/use-codex-setup";

const KEYS_URL = "https://platform.openai.com/api-keys";

function GetKey() {
  return (
    <SettingsSection
      title="Get a key"
      description="The Codex agent bills your OpenAI account. The runner also needs the Codex CLI, from the SDK's install or from CODEX_PATH."
    >
      <ol className="flex max-w-xl flex-col gap-5 text-sm">
        <li className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
            1
          </span>
          <p className="min-w-0 flex-1">
            Open{" "}
            <a href={KEYS_URL} className="underline" target="_blank" rel="noreferrer">
              platform.openai.com/api-keys
            </a>{" "}
            and create a key.
          </p>
        </li>
        <li className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
            2
          </span>
          <p className="min-w-0 flex-1">
            Copy the key. It starts with <code className="font-mono text-xs">sk-</code> and is shown
            only once.
          </p>
        </li>
        <li className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
            3
          </span>
          <p className="min-w-0 flex-1">Paste it below.</p>
        </li>
      </ol>
    </SettingsSection>
  );
}

export function CodexSetupSection() {
  const { setup, loaded, failed, save, remove } = useCodexSetup();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  if (failed) return <p className="py-6 text-sm text-muted-foreground">{failed}</p>;

  if (!loaded) return null;

  async function run(action: () => Promise<boolean>) {
    setBusy(true);
    const done = await action();
    setBusy(false);

    if (done) setToken("");
  }

  return (
    <>
      {!setup.configured && <GetKey />}
      <SettingsSection
        title="API key"
        description="Stored encrypted for you alone and never shared with a workspace. A Codex thread runs with the key of the person who started it."
      >
        <Form
          className="flex max-w-md flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => save(token));
          }}
        >
          <TextField
            label="Codex API key"
            type="password"
            autoComplete="off"
            value={token}
            placeholder={setup.configured ? `Saved, ending in ${setup.hint}` : "Paste an API key"}
            onChange={(event) => setToken(event.target.value)}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy || token.trim() === ""}>
              {setup.configured ? "Replace" : "Save"}
            </Button>
            {setup.configured && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void run(remove)}
              >
                Remove
              </Button>
            )}
          </div>
        </Form>
      </SettingsSection>
      {setup.configured && <GetKey />}
    </>
  );
}
