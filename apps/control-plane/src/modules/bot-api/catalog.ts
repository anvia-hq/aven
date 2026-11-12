import { z } from "zod";

import { classify } from "./gate";
import type { BotApiRoute } from "@aven/protocol/types";
import type { KnownRoute } from "./types";

const MAX_ROUTES = 40;

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

function schemaOf(body: unknown) {
  if (!body) return undefined;
  try {
    return z.toJSONSchema(body as z.ZodType);
  } catch {
    return undefined;
  }
}

export function searchRoutes(known: readonly KnownRoute[], query = ""): BotApiRoute[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  const found: BotApiRoute[] = [];
  for (const route of known) {
    if (!METHODS.has(route.method)) continue;
    const key = `${route.method} ${route.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const tier = classify(route.method, route.path);
    if (tier === "blocked") continue;
    if (!words.every((word) => key.toLowerCase().includes(word))) continue;
    const body = schemaOf(route.body);
    found.push(
      body
        ? { method: route.method, path: route.path, tier, body }
        : { method: route.method, path: route.path, tier },
    );
  }
  return found.slice(0, MAX_ROUTES);
}
