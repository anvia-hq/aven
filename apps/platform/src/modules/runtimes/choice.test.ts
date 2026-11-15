import { describe, expect, test } from "bun:test";

import { defaultRuntimeId, runtimeChoices } from "./choice";
import type { Runtime } from "./types";

const runtime = (id: string, over: Partial<Runtime> = {}) =>
  ({
    id,
    name: id,
    online: true,
    isCloud: false,
    ...over,
  }) as Runtime;

const cloud = runtime("cloud", { isCloud: true, online: false });
const mac = runtime("mac");
const asleep = runtime("asleep", { online: false });
const all = [mac, asleep, cloud];

describe("runtimeChoices", () => {
  test("a repository project can run on Aven Cloud and any computer that is online, and the rest are shown but off", () => {
    const choices = runtimeChoices({ runtimeId: null, directory: null }, all);

    expect(choices.map(({ runtime: { id } }) => id)).toEqual(["cloud", "mac", "asleep"]);
    expect(choices.map(({ disabled }) => disabled)).toEqual([false, false, true]);
    expect(choices[2]!.note).toBe("offline");
  });

  test("a folder project can run only on the computer that has the folder, even when it is offline", () => {
    const choices = runtimeChoices({ runtimeId: "asleep", directory: "/code/app" }, all);

    expect(choices.map(({ disabled }) => disabled)).toEqual([true, true, false]);
    expect(choices[0]!.note).toBe("The folder is on another computer");
  });
});

describe("defaultRuntimeId", () => {
  test("starts on the project's own computer when it can be used, otherwise Aven Cloud, otherwise an online computer", () => {
    expect(defaultRuntimeId({ runtimeId: "mac", directory: null }, all)).toBe("mac");
    expect(defaultRuntimeId({ runtimeId: "asleep", directory: null }, all)).toBe("cloud");
    expect(defaultRuntimeId({ runtimeId: null, directory: null }, all)).toBe("cloud");
    expect(defaultRuntimeId({ runtimeId: null, directory: null }, [asleep, mac])).toBe("mac");
    expect(defaultRuntimeId({ runtimeId: "asleep", directory: "/code" }, all)).toBe("asleep");
    expect(defaultRuntimeId(undefined, all)).toBeUndefined();
    expect(defaultRuntimeId({ runtimeId: null, directory: null }, [asleep])).toBeUndefined();
  });
});
