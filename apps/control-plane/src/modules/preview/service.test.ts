import { describe, expect, test } from "bun:test";

import { LOCAL_RUNTIME_ID } from "../runtimes/local-id";
import { createPreviewService, previewRefusal, previewUrl } from "./service";
import type { PreviewClaims, PreviewSettings } from "./types";
import type { ViewerHandle, ViewerSink } from "../runtimes/types";

const remote = "00000000-0000-4000-8000-0000000000ff";
const settings: PreviewSettings = {
  domain: "aven.run",
  port: 8001,
  hostname: "127.0.0.1",
  secret: new Uint8Array(32).fill(7),
};
const sink: ViewerSink = { data: () => undefined, closed: () => undefined };
const handle: ViewerHandle = { write: () => undefined, close: () => undefined };

function service(overrides: Partial<Parameters<typeof createPreviewService>[0]> = {}) {
  return createPreviewService({
    settings,
    usable: async () => true,
    online: () => true,
    openPort: () => handle,
    env: {},
    ...overrides,
  });
}

describe("opening a port", () => {
  test("answers a ticket for the embedded panel and one for a new tab", async () => {
    const answer = await service().open("org", "user", remote, 3000);
    for (const url of [answer.url, answer.embedUrl]) {
      expect(url).toStartWith(`https://3000-${remote}.aven.run/__aven/enter?ticket=`);
    }
    expect(answer.url).not.toContain("embed=1");
    expect(answer.embedUrl).toEndWith("&embed=1");
    expect(answer.url).not.toBe(answer.embedUrl);
  });

  test("says it is not set up without a domain", async () => {
    const off = service({ settings: { ...settings, domain: undefined } });
    await expect(off.open("org", "user", remote, 3000)).rejects.toThrow("not set up");
  });

  test("refuses a port another service owns", async () => {
    for (const port of [22, 2375, 5432, 6379, 3389, 5900]) {
      await expect(service().open("org", "user", remote, port)).rejects.toThrow("not a preview");
    }
  });

  test("refuses the control plane's own ports on the built-in runner, and only there", async () => {
    const env = { PORT: "8000", AVEN_API_PORT: "2837", AVEN_PREVIEW_PORT: "8001" };
    for (const port of [8000, 2837, 8001]) {
      await expect(service({ env }).open("org", "user", LOCAL_RUNTIME_ID, port)).rejects.toThrow(
        "own on this machine",
      );
      const answer = await service({ env }).open("org", "user", remote, port);
      expect(answer.url).toContain(`https://${port}-`);
    }
  });

  test("refuses a runner the person may not use, and one that is offline", async () => {
    await expect(
      service({ usable: async () => false }).open("org", "user", remote, 3000),
    ).rejects.toThrow("not one you can use");
    await expect(
      service({ online: () => false }).open("org", "user", remote, 3000),
    ).rejects.toThrow("offline");
  });
});

describe("relaying to a port", () => {
  test("opens the runner's port with the claims the host names", async () => {
    const opened: PreviewClaims[] = [];
    const relay = service({
      openPort: (runtimeId, port, given) => {
        opened.push({ runtimeId, port });
        expect(given).toBe(sink);
        return handle;
      },
    });
    await relay.relay({ runtimeId: remote, port: 3000 }, sink);
    expect(opened).toEqual([{ runtimeId: remote, port: 3000 }]);
  });

  test("is refused for a port the denylist names", async () => {
    await expect(service().relay({ runtimeId: remote, port: 22 }, sink)).rejects.toThrow(
      "not a preview",
    );
  });
});

describe("a preview's own answers", () => {
  test("name the port and runtime id under the domain", () => {
    expect(previewUrl("aven.run", { runtimeId: remote, port: 5173 }, "t", false)).toBe(
      `https://5173-${remote}.aven.run/__aven/enter?ticket=t`,
    );
    expect(previewUrl("aven.run", { runtimeId: remote, port: 5173 }, "t", true)).toEndWith(
      "&embed=1",
    );
  });

  test("refuse a port that is not one before anything else", () => {
    expect(previewRefusal(0, remote, {})).toBe("That is not a port");
    expect(previewRefusal(3000, remote, {})).toBeUndefined();
  });
});
