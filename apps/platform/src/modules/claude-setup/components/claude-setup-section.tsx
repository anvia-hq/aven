import { useState } from "react";

import { Button } from "@/components/button";
import { Form } from "@/components/form";
import { SettingsSection } from "@/components/settings-section";
import { TextField } from "@/components/text-field";

import { useClaudeSetup } from "../hooks/use-claude-setup";

export function ClaudeSetupSection() {
  const { setup, loaded, failed, save, remove } = useClaudeSetup();
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
    <SettingsSection
      title="Setup token"
      description="From claude setup-token. It is stored encrypted for you alone, and it is the only credential a Claude thread of yours can run with."
    >
      <Form
        className="flex max-w-md flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => save(token));
        }}
      >
        <TextField
          label="Claude setup token"
          type="password"
          autoComplete="off"
          value={token}
          placeholder={setup.configured ? `Saved, ending in ${setup.hint}` : "Paste a setup token"}
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
  );
}
