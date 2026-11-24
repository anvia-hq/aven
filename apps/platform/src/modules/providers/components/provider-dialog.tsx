import { useState } from "react";

import { Button } from "@aven/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aven/ui/dialog";
import { Form } from "@aven/ui/form";

import { useCodexSignIn } from "../hooks/use-codex-sign-in";
import { useProviderForm } from "../hooks/use-provider-form";
import { CodexSignIn } from "./codex-sign-in";
import { PROVIDER_LABELS } from "../types";
import type { CompatiblePreset, Provider, ProviderKind } from "../types";
import { ModelField } from "./model-field";
import { ProviderFields } from "./provider-fields";

type Props = {
  kind: ProviderKind;
  provider?: Provider;
  preset?: CompatiblePreset;
  label: string;
  prominent?: boolean;
};

export function ProviderDialog({ kind, provider, preset, label, prominent = false }: Props) {
  const [open, setOpen] = useState(false);
  const form = useProviderForm(kind, provider, () => setOpen(false), preset);
  const { compatible, azure, bedrock, vertex, subscription } = form;
  const codex = kind === "codex-subscription";
  const signIn = useCodexSignIn(provider, form.modelId, () => setOpen(false));
  const modelRequired = compatible || bedrock || azure || vertex;
  const editing = provider !== undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        form.loadOnOpen(next);

        if (!next) {
          signIn.cancel();
          form.reset();
        }
      }}
    >
      <DialogTrigger
        render={
          <Button variant={prominent ? "default" : "outline"} size={prominent ? "lg" : "xs"} />
        }
      >
        {label}
      </DialogTrigger>
      <DialogContent>
        <Form
          ref={form.formRef}
          onSubmit={form.submit}
          onChange={form.scheduleLoad}
          className="flex min-w-0 flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit" : label} {preset?.name ?? PROVIDER_LABELS[kind]}
            </DialogTitle>
            <DialogDescription>
              Keys are encrypted and never shown again. They follow you across workspaces.
            </DialogDescription>
          </DialogHeader>
          {codex ? (
            <>
              <CodexSignIn
                state={signIn.state}
                connected={editing}
                onStart={() => void signIn.start()}
                onCancel={signIn.cancel}
              />
              <ModelField
                label="Model"
                state={form.modelsState}
                value={form.modelId}
                onChange={form.selectModel}
                waiting="The models your ChatGPT plan runs"
              />
            </>
          ) : (
            <ProviderFields
              kind={kind}
              provider={provider}
              preset={preset}
              compatible={compatible}
              azure={azure}
              bedrock={bedrock}
              vertex={vertex}
              subscription={subscription}
              modelsState={form.modelsState}
              modelId={form.modelId}
              onSelectModel={form.selectModel}
              layout="stack"
            />
          )}
          <DialogFooter>
            {(editing || !codex) && (
              <Button
                type="submit"
                disabled={form.submitting || ((modelRequired || subscription) && !form.modelId)}
              >
                {editing ? "Save changes" : "Add provider"}
              </Button>
            )}
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
