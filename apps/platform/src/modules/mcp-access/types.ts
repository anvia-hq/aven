import type { AccessPermission, AccessToken, AccessTokenCreated } from "@aven/protocol/types";

export type { AccessPermission, AccessToken, AccessTokenCreated };

export type AccessTokenInput = { name: string; permissions: AccessPermission[] };
