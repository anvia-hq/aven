import { describe, expect, test } from "bun:test";

import { decodeViewerFrame } from "@aven/protocol/viewer-frame";

import { ViewerStreams } from "./viewer-streams";
import type { ControlPlaneToRuntime } from "@aven/protocol/types";
import type { ViewerSink } from "./types";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

function setup() {
  const posted: ControlPlaneToRuntime[] = [];
  const frames: Uint8Array[] = [];
  const closed: string[] = [];
  const sink: ViewerSink = { data: () => undefined, closed: (reason) => void closed.push(reason) };
  const streams = new ViewerStreams(
    (message) => void posted.push(message),
    (frame) => void frames.push(frame),
    () => false,
  );
  const viewerIdOf = () => (posted[0] as { viewerId: string }).viewerId;
  const sent = () =>
    frames.map((frame) => decoder.decode(decodeViewerFrame(frame)!.payload)).join("");
  return { streams, posted, frames, closed, sink, viewerIdOf, sent };
}

describe("a port's viewer", () => {
  test("holds what is written before the runner opens the port, and sends it in order once it has", () => {
    const { streams, sink, viewerIdOf, sent, frames } = setup();
    const handle = streams.openPort("runtime", 3000, sink);

    handle.write(encoder.encode("GET / HTTP/1.1\r\n\r\n"));
    handle.write(encoder.encode("body"));
    expect(frames).toEqual([]);

    streams.opened(viewerIdOf(), "port");
    expect(sent()).toBe("GET / HTTP/1.1\r\n\r\nbody");

    handle.write(encoder.encode("more"));
    expect(sent()).toBe("GET / HTTP/1.1\r\n\r\nbodymore");
  });

  test("is closed, and the runner told, when too much is held before the port opens", () => {
    const { streams, sink, posted, closed, frames } = setup();
    const handle = streams.openPort("runtime", 3000, sink);

    handle.write(new Uint8Array(1024 * 1024));
    expect(closed).toEqual([]);

    handle.write(new Uint8Array(1));
    expect(closed).toEqual(["Too much was sent before the port opened"]);
    expect(posted.at(-1)).toMatchObject({ type: "port.close" });
    expect(frames).toEqual([]);
  });

  test("forgets what was held when the runner says the port closed", () => {
    const { streams, sink, viewerIdOf, closed, frames } = setup();
    const handle = streams.openPort("runtime", 3000, sink);
    handle.write(encoder.encode("hello"));

    streams.closed(viewerIdOf(), "port", "refused");
    streams.opened(viewerIdOf(), "port");

    expect(closed).toEqual(["refused"]);
    expect(frames).toEqual([]);
  });

  test("does not mix with a terminal's id", () => {
    const { streams, sink, viewerIdOf, frames } = setup();
    const handle = streams.openPort("runtime", 3000, sink);
    handle.write(encoder.encode("hello"));

    streams.opened(viewerIdOf(), "terminal");
    expect(frames).toEqual([]);
  });
});
