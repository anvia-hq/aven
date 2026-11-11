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
  test("asks the machine side where a waited attachment was written", async () => {
    const calls: string[] = [];
    const machine = {
      uploads: {
        save: async () => "unused",
        settle: async (threadId: string) => {
          calls.push(`settle:${threadId}`);
        },
        placed: (threadId: string, name: string) => `${threadId}/${name}`,
        claim: (threadId: string, name: string) => {
          calls.push(`claim:${threadId}:${name}`);
        },
        placedNote: (threadId: string) => `note:${threadId}`,
      },
      release: async () => undefined,
      dispose: async () => undefined,
    } as unknown as ThreadWorkspaces;
    const placed = new PlacedWorkspaces(machine, machine, () => true);

    await placed.uploads?.settle?.("t1");
    expect(placed.uploads?.placed?.("t1", "a.txt")).toBe("t1/a.txt");
    placed.uploads?.claim?.("t1", "a.txt");
    expect(placed.uploads?.placedNote?.("t1")).toBe("note:t1");
    expect(calls).toEqual(["settle:t1", "claim:t1:a.txt"]);
  });

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
