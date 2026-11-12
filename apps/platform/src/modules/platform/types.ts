export type PlatformConfig = {
  registrationEnabled: boolean;
  githubLogin: boolean;
  emailLogin: boolean;
  isOwner: boolean;
};

export type PlatformPerson = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  createdAt: string;
  lastActiveAt: string | null;
  owner: boolean;
  workspaces: { id: string; name: string; role: string }[];
};

export type ServerModelSource = "env" | "platform";

export type ServerModel = {
  kind: string;
  modelId: string;
  keyHint: string;
  source: ServerModelSource;
};

export type ServerModels = {
  decision: ServerModel | null;
  small: ServerModel | null;
};

export type ServerModelDraft = { kind: string; modelId: string; apiKey: string };

export type ServerModelOption = {
  id: string;
  label: string;
  defaultModel: string;
  keyLabel: string;
};
