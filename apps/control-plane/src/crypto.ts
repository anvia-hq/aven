import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { UnavailableError } from "./errors";

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

export function decryptOrUnavailable(stored: string, failure: { logged: string; message: string }) {
  try {
    return decryptSecret(stored);
  } catch (error) {
    console.error(failure.logged, error);
    throw new UnavailableError(failure.message);
  }
}
