import type { ProjectEnvironmentRow } from "@aven/db/schema/types";
import type { EnvironmentStatus, RuntimeProviderKind } from "@aven/protocol/types";

export type EnvironmentSaved = {
  name: string;
  status: EnvironmentStatus;
  error: string | null;
};

export type EnvironmentProvider = {
  saveEnvironment(sandboxId: string, name: string): Promise<EnvironmentSaved>;
  readEnvironment(name: string): Promise<EnvironmentSaved | null>;
  removeEnvironment(name: string): Promise<boolean>;
};

export type EnvironmentLookup = {
  projectId: string;
  provider: RuntimeProviderKind;
};

export type EnvironmentSaveInput = EnvironmentLookup & {
  organizationId: string;
  sandboxId: string | null;
  setupDigest: string;
};

export type EnvironmentExpiryOptions = {
  intervalMs: number;
  expired(before: Date): Promise<ProjectEnvironmentRow[]>;
  remove(row: ProjectEnvironmentRow): Promise<boolean>;
};

export type EnvironmentSnapshot = {
  name: string;
  status: EnvironmentStatus;
  setupDigest: string;
  savedAt: Date | null;
  expiresAt: Date | null;
};
