import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ArtifactStore } from "./artifacts";

const root = await mkdtemp(join(tmpdir(), "aven-artifacts-"));
const store = new ArtifactStore(root);
const thread = crypto.randomUUID();

afterAll(() => rm(root, { recursive: true, force: true }));

describe("ArtifactStore", () => {
  test("reads back what it kept, by the name it gave", async () => {
    const name = await store.save(thread, new Uint8Array([1, 2, 3]), "image/png");
    expect(name).toMatch(/\.png$/);
    expect(await store.read(thread, name)).toEqual({ mediaType: "image/png", data: "AQID" });
  });

  test("keeps each thread's images apart", async () => {
    const name = await store.save(thread, new Uint8Array([1]), "image/webp");
    expect(await store.read(crypto.randomUUID(), name)).toBeNull();
  });

  test("reads nothing by a name it does not give", async () => {
    expect(await store.read(thread, "../../etc/passwd")).toBeNull();
    expect(await store.read(thread, `${crypto.randomUUID()}.png`)).toBeNull();
    await expect(store.read("../x", `${crypto.randomUUID()}.png`)).rejects.toThrow();
  });
});
