import type { Runtime } from "./types";

/** A runtime by name and whether it is connected: "Laptop · online". */
export const runtimeLabel = (runtime: Runtime) =>
  `${runtime.name} · ${runtime.online ? "online" : "offline"}`;
