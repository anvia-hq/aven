import type { BotApiMethod, BotApiRoute } from "@aven/protocol/types";

export type ApiTier = "read" | "change" | "confirm" | "blocked";

export type KnownRoute = { method: BotApiMethod; path: string; body?: unknown };

export type BotApiDeps = {
  routes(): KnownRoute[];
  handle(request: Request): Promise<Response>;
  organizationsOf(userId: string): Promise<{ id: string; name: string }[]>;
  timeoutMs?: number;
};

export type ApiCatalogEntry = BotApiRoute;
