export type CloudLifecycle = {
  agentIdleSeconds: number;
  userIdleSeconds: number;
  expireHours: number;
  maxRunning: number | null;
  startBurst: number | null;
  startEveryMinutes: number;
};
