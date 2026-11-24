import type {
  Automation,
  AutomationCreated,
  AutomationRun,
  AutomationStatus,
} from "@aven/protocol/types";

import type { CreateAutomationBody, UpdateAutomationBody } from "./schema";

export type AutomationViewer = { organizationId: string; userId: string };

export type AutomationDelivery = {
  token: string;
  body: string;
  headers: Record<string, string>;
  receivedAt?: Date;
};

export type AutomationThreadInput = {
  organizationId: string;
  userId: string;
  projectId: string;
  runtimeId: string;
  title: string;
};

export type AutomationStartInput = {
  organizationId: string;
  userId: string;
  threadId: string;
  prompt: string;
};

export type AutomationAbandonInput = {
  organizationId: string;
  userId: string;
  threadId: string;
  runtimeId: string;
};

export type AutomationRunner = {
  createThread(input: AutomationThreadInput): Promise<{ threadId: string; runtimeId: string }>;
  startRun(input: AutomationStartInput): Promise<void>;
  abandonThread?(input: AutomationAbandonInput): Promise<void>;
};

export type Automations = {
  list(viewer: AutomationViewer): Promise<Automation[]>;
  create(viewer: AutomationViewer, body: CreateAutomationBody): Promise<AutomationCreated>;
  update(
    viewer: AutomationViewer,
    id: string,
    body: UpdateAutomationBody,
  ): Promise<Automation | null>;
  remove(viewer: AutomationViewer, id: string): Promise<boolean>;
  runs(viewer: AutomationViewer, id: string): Promise<AutomationRun[]>;
  triggerManual(viewer: AutomationViewer, id: string): Promise<AutomationRun>;
  receiveWebhook(id: string, delivery: AutomationDelivery): Promise<AutomationRun>;
  fireScheduled(id: string, now?: Date): Promise<void>;
  recordThreadEnded(
    threadId: string,
    status: Exclude<AutomationStatus, "running">,
    error?: string,
  ): Promise<void>;
};
