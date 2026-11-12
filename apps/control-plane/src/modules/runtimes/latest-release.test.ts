import { describe, expect, test } from "bun:test";

import { createLatestRelease } from "./latest-release";

function setup(answers: Array<string | Error>) {
  let now = 0;
  let asked = 0;
  const fetchFn = (async () => {
    const answer = answers[Math.min(asked++, answers.length - 1)]!;

    if (answer instanceof Error) throw answer;

    return new Response(null, { status: 302, headers: { location: answer } });
  }) as unknown as typeof fetch;
  const latest = createLatestRelease({ fetchFn, now: () => now, url: "https://x.test/releases/" });
  return { latest, asked: () => asked, at: (ms: number) => (now = ms) };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the latest release (decision 0148)", () => {
  test("reads the tag from GitHub's redirect, and asks again after an hour without making anyone wait", async () => {
    const t = setup(["https://x.test/releases/tag/v0.5.7", "https://x.test/releases/tag/v0.6.0"]);
    expect(await t.latest.get()).toBe("0.5.7");
    expect(await t.latest.get()).toBe("0.5.7");
    expect(t.asked()).toBe(1);
    t.at(61 * 60_000);
    expect(await t.latest.get()).toBe("0.5.7");
    await settled();
    expect(await t.latest.get()).toBe("0.6.0");
    expect(t.asked()).toBe(2);
  });

  test("shares one question between callers, and says nothing when it cannot be asked", async () => {
    const t = setup([new Error("offline"), "https://x.test/releases/tag/v0.5.7"]);
    expect(await Promise.all([t.latest.get(), t.latest.get()])).toEqual([undefined, undefined]);
    expect(t.asked()).toBe(1);
    t.at(6 * 60_000);
    await t.latest.get();
    await settled();
    expect(await t.latest.get()).toBe("0.5.7");
  });

  test("keeps the last release it found when a later question fails", async () => {
    const t = setup(["https://x.test/releases/tag/v0.5.7", new Error("offline")]);
    expect(await t.latest.get()).toBe("0.5.7");
    t.at(61 * 60_000);
    await t.latest.get();
    await settled();
    expect(await t.latest.get()).toBe("0.5.7");
  });

  test("ignores an answer that is not a release number", async () => {
    const t = setup(["https://x.test/releases/tag/nightly"]);
    expect(await t.latest.get()).toBeUndefined();
  });

  test("asks the address it was given, whatever trailing slashes it has", async () => {
    const urls: string[] = [];
    const latest = createLatestRelease({
      fetchFn: (async (input: string | URL | Request) => {
        urls.push(String(input));
        return new Response(null, { status: 302, headers: { location: "/x/releases/tag/v1.2.3" } });
      }) as unknown as typeof fetch,
      url: "https://x.test/releases///",
    });
    expect(await latest.get()).toBe("1.2.3");
    expect(urls).toEqual(["https://x.test/releases/latest"]);
  });
});
