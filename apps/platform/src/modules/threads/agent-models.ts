import type { ProviderKind } from "@/modules/providers/types";

import { CLAUDE_GROUP, CLAUDE_MODELS } from "./claude-models";
import { CODEX_CHOICES, CODEX_GROUP } from "./codex-models";
import type { AgentChoice } from "./types";

type AgentGroup = {
  backend: AgentChoice["backend"];
  heading: string;
  name: string;
  logo: ProviderKind;
  models: readonly { id: string; label: string }[];
};

export const AGENT_GROUPS: readonly AgentGroup[] = [
  {
    backend: "claude",
    heading: CLAUDE_GROUP,
    name: "Claude",
    logo: "anthropic",
    models: CLAUDE_MODELS,
  },
  { backend: "codex", heading: CODEX_GROUP, name: "Codex", logo: "openai", models: CODEX_CHOICES },
];

export function agentGroup(backend: AgentChoice["backend"]) {
  return AGENT_GROUPS.find((group) => group.backend === backend);
}

export function agentLabel(choice: AgentChoice) {
  const group = agentGroup(choice.backend);
  const model = group?.models.find((item) => item.id === (choice.modelId ?? "default"));

  return `${group?.name} ${model?.label ?? choice.modelId}`;
}
