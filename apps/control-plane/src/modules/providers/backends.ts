import { featureChoice } from "@aven/server-kit/features";

import type { AgentBackendKind, Provider } from "@aven/protocol/types";

export const CLAUDE_BACKEND_OFF = "The Claude agent is turned off on this server";

export const CODEX_BACKEND_OFF = "The Codex agent is turned off on this server";

export const claudeBackendSetting = (configured: string | undefined) =>
  featureChoice("AVEN_CLAUDE_BACKEND", configured, ["on", "off"], "on") === "on";

export const claudeBackendEnabled = () => claudeBackendSetting(process.env.AVEN_CLAUDE_BACKEND);

export const codexBackendSetting = (configured: string | undefined) =>
  featureChoice("AVEN_CODEX_BACKEND", configured, ["on", "off"], "on") === "on";

export const codexBackendEnabled = () => codexBackendSetting(process.env.AVEN_CODEX_BACKEND);

type HostedBackend = {
  backend: AgentBackendKind;
  kind: Provider;
  off: string;
  offered: () => boolean;
};

export const HOSTED_BACKENDS: readonly HostedBackend[] = [
  {
    backend: "claude",
    kind: "claude-subscription",
    off: CLAUDE_BACKEND_OFF,
    offered: claudeBackendEnabled,
  },
  {
    backend: "codex",
    kind: "codex-subscription",
    off: CODEX_BACKEND_OFF,
    offered: codexBackendEnabled,
  },
];

export const hostedBackend = (backend: AgentBackendKind) =>
  HOSTED_BACKENDS.find((candidate) => candidate.backend === backend);

export const hostedKindOf = (backend: AgentBackendKind) => hostedBackend(backend)?.kind;
