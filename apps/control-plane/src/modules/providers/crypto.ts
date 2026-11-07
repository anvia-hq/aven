import { decryptOrUnavailable } from "../../crypto";
import type { ProviderRow } from "@aven/db/schema/types";

export function readKey(row: ProviderRow) {
  if (!row.apiKeyEncrypted) return undefined;
  return decryptOrUnavailable(row.apiKeyEncrypted, {
    logged: `Could not decrypt the key of provider ${row.id}:`,
    message: "This provider's saved key could not be read; enter it again",
  });
}
