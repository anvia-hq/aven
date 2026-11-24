import { afterEach, describe, expect, test } from "bun:test";

import { boatModule } from "./boat/module";
import { lizardModule } from "./lizard/module";
import { setSandboxSettings } from "./settings";
import { spacesModule } from "./spaces/module";
import { spritesModule } from "./sprites/module";

afterEach(() => setSandboxSettings(null));

describe("provider safety and capabilities", () => {
  test("boat, spaces, lizard, and sprites declare expected capabilities", () => {
    expect(boatModule.capabilities.stopMode).toBe("native_resume");
    expect(spacesModule.capabilities.stopMode).toBe("native_resume");
    expect(lizardModule.capabilities.stopMode).toBe("native_resume");
    expect(spritesModule.capabilities.stopMode).toBe("native_resume");
    expect(lizardModule.capabilities.supportsMaxLifetime).toBe(true);
    expect(spritesModule.capabilities.supportsMaxLifetime).toBe(true);
  });

  test("removeEnvironment returns false when no credentials are available instead of leaking remote snapshots", async () => {
    setSandboxSettings(null);
    expect(await boatModule.removeEnvironment("aven-project-1")).toBe(false);
    expect(await spacesModule.removeEnvironment("aven-project-1")).toBe(false);
    expect(await lizardModule.removeEnvironment("snap_123")).toBe(false);
  });

  test("sprites reports no environment, since a checkpoint cannot become a new computer", async () => {
    setSandboxSettings(null);
    expect(await spritesModule.saveEnvironment("aven-abc", "aven-project-1")).toMatchObject({
      status: "failed",
    });
    expect(await spritesModule.readEnvironment("aven-project-1")).toBeNull();
    expect(await spritesModule.removeEnvironment("aven-project-1")).toBe(true);
  });
});
