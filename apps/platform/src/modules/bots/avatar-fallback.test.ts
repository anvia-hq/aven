import { describe, expect, test } from "bun:test";

import { isSoftwareRenderer } from "./avatar-fallback";

describe("a software renderer", () => {
  test("is the one a browser without a graphics card draws WebGL with", () => {
    for (const name of [
      "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)",
      "llvmpipe (LLVM 15.0.7, 256 bits)",
      "Microsoft Basic Render Driver",
      "Mesa softpipe",
    ]) {
      expect(isSoftwareRenderer(name)).toBe(true);
    }
  });

  test("is not a graphics card", () => {
    for (const name of [
      "ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)",
      "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)",
      "Mesa Intel(R) UHD Graphics 620 (KBL GT2)",
    ]) {
      expect(isSoftwareRenderer(name)).toBe(false);
    }
  });
});
