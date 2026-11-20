import type { AnyElysia } from "elysia";

import type { ComputerStart } from "../modules/runtimes/types";

export type Edition = {
  name: string;
  manageUrl: string | null;
  hidePlatformSettings?: boolean;
  features: readonly string[];
  routes: readonly AnyElysia[];
  admit?: (start: ComputerStart) => Promise<void>;
};
