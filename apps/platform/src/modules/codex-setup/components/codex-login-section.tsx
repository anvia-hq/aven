import { Field } from "@base-ui/react/field";
import { useState } from "react";

import { Button } from "@/components/button";
import { Form } from "@/components/form";
import { SettingsSection } from "@/components/settings-section";
import { Textarea } from "@/components/textarea";

import { useCodexLogin } from "../hooks/use-codex-login";

export function CodexLoginSection() {
  const { login, loaded, failed, save, remove } = useCodexLogin();
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    const saved = await save(draft);
    setSaving(false);

    if (saved) setDraft("");
  }

  return (
    <SettingsSection
      title="ChatGPT login"
      description="Codex runs on your ChatGPT account. The login is stored encrypted, and Aven never shows it again."
    >
      {failed && <p className="text-sm text-destructive">{failed}</p>}
      {loaded && login?.configured && (
        <p className="pb-3 text-sm text-muted-foreground">
          Saved, ending in <span className="font-medium text-foreground">{login.hint}</span>.
        </p>
      )}
      {loaded && !login?.configured && (
        <p className="pb-3 text-sm text-muted-foreground">No ChatGPT login saved yet.</p>
      )}
      <Form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field.Root className="flex flex-col gap-1 text-sm">
          <Field.Label>Access token or auth.json</Field.Label>
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Paste a ChatGPT access token, or the contents of auth.json"
            aria-label="ChatGPT login"
            className="min-h-28 font-mono"
            autoComplete="off"
            spellCheck={false}
          />
        </Field.Root>
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={saving || draft.trim().length < 20}>
            Save
          </Button>
          {login?.configured && (
            <Button type="button" variant="outline" onClick={() => void remove()}>
              Remove
            </Button>
          )}
        </div>
      </Form>
    </SettingsSection>
  );
}
