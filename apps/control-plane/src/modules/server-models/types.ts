import type { DecisionKind } from "../decision-model/types";

export type ServerModelSource = "env" | "platform";

export type SmallModelProvider = "anthropic" | "openai" | "gemini";

export type ServerModelView<Kind extends string> = {
  kind: Kind;
  modelId: string;
  keyHint: string;
  source: ServerModelSource;
};

export type ServerModelsView = {
  decision: ServerModelView<DecisionKind> | null;
  small: ServerModelView<SmallModelProvider> | null;
};

export type StoredServerModel = {
  kind: string;
  modelId: string;
  apiKeyEncrypted: string;
  keyHint: string;
};
