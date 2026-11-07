import type { CockpitAccess } from "@aven/protocol/cockpit";

export type CockpitCaller = { userId: string; access: CockpitAccess; onPersonsWord: boolean };
