import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { ProviderRow } from "@aven/db/schema/providers";

import { UnavailableError } from "../../errors";

// AES-256-GCM. The stored form is `iv.tag.ciphertext`, each part base64.
function key() {
  const raw = process.env.PROVIDER_ENCRYPTION_KEY;
  const bytes = raw ? Buffer.from(raw, "base64") : Buffer.alloc(0);
  if (bytes.length !== 32) {
    throw new Error("PROVIDER_ENCRYPTION_KEY must be 32 bytes, base64 (openssl rand -base64 32)");
  }
  return bytes;
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64")).join(".");
}

export function decryptSecret(stored: string) {
  const [iv, tag, data] = stored.split(".").map((part) => Buffer.from(part, "base64"));
  if (!iv || !tag || !data) throw new Error("Stored secret is malformed");
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

// A key that cannot be decrypted (a rotated PROVIDER_ENCRYPTION_KEY, a damaged row) is an
// unavailable provider, not a server bug: the owner fixes it by entering the key again.
export function readKey(row: ProviderRow) {
  if (!row.apiKeyEncrypted) return undefined;
  try {
    return decryptSecret(row.apiKeyEncrypted);
  } catch (error) {
    console.error(`Could not decrypt the key of provider ${row.id}:`, error);
    throw new UnavailableError("This provider's saved key could not be read; enter it again");
  }
}
