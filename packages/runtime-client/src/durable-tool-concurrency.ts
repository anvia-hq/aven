import { Agent, type CompletionModel } from "@anvia/core";
import type { DurableAgentRegistration } from "@anvia/durable";

import type { ToolConcurrencyProbe } from "./types";

export const TOOL_CONCURRENCY_NOT_HONOURED =
  'The installed @anvia/durable drops toolConcurrency on an agent registration, so every run would silently make its tool calls one at a time. This build is missing patches/@anvia%2Fdurable@0.14.0.patch: run `bun install` at the repository root, and check that the root package.json still lists "@anvia/durable@0.14.0" in patchedDependencies.';

const PROBE_AGENT_ID = "tool-concurrency-probe";

const PROBE_REGISTRATION_VERSION = "probe";

const PROBE_TOOL_CONCURRENCY = 0;

const PROBE_MODEL: CompletionModel = {
  provider: "probe",
  modelId: "tool-concurrency",
  capabilities: {
    streaming: false,
    tools: false,
    toolChoice: false,
    imageInput: false,
    documentInput: false,
    outputSchema: false,
    reasoning: false,
  },
  completion: async () => {
    throw new Error("The tool concurrency probe never calls a model.");
  },
};

function probeRegistration(): DurableAgentRegistration {
  return {
    agent: new Agent({ id: PROBE_AGENT_ID, model: PROBE_MODEL, instructions: "Probe." }),
    version: PROBE_REGISTRATION_VERSION,
    toolConcurrency: PROBE_TOOL_CONCURRENCY,
  };
}

export function assertDurableToolConcurrency(register: ToolConcurrencyProbe) {
  try {
    register(probeRegistration());
  } catch (error) {
    if (error instanceof TypeError) return;

    throw error;
  }
  throw new Error(TOOL_CONCURRENCY_NOT_HONOURED);
}
