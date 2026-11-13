import { db } from "@aven/db/client";
import { members } from "@aven/db/schema/members";
import { userAvatars } from "@aven/db/schema/user-avatars";
import { users } from "@aven/db/schema/users";
import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { UnprocessableError } from "@aven/server-kit/errors";
import type { AvatarImage } from "./types";

export const AVATAR_MAX_BYTES = 256 * 1024;

const SIGNATURES: { contentType: string; matches: (bytes: Uint8Array) => boolean }[] = [
  {
    contentType: "image/png",
    matches: (bytes) =>
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, at) => bytes[at] === byte),
  },
  {
    contentType: "image/jpeg",
    matches: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  {
    contentType: "image/webp",
    matches: (bytes) =>
      [0x52, 0x49, 0x46, 0x46].every((byte, at) => bytes[at] === byte) &&
      [0x57, 0x45, 0x42, 0x50].every((byte, at) => bytes[8 + at] === byte),
  },
];

export const avatarUrl = (userId: string, version: number) =>
  `/api/users/${encodeURIComponent(userId)}/avatar?v=${version}`;

export async function readCapped(request: Request) {
  const reader = request.body?.getReader();

  if (!reader) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();

    if (done) break;

    length += value.length;

    if (length > AVATAR_MAX_BYTES) {
      await reader.cancel();
      throw new UnprocessableError("The image is too large: keep it under 256 KB");
    }

    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return bytes;
}

export function imageTypeOf(bytes: Uint8Array) {
  return SIGNATURES.find((signature) => signature.matches(bytes))?.contentType;
}

export const avatarsService = {
  async save(userId: string, bytes: Uint8Array) {
    if (bytes.length === 0) throw new UnprocessableError("Choose an image");

    if (bytes.length > AVATAR_MAX_BYTES) {
      throw new UnprocessableError("The image is too large: keep it under 256 KB");
    }

    const contentType = imageTypeOf(bytes);

    if (!contentType) throw new UnprocessableError("Use a PNG, JPEG or WebP image");

    const image = avatarUrl(userId, Date.now());
    await db.transaction(async (tx) => {
      await tx
        .insert(userAvatars)
        .values({ userId, contentType, data: bytes })
        .onConflictDoUpdate({ target: userAvatars.userId, set: { contentType, data: bytes } });
      await tx.update(users).set({ image }).where(eq(users.id, userId));
    });
    return { image };
  },

  async remove(userId: string) {
    await db.transaction(async (tx) => {
      await tx.delete(userAvatars).where(eq(userAvatars.userId, userId));
      await tx.update(users).set({ image: null }).where(eq(users.id, userId));
    });
    return { image: null };
  },

  async read(viewerId: string, userId: string): Promise<AvatarImage | null> {
    if (viewerId !== userId) {
      const mine = alias(members, "mine");
      const theirs = alias(members, "theirs");
      const [shared] = await db
        .select({ id: mine.id })
        .from(mine)
        .innerJoin(
          theirs,
          and(eq(theirs.organizationId, mine.organizationId), eq(theirs.userId, userId)),
        )
        .where(eq(mine.userId, viewerId))
        .limit(1);

      if (!shared) return null;
    }

    const [avatar] = await db
      .select({ contentType: userAvatars.contentType, data: userAvatars.data })
      .from(userAvatars)
      .where(eq(userAvatars.userId, userId));
    return avatar ?? null;
  },
};
