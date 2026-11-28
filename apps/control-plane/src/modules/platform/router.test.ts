import { afterEach, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import { communityEdition } from "../../edition/community";
import { editionInUse } from "../../edition/current";
import { platformRouter } from "./router";

const run = process.env.DATABASE_URL ? describe : describe.skip;

const noopPutAway = () => {};

run("GET /platform/config version and updateTo", () => {
  const versionBefore = process.env.AVEN_VERSION;

  afterEach(() => {
    editionInUse.current = communityEdition;

    if (versionBefore === undefined) delete process.env.AVEN_VERSION;
    else process.env.AVEN_VERSION = versionBefore;
  });

  async function readConfig(latestVersion: string | undefined, onAsk?: () => void) {
    const app = new Elysia().use(
      platformRouter(noopPutAway, {
        async get() {
          onAsk?.();
          return latestVersion;
        },
      }),
    );
    const response = await app.handle(new Request("http://localhost/platform/config"));
    expect(response.status).toBe(200);
    return (await response.json()) as { version: string | null; updateTo: string | null };
  }

  test("reports updateTo when the server release is behind the newest release", async () => {
    process.env.AVEN_VERSION = "0.5.6";
    const body = await readConfig("0.5.9");
    expect(body.version).toBe("0.5.6");
    expect(body.updateTo).toBe("0.5.9");
  });

  test("returns updateTo null when the server is already on or ahead of the newest release", async () => {
    process.env.AVEN_VERSION = "0.5.9";
    const body = await readConfig("0.5.9");
    expect(body.version).toBe("0.5.9");
    expect(body.updateTo).toBeNull();
  });

  test("skips release lookup and returns nulls when running from source without a release version", async () => {
    delete process.env.AVEN_VERSION;
    let asked = 0;
    const body = await readConfig("0.5.9", () => {
      asked += 1;
    });
    expect(body.version).toBeNull();
    expect(body.updateTo).toBeNull();
    expect(asked).toBe(0);
  });

  test("hides server updates when the edition hides platform settings", async () => {
    process.env.AVEN_VERSION = "0.5.6";
    editionInUse.current = { ...communityEdition, hidePlatformSettings: true };
    let asked = 0;
    const body = await readConfig("0.5.9", () => {
      asked += 1;
    });
    expect(body.version).toBe("0.5.6");
    expect(body.updateTo).toBeNull();
    expect(asked).toBe(0);
  });
});
