import type { AccessPermission } from "./types";

export const ACCESS_PERMISSIONS: readonly AccessPermission[] = ["read", "change", "destructive"];

export const ACCESS_TOKEN_PREFIX = "avn_";

export const ACCESS_MAX_NAME = 60;

export const ACCESS_LIMIT = 20;
