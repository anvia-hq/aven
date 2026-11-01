import { describe, expect, test } from "bun:test";

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
