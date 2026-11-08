import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { UnavailableError } from "./errors";

const KEY_ERROR = "PROVIDER_ENCRYPTION_KEY must be 32 bytes, base64 (openssl rand -base64 32)";

const IV_BYTES = 12;

const TAG_BYTES = 16;

function keyFromEnvironment() {
  const raw = process.env.PROVIDER_ENCRYPTION_KEY;
  const bytes = raw ? Buffer.from(raw, "base64") : Buffer.alloc(0);
  if (bytes.length !== 32) throw new Error(KEY_ERROR);
  return bytes;
}

const KEY = keyFromEnvironment();

export function encryptSecret(plain: string) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64")).join(".");
}

export function decryptSecret(stored: string) {
  const parts = stored.split(".").map((part) => Buffer.from(part, "base64"));
  const [iv, tag, data] = parts;
  if (
    parts.length !== 3 ||
    !iv ||
    !tag ||
    !data ||
    iv.length !== IV_BYTES ||
    tag.length !== TAG_BYTES
  ) {
    throw new Error("Stored secret is malformed");
  }
  const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
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
