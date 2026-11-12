import { db } from "@aven/db/client";
import { platformSettings } from "@aven/db/schema/platform-settings";
import type { ModelConfig } from "@aven/agents/types";
import { eq } from "drizzle-orm";

import { decryptOrUnavailable, encryptSecret } from "../../crypto";
import { ConflictError, NotFoundError, UnprocessableError } from "../../errors";
import { DEFAULT_MODEL } from "../decision-model/jev";
import { serverDecisionModel } from "../decision-model/server-default";
import type { DecisionConfig, DecisionKind } from "../decision-model/types";
import { serverSmallModel } from "../providers/server-small-model";
import type { SaveServerDecisionBody, SaveServerSmallBody } from "./schema";
import { storedServerModel } from "./schema";
import type {
  ServerModelSource,
  ServerModelsView,
  SmallModelProvider,
  StoredServerModel,
} from "./types";

const DECISION_KEY = "server_decision_model";
const SMALL_KEY = "server_small_model";

type Env = Record<string, string | undefined>;

async function readStored(key: string): Promise<StoredServerModel | null> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, key));

  if (!row) return null;

  const parsed = storedServerModel.safeParse(JSON.parse(row.value));
  return parsed.success ? parsed.data : null;
}

async function writeStored(key: string, stored: StoredServerModel) {
  const value = JSON.stringify(stored);
  await db
    .insert(platformSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value } });
}

async function deleteStored(key: string) {
  const removed = await db
    .delete(platformSettings)
    .where(eq(platformSettings.key, key))
    .returning({ key: platformSettings.key });
  return removed.length > 0;
}

function keyOf(stored: StoredServerModel, label: string) {
  return decryptOrUnavailable(stored.apiKeyEncrypted, {
    logged: `Could not decrypt the server's ${label} key:`,
    message: `The server's saved ${label} key could not be read; enter it again`,
  });
}

function refuseWhenEnv(env: Env, name: string, label: string) {
  if (env[name]?.trim()) {
    throw new ConflictError(
      `The ${label} is set by ${name} in the server's environment. Remove it there to manage it here`,
    );
  }
}

function view<Kind extends string>(
  kind: Kind,
  modelId: string,
  keyHint: string,
  source: ServerModelSource,
) {
  return { kind, modelId, keyHint, source };
}

async function decisionView(env: Env): Promise<ServerModelsView["decision"]> {
  const fromEnv = serverDecisionModel(env);

  if (fromEnv) return view(fromEnv.kind, fromEnv.modelId, "", "env");

  const stored = await readStored(DECISION_KEY);

  if (!stored) return null;

  return view(stored.kind as DecisionKind, stored.modelId, stored.keyHint, "platform");
}

async function smallView(env: Env): Promise<ServerModelsView["small"]> {
  const fromEnv = serverSmallModel(env);

  if (fromEnv)
    return view(fromEnv.provider as SmallModelProvider, fromEnv.modelId ?? "", "", "env");

  const stored = await readStored(SMALL_KEY);

  if (!stored) return null;

  return view(stored.kind as SmallModelProvider, stored.modelId, stored.keyHint, "platform");
}

export const serverModelsService = {
  async decision(env: Env = process.env): Promise<DecisionConfig | null> {
    const fromEnv = serverDecisionModel(env);

    if (fromEnv) return fromEnv;

    const stored = await readStored(DECISION_KEY);
    return stored
      ? {
          kind: stored.kind as DecisionKind,
          modelId: stored.modelId,
          apiKey: keyOf(stored, "decision model"),
        }
      : null;
  },

  async small(env: Env = process.env): Promise<ModelConfig | null> {
    const fromEnv = serverSmallModel(env);

    if (fromEnv) return fromEnv;

    const stored = await readStored(SMALL_KEY);
    return stored
      ? {
          provider: stored.kind as SmallModelProvider,
          modelId: stored.modelId,
          apiKey: keyOf(stored, "small model"),
        }
      : null;
  },

  async view(env: Env = process.env): Promise<ServerModelsView> {
    return { decision: await decisionView(env), small: await smallView(env) };
  },

  async saveDecision(body: SaveServerDecisionBody, env: Env = process.env) {
    refuseWhenEnv(env, "DECISION_MODEL_API_KEY", "default decision model");
    const existing = await readStored(DECISION_KEY);

    if (!existing && !body.apiKey) {
      throw new UnprocessableError("Enter the key of the decision model");
    }

    await writeStored(DECISION_KEY, {
      kind: body.kind,
      modelId: body.modelId ?? DEFAULT_MODEL[body.kind],
      apiKeyEncrypted: body.apiKey ? encryptSecret(body.apiKey) : (existing?.apiKeyEncrypted ?? ""),
      keyHint: body.apiKey ? body.apiKey.slice(-4) : (existing?.keyHint ?? ""),
    });
    return (await this.view(env)).decision;
  },

  async saveSmall(body: SaveServerSmallBody, env: Env = process.env) {
    refuseWhenEnv(env, "SMALL_MODEL_API_KEY", "default small model");
    const existing = await readStored(SMALL_KEY);

    if (!existing && !body.apiKey) throw new UnprocessableError("Enter the key of the small model");

    await writeStored(SMALL_KEY, {
      kind: body.kind,
      modelId: body.modelId,
      apiKeyEncrypted: body.apiKey ? encryptSecret(body.apiKey) : (existing?.apiKeyEncrypted ?? ""),
      keyHint: body.apiKey ? body.apiKey.slice(-4) : (existing?.keyHint ?? ""),
    });
    return (await this.view(env)).small;
  },

  async removeDecision(env: Env = process.env) {
    refuseWhenEnv(env, "DECISION_MODEL_API_KEY", "default decision model");

    if (!(await deleteStored(DECISION_KEY))) {
      throw new NotFoundError("No default decision model is saved here");
    }
  },

  async removeSmall(env: Env = process.env) {
    refuseWhenEnv(env, "SMALL_MODEL_API_KEY", "default small model");

    if (!(await deleteStored(SMALL_KEY))) {
      throw new NotFoundError("No default small model is saved here");
    }
  },
};
