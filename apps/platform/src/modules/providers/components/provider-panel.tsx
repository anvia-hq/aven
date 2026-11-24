import { IconChevronDown, IconRefresh, IconTrash } from "@tabler/icons-react";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { Button } from "@aven/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@aven/ui/collapsible";
import { Form } from "@aven/ui/form";

import { useProviderForm } from "../hooks/use-provider-form";
import { useProviders } from "../hooks/use-providers";
import { useRefetchModels } from "../hooks/use-refetch-models";
import type { CompatiblePreset, Provider, ProviderKind } from "../types";
import { ProviderFields } from "./provider-fields";

type FormBodyProps = {
  kind: ProviderKind;
  provider?: Provider;
  preset?: CompatiblePreset;
  open: boolean;
  onClose: () => void;
};

function ProviderPanelForm({ kind, provider, preset, open, onClose }: FormBodyProps) {
  const form = useProviderForm(kind, provider, onClose, preset);
  const { remove } = useProviders();
  const { refetch, fetching } = useRefetchModels();
  const { compatible, azure, bedrock, vertex, subscription, loadOnOpen, reset } = form;
  const modelRequired = compatible || bedrock || azure || vertex;
  const editing = provider !== undefined;

  useEffect(() => {
    if (open) loadOnOpen(true);
    else reset();
  }, [open]);

  return (
    <Form
      ref={form.formRef}
      onSubmit={form.submit}
      onChange={form.scheduleLoad}
      className="flex min-w-0 flex-col gap-4"
    >
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
        layout="grid"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {provider ? (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={fetching === provider.id}
              onClick={async () => {
                const listed = await refetch(provider);

                if (listed) form.applyModels(listed);
              }}
            >
              <IconRefresh className="size-3.5" />
              {fetching === provider.id ? "Fetching…" : "Refetch models"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Remove ${provider.name}`}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                onClose();
                void remove(provider);
              }}
            >
              <IconTrash className="size-3.5" />
              Remove
            </Button>
          </div>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={form.submitting || ((modelRequired || subscription) && !form.modelId)}
          >
            {editing ? "Save changes" : "Add provider"}
          </Button>
        </div>
      </div>
    </Form>
  );
}

type Props = {
  ariaLabel: string;
  kind: ProviderKind;
  provider?: Provider;
  preset?: CompatiblePreset;
  triggerLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leading: ReactNode;
  summary: ReactNode;
  actions?: (trigger: ReactNode) => ReactNode;
};

export function ProviderPanel({
  ariaLabel,
  kind,
  provider,
  preset,
  triggerLabel,
  open,
  onOpenChange,
  leading,
  summary,
  actions,
}: Props) {
  const trigger = (
    <CollapsibleTrigger
      render={
        <Button
          variant="ghost"
          size="xs"
          className="text-muted-foreground hover:bg-transparent hover:text-foreground group-hover/row:text-foreground after:absolute after:inset-0"
        />
      }
    >
      <span>{triggerLabel}</span>
      <IconChevronDown
        aria-hidden
        className={`size-3.5 transition-transform duration-150 ease-out motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
      />
    </CollapsibleTrigger>
  );

  return (
    <li aria-label={ariaLabel} className="min-w-0">
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <div
          className={`group/row relative flex items-center gap-3.5 px-4 py-3 transition-colors duration-150 ${open ? "bg-muted/35" : "hover:bg-muted/25"}`}
        >
          {leading}
          {summary}
          <div className="flex shrink-0 items-center gap-1">
            {actions ? actions(trigger) : trigger}
          </div>
        </div>
        <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 ease-out data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none">
          <div className="border-t border-border/60 bg-background/50 p-4">
            <ProviderPanelForm
              kind={kind}
              provider={provider}
              preset={preset}
              open={open}
              onClose={() => onOpenChange(false)}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}
