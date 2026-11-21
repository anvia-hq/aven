import { db } from "@aven/db/client";
import { members } from "@aven/db/schema/members";
import { userAvatars } from "@aven/db/schema/user-avatars";
import { users } from "@aven/db/schema/users";
import { imageType } from "@aven/protocol/image-type";
import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { UnprocessableError } from "@aven/server-kit/errors";

import { AVATAR_MAX_BYTES } from "./body";
import type { AvatarImage } from "./types";

export const avatarUrl = (userId: string, version: number) =>
  `/api/users/${encodeURIComponent(userId)}/avatar?v=${version}`;

export function imageTypeOf(bytes: Uint8Array) {
  const detected = imageType(bytes);
  return detected && detected !== "image/gif" ? detected : undefined;
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
