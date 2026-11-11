import { describe, expect, test } from "bun:test";

import { PlacedWorkspaces } from "./placed-workspaces";
import type { ThreadWorkspaces } from "./types";

function recording(name: string, released: string[]) {
  return {
    release: async (threadId: string) => {
      released.push(`${name}:${threadId}`);
    },
    dispose: async () => undefined,
  } as unknown as ThreadWorkspaces;
}

describe("PlacedWorkspaces", () => {
  test("releases a thread on both, so what the machine side kept goes once the run is over", async () => {
    const released: string[] = [];
    const placed = new PlacedWorkspaces(
      recording("host", released),
      recording("machine", released),
      () => false,
    );

    await placed.release("t1");

    expect(released.sort()).toEqual(["host:t1", "machine:t1"]);
  });
});
