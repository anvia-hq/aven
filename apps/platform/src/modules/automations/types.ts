import type {
  Automation,
  AutomationCreated,
  AutomationRun,
  AutomationTriggerKind,
} from "@aven/protocol/types";

export type { Automation, AutomationCreated, AutomationRun, AutomationTriggerKind };

export type AutomationFilter = "all" | "schedule" | "webhook" | "paused";

export type CreateAutomationInput = {
  name: string;
  projectId: string;
  runtimeId?: string;
  triggerKind: AutomationTriggerKind;
  cron?: string;
  prompt: string;
};
