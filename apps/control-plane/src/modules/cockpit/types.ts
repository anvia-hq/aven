import type { CockpitAccess } from "@aven/protocol/types";

export type CockpitActor = { kind: "bot" | "thread"; name: string };

export type CockpitCaller = {
  userId: string;
  access: CockpitAccess;
  onPersonsWord: boolean;
  actor?: CockpitActor;
};
