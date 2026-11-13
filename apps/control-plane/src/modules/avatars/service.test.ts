import { afterAll, describe, expect, test } from "bun:test";

import { UnprocessableError } from "@aven/server-kit/errors";
import { AVATAR_MAX_BYTES, imageTypeOf, readCapped } from "./service";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

describe("what an avatar may be", () => {
  test("is told by the bytes, not by what the upload claims", () => {
    expect(imageTypeOf(PNG)).toBe("image/png");
    expect(imageTypeOf(JPEG)).toBe("image/jpeg");
    expect(imageTypeOf(WEBP)).toBe("image/webp");
    expect(imageTypeOf(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeUndefined();
    expect(imageTypeOf(new TextEncoder().encode("GIF89a"))).toBeUndefined();
  });
});

function chunked(sizes: number[]) {
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const size = sizes[sent++];

      if (size === undefined) controller.close();
      else controller.enqueue(new Uint8Array(size).fill(7));
    },
  });
  return new Request("http://aven.test/profile/avatar", {
    method: "PUT",
    body: stream,
    duplex: "half",
  } as RequestInit);
}

describe("reading an upload with no declared length", () => {
  test("joins the chunks as they came", async () => {
    const bytes = await readCapped(chunked([3, 4, 5]));
    expect(bytes.length).toBe(12);
  });

  test("stops once the body passes the limit", async () => {
    await expect(readCapped(chunked([AVATAR_MAX_BYTES, 1]))).rejects.toBeInstanceOf(
      UnprocessableError,
    );
  });
});

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("a person's avatar (postgres, decision 0198)", async () => {
  const { db } = await import("@aven/db/client");
  const { members } = await import("@aven/db/schema/members");
  const { users } = await import("@aven/db/schema/users");
  const { eq } = await import("drizzle-orm");
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { avatarsService } = await import("./service");

  const { userId, orgA, cleanup } = await seedOrgPair();
  const mateId = `${userId}-mate`;
  const strangerId = `${userId}-stranger`;
  await db.insert(users).values([
    { id: mateId, name: "Mate", email: `${mateId}@aven.test` },
    { id: strangerId, name: "Stranger", email: `${strangerId}@aven.test` },
  ]);
  await db.insert(members).values([
    { id: `${userId}-m`, organizationId: orgA, userId, role: "owner" },
    { id: `${mateId}-m`, organizationId: orgA, userId: mateId, role: "member" },
  ]);
  afterAll(async () => {
    await db.delete(users).where(eq(users.id, mateId));
    await db.delete(users).where(eq(users.id, strangerId));
    await cleanup();
  });

  const imageOf = async (id: string) =>
    (await db.select({ image: users.image }).from(users).where(eq(users.id, id)))[0]?.image;

  test("is kept, and the person's image points at it", async () => {
    const { image } = await avatarsService.save(userId, PNG);
    expect(image).toMatch(new RegExp(`^/api/users/${userId}/avatar\\?v=\\d+$`));
    expect(await imageOf(userId)).toBe(image);
    const read = await avatarsService.read(userId, userId);
    expect(read?.contentType).toBe("image/png");
    expect([...read!.data]).toEqual([...PNG]);
  });

  test("is replaced by the next one", async () => {
    await avatarsService.save(userId, JPEG);
    expect((await avatarsService.read(userId, userId))?.contentType).toBe("image/jpeg");
  });

  test("is seen by someone who shares a workspace and by nobody else", async () => {
    await avatarsService.save(userId, PNG);
    expect(await avatarsService.read(mateId, userId)).not.toBeNull();
    expect(await avatarsService.read(strangerId, userId)).toBeNull();
  });

  test("refuses what is not a small PNG, JPEG or WebP", async () => {
    await expect(avatarsService.save(userId, new Uint8Array())).rejects.toBeInstanceOf(
      UnprocessableError,
    );
    await expect(
      avatarsService.save(userId, new TextEncoder().encode("<svg></svg>")),
    ).rejects.toBeInstanceOf(UnprocessableError);
    const big = new Uint8Array(AVATAR_MAX_BYTES + 1);
    big.set(PNG);
    await expect(avatarsService.save(userId, big)).rejects.toBeInstanceOf(UnprocessableError);
  });

  test("is removed, and the person has no image", async () => {
    await avatarsService.save(userId, PNG);
    await avatarsService.remove(userId);
    expect(await avatarsService.read(userId, userId)).toBeNull();
    expect(await imageOf(userId)).toBeNull();
  });
});
