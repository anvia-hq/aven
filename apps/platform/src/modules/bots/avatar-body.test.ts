import { describe, expect, test } from "bun:test";

import { bodyOf, paintedBody } from "./avatar-body";
import { families } from "./avatar";
import { shapeOf } from "./avatar-shapes";

describe("paintedBody", () => {
  const base = bodyOf(shapeOf(families[0]!));

  test("gives every avatar its own index and attribute buffers, so disposing one cannot strip another", () => {
    const first = paintedBody(base, "#ff8800");
    const second = paintedBody(base, "#0088ff");

    expect(first.getIndex()).not.toBe(second.getIndex());
    expect(first.getAttribute("position")).not.toBe(second.getAttribute("position"));
    expect(first.getAttribute("normal")).not.toBe(second.getAttribute("normal"));
    expect(first.getIndex()).not.toBe(base.geometry.getIndex());
  });

  test("keeps the same shape as the base", () => {
    const painted = paintedBody(base, "#ff8800");

    expect(Array.from(painted.getAttribute("position").array)).toEqual(
      Array.from(base.geometry.getAttribute("position").array),
    );
    expect(painted.getIndex()?.count).toBe(base.geometry.getIndex()?.count);
  });
});
