import type { ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

const LINES = 12;

type Sample = {
  present: boolean;
  lines: number;
  // Distance from the bottom of the last assistant line to the top of the indicator.
  gap: number | null;
  // The indicator's top in the scrolling content's own coordinates (ignores scrolling).
  contentY: number | null;
};

// Recorded on purpose: the video is the proof this spec leaves behind.
test.use({
  viewport: { width: 1000, height: 700 },
  video: { mode: "on", size: { width: 1000, height: 700 } },
});

test.describe("the working indicator while a reply streams", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("stays directly under the last streamed line, without moving", async ({
    page,
  }, testInfo) => {
    await registerUser(page, "wur", "Working Person");
    const provider = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(provider.ok()).toBe(true);
    const { child, threadId } = await threadOnFakeRunner(page, {
      FAKE_STREAM_LINES: String(LINES),
      FAKE_STREAM_MS: "800",
    });
    runner = child;

    await page.goto(`/threads/${threadId}`);
    await page.getByRole("textbox", { name: "Prompt" }).fill("walk me through the plan");
    await page.getByRole("button", { name: "Send" }).click();

    const lineCount = () => page.locator('[data-role="assistant"] li').count();
    await expect.poll(lineCount, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    await page.evaluate(() => {
      const samples: Sample[] = [];
      (window as unknown as { __samples: Sample[]; __stop: boolean }).__samples = samples;
      (window as unknown as { __stop: boolean }).__stop = false;
      const frame = () => {
        const w = window as unknown as { __stop: boolean };
        if (w.__stop) return;
        const indicator = document.querySelector<HTMLElement>('[data-role="working"]');
        const assistants = document.querySelectorAll<HTMLElement>('[data-role="assistant"]');
        const last = assistants[assistants.length - 1];
        const scroller = indicator?.closest<HTMLElement>(".overflow-y-auto") ?? null;
        const lines = document.querySelectorAll('[data-role="assistant"] li').length;
        if (indicator) {
          const top = indicator.getBoundingClientRect().top;
          const bottom = last?.getBoundingClientRect().bottom;
          const scrollerTop = scroller?.getBoundingClientRect().top ?? 0;
          samples.push({
            present: true,
            lines,
            gap: bottom === undefined ? null : Math.round((top - bottom) * 10) / 10,
            contentY: Math.round((top - scrollerTop + (scroller?.scrollTop ?? 0)) * 10) / 10,
          });
        } else {
          samples.push({ present: false, lines, gap: null, contentY: null });
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });

    // Screenshot while the reply is part way through.
    await expect.poll(lineCount, { timeout: 15_000 }).toBeGreaterThanOrEqual(5);
    await page.screenshot({ path: testInfo.outputPath("mid-stream.png") });

    await expect(page.getByRole("status").filter({ hasText: "Working" })).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect.poll(lineCount).toBe(LINES);
    await page.waitForTimeout(300);
    await page.screenshot({ path: testInfo.outputPath("done.png") });
    await page.evaluate(() => {
      (window as unknown as { __stop: boolean }).__stop = true;
    });

    const samples = await page.evaluate(
      () => (window as unknown as { __samples: Sample[] }).__samples,
    );
    const streaming = samples.filter((sample) => sample.lines >= 1 && sample.lines < LINES);
    testInfo.annotations.push({
      type: "samples",
      description: `${samples.length} frames, ${streaming.length} while streaming`,
    });
    expect(streaming.length).toBeGreaterThan(10);
    // The indicator is there for every frame of the stream.
    expect(streaming.every((sample) => sample.present)).toBe(true);

    const gaps = streaming.map((sample) => sample.gap);
    const contentYs = streaming.map((sample) => sample.contentY);
    // Glued to the last line: the gap never changes while lines are added.
    expect(Math.max(...(gaps as number[])) - Math.min(...(gaps as number[]))).toBeLessThanOrEqual(
      1,
    );
    expect(Math.max(...(gaps as number[]))).toBeLessThan(40);
    // Never moves up in the content, and only moves down as lines are added.
    for (let index = 1; index < contentYs.length; index += 1) {
      expect(contentYs[index]!).toBeGreaterThanOrEqual(contentYs[index - 1]! - 0.5);
    }
  });
});
