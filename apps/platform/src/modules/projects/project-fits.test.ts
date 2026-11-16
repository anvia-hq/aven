import { describe, expect, test } from "bun:test";

import { projectFits } from "./project-fits";

const cloud = { id: "cloud", isCloud: true, parentRuntimeId: null };
const child = { id: "box", isCloud: false, parentRuntimeId: "cloud" };
const machine = { id: "mac", isCloud: false, parentRuntimeId: null };

describe("projectFits", () => {
  test("a repository fits a sandbox and a folder fits only the machine that has it", () => {
    const repository = { repoFullName: "acme/web", directory: null, runtimeId: null };
    const folder = { repoFullName: null, directory: "/code/web", runtimeId: "mac" };

    expect(projectFits(repository, cloud)).toBe(true);
    expect(projectFits(repository, child)).toBe(true);
    expect(projectFits(repository, machine)).toBe(false);
    expect(projectFits(folder, machine)).toBe(true);
    expect(projectFits(folder, { id: "other", isCloud: false, parentRuntimeId: null })).toBe(false);
    expect(projectFits(folder, cloud)).toBe(false);
    expect(projectFits(repository, undefined)).toBe(false);
  });
});
