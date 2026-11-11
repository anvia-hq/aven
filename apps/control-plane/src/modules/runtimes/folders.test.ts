import { expect, test } from "bun:test";

import { runnerFolders } from "./folders";
import type { RuntimeHub } from "./hub";

const hubWith = (call: (method: string, params: unknown) => Promise<unknown>) =>
  ({ get: () => ({ call }) }) as unknown as RuntimeHub;

test("lists a runner's folders through the call it answers", async () => {
  const seen: unknown[] = [];
  const folders = runnerFolders(
    hubWith(async (method, params) => {
      seen.push([method, params]);
      return {
        path: "/code",
        parent: null,
        folders: [{ name: "app", path: "/code/app", git: true }],
      };
    }),
  );

  const listed = await folders.list("r1", "/code");

  expect(listed.folders[0]).toEqual({ name: "app", path: "/code/app", git: true });
  expect(seen).toEqual([["folders.list", { path: "/code" }]]);
});

test("tells a person to update an old runner, and a refused folder from a failure", async () => {
  const old = runnerFolders(
    hubWith(async () => Promise.reject(new Error("Unknown call folders.list"))),
  );
  await expect(old.list("r1", undefined)).rejects.toThrow("Update this computer's runner");

  const refused = runnerFolders(
    hubWith(async () => Promise.reject(new Error("This runner does not serve /etc"))),
  );
  await expect(refused.list("r1", "/etc")).rejects.toThrow("does not serve");
});

test("says a runner that is offline is offline", async () => {
  const folders = runnerFolders({ get: () => undefined } as unknown as RuntimeHub);
  await expect(folders.create("r1", "/code", "new")).rejects.toThrow("offline");
});
