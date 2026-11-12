import { SettingsRow, SettingsSection } from "@/components/settings-section";
import { DECISION_KINDS } from "@/modules/decision-model/kinds";

import { useServerModels } from "../hooks/use-server-models";
import { SMALL_PROVIDERS } from "../small-providers";
import type { ServerModel } from "../types";
import { ServerModelForm } from "./server-model-form";

function summary(model: ServerModel | null, name: string) {
  if (!model) return { title: "Not set", description: `No ${name} is given to people by default.` };

  if (model.source === "env") {
    return {
      title: "Set in the server's environment",
      description: `Change it where the server is configured. It cannot be edited here.`,
    };
  }

  return {
    title: "Set",
    description: `Used by every workspace and person that has none of their own.`,
  };
}

export function ServerModelsSection() {
  const { models, failed, save, remove } = useServerModels();

  if (failed) return <p className="py-6 text-sm text-muted-foreground">{failed}</p>;

  if (!models) return null;

  const decision = summary(models.decision, "decision model");
  const small = summary(models.small, "small model");
  const decisionOwn = models.decision?.source === "platform" ? models.decision : null;
  const smallOwn = models.small?.source === "platform" ? models.small : null;

  return (
    <SettingsSection
      title="Server defaults"
      description="Models every workspace and person can use without bringing a key. Your keys, your bill: a workspace's or person's own choice always wins."
    >
      <SettingsRow title={`Decision model: ${decision.title}`} description={decision.description}>
        {models.decision && (
          <span className="text-xs text-muted-foreground">
            {DECISION_KINDS.find((each) => each.id === models.decision?.kind)?.label} ·{" "}
            {models.decision.modelId}
          </span>
        )}
      </SettingsRow>
      {models.decision?.source !== "env" && (
        <div className="py-4">
          <ServerModelForm
            key={`decision:${decisionOwn?.kind}:${decisionOwn?.modelId}:${decisionOwn?.keyHint}`}
            label="Decision model"
            options={DECISION_KINDS}
            current={decisionOwn}
            modelRequired={false}
            onSave={(draft) => save("decision", draft)}
            onRemove={() => remove("decision")}
          />
        </div>
      )}
      <SettingsRow title={`Small model: ${small.title}`} description={small.description}>
        {models.small && (
          <span className="text-xs text-muted-foreground">
            {SMALL_PROVIDERS.find((each) => each.id === models.small?.kind)?.label} ·{" "}
            {models.small.modelId}
          </span>
        )}
      </SettingsRow>
      {models.small?.source !== "env" && (
        <div className="pt-4">
          <ServerModelForm
            key={`small:${smallOwn?.kind}:${smallOwn?.modelId}:${smallOwn?.keyHint}`}
            label="Small model"
            options={SMALL_PROVIDERS}
            current={smallOwn}
            modelRequired
            onSave={(draft) => save("small", draft)}
            onRemove={() => remove("small")}
          />
        </div>
      )}
    </SettingsSection>
  );
}
