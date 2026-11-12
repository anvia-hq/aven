import { db } from "@aven/db/client";
import { decisionModels } from "@aven/db/schema/decision-models";
import { eq } from "drizzle-orm";

import { decryptOrUnavailable, encryptSecret } from "../../crypto";
import { UnprocessableError } from "../../errors";
import { DEFAULT_MODEL } from "./jev";
import { serverDecisionModel } from "./server-default";
import type { SaveDecisionModelBody } from "./schema";
import type { DecisionConfig, DecisionModelView } from "./types";
import type { DecisionModelRow } from "@aven/db/schema/types";

serverDecisionModel(process.env);

const view = ({ kind, modelId, keyHint }: DecisionModelRow): DecisionModelView => ({
  kind,
  modelId,
  keyHint,
  source: "workspace",
});

const serverView = ({ kind, modelId }: DecisionConfig): DecisionModelView => ({
  kind,
  modelId,
  keyHint: "",
  source: "server",
});

async function rowOf(organizationId: string) {
  const [row] = await db
    .select()
    .from(decisionModels)
    .where(eq(decisionModels.organizationId, organizationId));
  return row;
}

export const decisionModelService = {
  async get(organizationId: string) {
    const row = await rowOf(organizationId);

    if (row) return view(row);

    const fallback = serverDecisionModel(process.env);
    return fallback ? serverView(fallback) : null;
  },

  async save(organizationId: string, { kind, modelId, apiKey }: SaveDecisionModelBody) {
    const existing = await rowOf(organizationId);

    if (!existing && !apiKey) throw new UnprocessableError("Enter the key of the decision model");

    const values = {
      kind,
      modelId: modelId ?? DEFAULT_MODEL[kind],
      apiKeyEncrypted: apiKey ? encryptSecret(apiKey) : (existing?.apiKeyEncrypted ?? ""),
      keyHint: apiKey ? apiKey.slice(-4) : (existing?.keyHint ?? ""),
    };
    const [saved] = await db
      .insert(decisionModels)
      .values({ organizationId, ...values })
      .onConflictDoUpdate({ target: decisionModels.organizationId, set: values })
      .returning();

    if (!saved) throw new UnprocessableError("The decision model could not be saved");

    return view(saved);
  },

  async remove(organizationId: string) {
    const removed = await db
      .delete(decisionModels)
      .where(eq(decisionModels.organizationId, organizationId))
      .returning({ id: decisionModels.id });
    return removed.length > 0;
  },

  async config(organizationId: string): Promise<DecisionConfig | null> {
    const row = await rowOf(organizationId);

    if (!row) return serverDecisionModel(process.env);

    const apiKey = decryptOrUnavailable(row.apiKeyEncrypted, {
      logged: `Could not decrypt the decision model key of workspace ${organizationId}:`,
      message: "The decision model's saved key could not be read; enter it again",
    });
    return { kind: row.kind, modelId: row.modelId, apiKey };
  },
};
