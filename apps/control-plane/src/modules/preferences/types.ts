export type FollowUpSettings = {
  enabled: boolean;
  providerId: string | null;
  modelId: string | null;
};

export type ServerSmallModelView = { provider: string; modelId: string };

export type FollowUpView = FollowUpSettings & { serverModel: ServerSmallModelView | null };
