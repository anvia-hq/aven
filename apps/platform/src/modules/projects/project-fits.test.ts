import { describe, expect, test } from "bun:test";

import { projectFits } from "./project-fits";

const mac = { id: "mac" };
const other = { id: "other" };

describe("projectFits", () => {
  test("a folder fits only the machine that has it, and a repository fits any computer", () => {
    const folder = { directory: "/code/web", runtimeId: "mac" };
    const repository = { directory: null, runtimeId: "mac" };

    expect(projectFits(folder, mac)).toBe(true);
    expect(projectFits(folder, other)).toBe(false);
    expect(projectFits(folder, undefined)).toBe(false);
    expect(projectFits(repository, mac)).toBe(true);
    expect(projectFits(repository, other)).toBe(true);
    expect(projectFits(repository, undefined)).toBe(true);
  });
});
