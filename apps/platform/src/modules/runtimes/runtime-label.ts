import type { Runtime } from "./types";

export const runtimeLabel = (runtime: Runtime) =>
  `${runtime.name} · ${runtime.online ? "online" : "offline"}`;
