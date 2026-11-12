import type { BotApiParams, BotApiResult } from "@aven/protocol/types";

import { ACTING_HEADER, grantActing } from "../auth/acting";
import { BotApiRefusal, classify, holdsSecret, normalizePath, redact } from "./gate";
import { searchRoutes } from "./catalog";
import type { BotApiDeps } from "./types";

export const API_TIMEOUT_MS = 30_000;
export const API_RESPONSE_CHARACTERS = 20_000;
export const API_CALLS_PER_REPLY = 60;

type Call = Extract<BotApiParams, { op: "call" }>;

export type BotApiAsk = { userId: string; params: BotApiParams; onPersonsWord: boolean };

async function bodyOf(response: Response) {
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("json") && !type.startsWith("text/")) {
    return `[${type || "unknown type"}, not shown]`;
  }
  const text = await response.text();
  if (!type.includes("json")) return text.slice(0, API_RESPONSE_CHARACTERS);
  try {
    const shown = JSON.stringify(redact(JSON.parse(text)));
    return shown.length > API_RESPONSE_CHARACTERS
      ? `${shown.slice(0, API_RESPONSE_CHARACTERS)}… [cut]`
      : JSON.parse(shown);
  } catch {
    return text.slice(0, API_RESPONSE_CHARACTERS);
  }
}

export function createBotApi({ routes, handle, organizationsOf }: BotApiDeps) {
  async function organizationFor(userId: string, wanted: string | undefined) {
    const organizations = await organizationsOf(userId);
    if (wanted) {
      if (!organizations.some((each) => each.id === wanted)) {
        throw new BotApiRefusal("You are not in that workspace");
      }
      return wanted;
    }
    if (organizations.length === 1) return organizations[0]!.id;
    throw new BotApiRefusal(
      `Pass organizationId, one of: ${organizations.map((each) => `${each.id} (${each.name})`).join(", ")}`,
    );
  }

  async function call(userId: string, onPersonsWord: boolean, params: Call): Promise<BotApiResult> {
    const { path, sent, search } = normalizePath(params.path);
    const tier = classify(params.method, path);
    if (tier === "blocked") throw new BotApiRefusal("Bots cannot use that route");
    if (tier !== "read") {
      if (!onPersonsWord) {
        throw new BotApiRefusal(
          "Changing anything takes the person's own message; ask them, and do it when they answer",
        );
      }
      if (holdsSecret(params.body)) {
        throw new BotApiRefusal(
          "A secret is never sent through a bot; the person types it into a form",
        );
      }
    }
    if (tier === "confirm" && params.confirmed !== true) {
      throw new BotApiRefusal(
        "This is hard to undo. Ask the person with ask_question; when they say yes, call again with confirmed: true",
      );
    }
    const organizationId = await organizationFor(userId, params.organizationId);
    const acting = grantActing(userId, organizationId);
    try {
      const headers = new Headers({ [ACTING_HEADER]: acting.token });
      let body: string | undefined;
      if (params.method !== "GET" && params.body !== undefined) {
        headers.set("content-type", "application/json");
        body = JSON.stringify(params.body);
      }
      const response = await handle(
        new Request(`http://aven.internal${sent}${search}`, {
          method: params.method,
          headers,
          body,
          signal: AbortSignal.timeout(API_TIMEOUT_MS),
        }),
      );
      return { status: response.status, body: await bodyOf(response) };
    } finally {
      acting.revoke();
    }
  }

  return {
    async answer({ userId, params, onPersonsWord }: BotApiAsk): Promise<BotApiResult> {
      if (params.op === "search") {
        return {
          routes: searchRoutes(routes(), params.query),
          organizations: await organizationsOf(userId),
        };
      }
      return call(userId, onPersonsWord, params);
    },
  };
}
