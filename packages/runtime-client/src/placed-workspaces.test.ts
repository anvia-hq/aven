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
    const side = (name: string) =>
      ({
        uploads: {
          save: async () => "unused",
          settle: async (threadId: string) => {
            calls.push(`${name}:settle:${threadId}`);
          },
          placed: (threadId: string, file: string) => `${name}:${threadId}/${file}`,
          claim: (threadId: string, file: string) => {
            calls.push(`${name}:claim:${threadId}:${file}`);
          },
          placedNote: (threadId: string) => `${name}:note:${threadId}`,
        },
        release: async () => undefined,
        dispose: async () => undefined,
      }) as unknown as ThreadWorkspaces;
    const placed = new PlacedWorkspaces(side("host"), side("machine"), (id) => id === "m1");

    for (const threadId of ["m1", "h1"]) {
      await placed.uploads?.settle?.(threadId);
      placed.uploads?.claim?.(threadId, "a.txt");
    }

    expect(placed.uploads?.placed?.("m1", "a.txt")).toBe("machine:m1/a.txt");
    expect(placed.uploads?.placedNote?.("m1")).toBe("machine:note:m1");
    expect(placed.uploads?.placed?.("h1", "a.txt")).toBe("host:h1/a.txt");
    expect(calls).toEqual([
      "machine:settle:m1",
      "machine:claim:m1:a.txt",
      "host:settle:h1",
      "host:claim:h1:a.txt",
    ]);
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
