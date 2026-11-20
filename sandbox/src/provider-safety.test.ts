import { afterEach, describe, expect, test } from "bun:test";

import { boatModule } from "./boat/module";
import { lizardModule } from "./lizard/module";
import { setSandboxSettings } from "./settings";
import { spacesModule } from "./spaces/module";

afterEach(() => setSandboxSettings(null));

describe("provider safety and capabilities", () => {
  test("boat, spaces, and lizard declare expected capabilities", () => {
    expect(boatModule.capabilities.stopMode).toBe("native_resume");
    expect(spacesModule.capabilities.stopMode).toBe("native_resume");
    expect(lizardModule.capabilities.stopMode).toBe("native_resume");
    expect(lizardModule.capabilities.supportsMaxLifetime).toBe(true);
  });

  test("removeEnvironment returns false when no credentials are available instead of leaking remote snapshots", async () => {
    setSandboxSettings(null);
    expect(await boatModule.removeEnvironment("aven-project-1")).toBe(false);
    expect(await spacesModule.removeEnvironment("aven-project-1")).toBe(false);
    expect(await lizardModule.removeEnvironment("snap_123")).toBe(false);
  });
});
