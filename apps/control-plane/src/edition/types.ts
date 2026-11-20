import type { Provider } from "@aven/protocol/types";
import type { AnyElysia } from "elysia";

import type { ComputerStart } from "../modules/runtimes/types";

export type GrantedProvider = {
  id: string;
  kind: Provider;
  name: string;
  baseUrl: string | null;
  modelId: string | null;
  allowedModels: string[] | null;
  apiKeyEncrypted: string | null;
  keyHint: string | null;
  createdAt: Date;
};

export type EditionProviders = {
  list: (userId: string) => Promise<GrantedProvider[]>;
  find: (userId: string, id: string) => Promise<GrantedProvider | null>;
};

export type Edition = {
  name: string;
  manageUrl: string | null;
  hidePlatformSettings?: boolean;
  features: readonly string[];
  routes: readonly AnyElysia[];
  admit?: (start: ComputerStart) => Promise<void>;
  providers?: EditionProviders;
};
