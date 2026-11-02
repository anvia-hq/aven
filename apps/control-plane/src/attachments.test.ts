import { describe, expect, test } from "bun:test";
import { ATTACHMENT_LIMITS } from "@aven/protocol/events";
import { ARTIFACT_NAME } from "@aven/protocol/runtime-wire";

import { prepareAttachments } from "./attachments";
import { UnprocessableError } from "./errors";
import { sendMessageBody } from "./modules/threads/schema";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const base64 = (bytes: number[] | Uint8Array) => Uint8Array.from(bytes).toBase64();
const sized = (size: number, head: number[] = []) => {
  const bytes = new Uint8Array(size);
  bytes.set(head);
  return bytes.toBase64();
};

describe("prepareAttachments", () => {
  test("an image, known by its bytes, is named for the runner's copy; any other file is not", () => {
    const [image, pdf, svg] = prepareAttachments([
      { name: "shot.png", mediaType: "application/octet-stream", data: base64([...PNG, 1, 2]) },
      { name: "spec.pdf", mediaType: "application/pdf", data: base64([0x25, 0x50, 0x44, 0x46]) },
      { name: "logo.svg", mediaType: "image/svg+xml", data: base64([0x3c, 0x73, 0x76, 0x67]) },
    ]);
    expect(image).toMatchObject({ name: "shot.png", mediaType: "image/png", size: 10 });
    expect(ARTIFACT_NAME.test(image?.image ?? "")).toBe(true);
    expect(pdf).toMatchObject({ name: "spec.pdf", mediaType: "application/pdf", size: 4 });
    expect(pdf?.image).toBeUndefined();
    // An SVG can carry script, so it is never shown back: only the sandbox gets it.
    expect(svg?.image).toBeUndefined();
  });

  test("a file the browser could not type is sent as bytes", () => {
    const [file] = prepareAttachments([{ name: "data.bin", data: base64([1, 2, 3]) }]);
    expect(file?.mediaType).toBe("application/octet-stream");
  });

  test("refuses an image larger than a model takes, and files that add up to too much", () => {
    const big = { name: "big.png", data: sized(ATTACHMENT_LIMITS.imageBytes + 1, PNG) };
    expect(() => prepareAttachments([big])).toThrow(UnprocessableError);
    // A file that is not an image may be that large.
    const doc = { name: "big.pdf", data: sized(ATTACHMENT_LIMITS.imageBytes + 1) };
    expect(prepareAttachments([doc])).toHaveLength(1);
    expect(() => prepareAttachments([doc, doc])).toThrow("can add up to 10 MB");
  });
});

describe("sendMessageBody", () => {
  test("takes a message of files alone, but not one with nothing in it", () => {
    const file = { name: "a.txt", data: base64([104, 105]) };
    expect(sendMessageBody.safeParse({ prompt: "", attachments: [file] }).success).toBe(true);
    expect(sendMessageBody.safeParse({ prompt: "  " }).success).toBe(false);
    expect(sendMessageBody.safeParse({ prompt: "", attachments: [] }).success).toBe(false);
  });

  test("refuses more files than a message carries and bytes that are not base64", () => {
    const file = { name: "a.txt", data: base64([104, 105]) };
    const many = Array.from({ length: ATTACHMENT_LIMITS.count + 1 }, () => file);
    expect(sendMessageBody.safeParse({ prompt: "x", attachments: many }).success).toBe(false);
    const garbled = { name: "a.txt", data: "not base64!" };
    expect(sendMessageBody.safeParse({ prompt: "x", attachments: [garbled] }).success).toBe(false);
  });
});
