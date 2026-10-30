import { Plus } from "@mynaui/icons-react";
import { useState } from "react";

import { Button } from "@/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/dialog";
import { Form } from "@/components/form";
import { LabeledSelect } from "@/components/labeled-select";
import { TextField } from "@/components/text-field";

import { useAddProviderForm } from "../hooks/use-add-provider-form";
import { PROVIDER_KINDS, PROVIDER_LABELS, type ProviderKind } from "../types";
import { ModelField } from "./model-field";

const kindOptions = PROVIDER_KINDS.map((kind) => ({ value: kind, label: PROVIDER_LABELS[kind] }));

function loadModelsLabel(loading: boolean, loaded: boolean) {
  if (loading) return "Loading…";
  return loaded ? "Reload" : "Load models";
}

export function AddProviderDialog() {
  const [open, setOpen] = useState(false);
  const form = useAddProviderForm(() => setOpen(false));
  const { compatible, kind } = form;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset();
      }}
    >
      <DialogTrigger render={<Button />}>
        <Plus /> Add provider
      </DialogTrigger>
      <DialogContent>
        <Form ref={form.formRef} onSubmit={form.submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Add provider</DialogTitle>
            <DialogDescription>
              Keys are encrypted and never shown again. They follow you across workspaces.
            </DialogDescription>
          </DialogHeader>
          <LabeledSelect
            label="Type"
            options={kindOptions}
            value={kind}
            onChange={(value) => form.changeKind(value as ProviderKind)}
          />
          <TextField label="Name" name="name" placeholder={PROVIDER_LABELS[kind]} />
          {compatible && (
            <TextField
              label="Base URL"
              name="baseUrl"
              type="url"
              required
              placeholder="http://localhost:11434/v1"
            />
          )}
          <TextField
            label={compatible ? "API key (optional)" : "API key"}
            name="apiKey"
            type="password"
            autoComplete="off"
            required={!compatible}
            placeholder={kind === "anthropic" ? "sk-ant-…" : "sk-…"}
          />
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <ModelField
                models={form.models}
                value={form.modelId}
                onChange={form.selectModel}
                required={compatible}
                placeholder={compatible ? "llama3.1" : "Provider default"}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={form.loadingModels}
              onClick={form.loadModels}
            >
              {loadModelsLabel(form.loadingModels, form.models !== null)}
            </Button>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={form.submitting}>
              Add provider
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
