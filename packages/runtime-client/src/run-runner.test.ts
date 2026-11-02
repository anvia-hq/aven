import { describe, expect, test } from "bun:test";

import { controlPlaneBase } from "./runner";
import { runtimeConnectUrl } from "./run-runner";

describe("runtimeConnectUrl", () => {
  test("turns the control plane's address into the runner's WebSocket", () => {
    expect(runtimeConnectUrl("http://localhost:8000")).toBe("ws://localhost:8000/runtimes/connect");
    expect(runtimeConnectUrl("https://aven.example.com/")).toBe(
      "wss://aven.example.com/runtimes/connect",
    );
  });

  test("keeps a path, as behind the web entry point's /api", () => {
    expect(runtimeConnectUrl("https://aven.example.com/api")).toBe(
      "wss://aven.example.com/api/runtimes/connect",
    );
  });
});

describe("controlPlaneBase", () => {
  test("is the address the runner connects to, with an http scheme and without /runtimes/connect", () => {
    expect(controlPlaneBase("ws://localhost:8000/runtimes/connect")).toBe("http://localhost:8000");
    expect(controlPlaneBase("wss://aven.example.com/runtimes/connect")).toBe(
      "https://aven.example.com",
    );
  });

  test("keeps the prefix the API is served under, so the model gateway is reached through it", () => {
    // Behind the web entry point /runtimes/gateway alone is the web app, which answers 405.
    expect(controlPlaneBase("wss://aven.example.com/api/runtimes/connect")).toBe(
      "https://aven.example.com/api",
    );
    expect(controlPlaneBase(runtimeConnectUrl("https://aven.example.com/api/"))).toBe(
      "https://aven.example.com/api",
    );
  });
});
