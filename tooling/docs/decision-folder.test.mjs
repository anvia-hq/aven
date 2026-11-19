import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dir, "..", "..", "docs", "decision");
const NAME = /^\d{4}-[a-z0-9]+(-[a-z0-9]+)*\.md$/;
const ROW = /^\|\s*(\d{4})\s*\|.+\|\s*(\d{4})/gm;
const IN_PART = /superseded in part by (?:decision )?(\d{4})|partly superseded by (\d{4})/i;
const WHOLE = /superseded by (?:decision )?(\d{4})/i;

const files = readdirSync(DIR).filter((file) => file.endsWith(".md") && file !== "README.md");

const read = (file) => readFileSync(join(DIR, file), "utf8");

const head = (file) => read(file).split("\n").slice(0, 22);

const status = (file) => {
  const line = head(file).find((one) => one.startsWith("Status:"));
  return line ? line.slice("Status:".length).trim() : "";
};

const mark = (file) => {
  const line = status(file);
  const part = line.match(IN_PART);

  if (part) {
    return ["in part", part[1] ?? part[2]];
  }

  const whole = line.match(WHOLE);

  return whole ? ["whole", whole[1]] : null;
};

const byNumber = new Map(files.map((file) => [file.slice(0, 4), file]));

const matching = (matches) => files.filter(matches);

const marked = (kind) =>
  files.flatMap((file) => (mark(file)?.[0] === kind ? [file.slice(0, 4)] : []));

const listed = (heading) => {
  const readme = readFileSync(join(DIR, "README.md"), "utf8");
  const section = readme.split(/^## /m).find((part) => part.startsWith(heading));

  return section ? [...section.matchAll(ROW)].map((row) => [row[1], row[2]]) : [];
};

const sorted = (numbers) => [...numbers].sort();

const repeated = () => {
  const seen = new Map();
  for (const file of files) {
    const number = file.slice(0, 4);
    const same = seen.get(number);
    seen.set(number, same ? [...same, file] : [file]);
  }

  return [...seen.entries()].flatMap(([number, same]) =>
    same.length > 1 ? [`${number}: ${same}`] : [],
  );
};

describe("the decisions folder", () => {
  test("names each file with four digits and a kebab-case name", () => {
    expect(matching((file) => !NAME.test(file))).toEqual([]);
  });

  test("uses each number once", () => {
    expect(repeated()).toEqual([]);
  });

  test("starts each file with a title and one Status line", () => {
    const wrong = matching(
      (file) =>
        !head(file)[0].startsWith("# ") ||
        !status(file) ||
        read(file)
          .split("\n")
          .filter((line) => line.startsWith("Status:")).length !== 1,
    );

    expect(wrong).toEqual([]);
  });

  test("leaves the number out of the title", () => {
    expect(matching((file) => /^# \d{4}\b/.test(head(file)[0]))).toEqual([]);
  });

  test("names every wholly superseded decision in the README, and nothing else", () => {
    expect(sorted(listed("Superseded (").map(([number]) => number))).toEqual(
      sorted(marked("whole")),
    );
  });

  test("names every partly superseded decision in the README, and nothing else", () => {
    expect(sorted(listed("Superseded in part (").map(([number]) => number))).toEqual(
      sorted(marked("in part")),
    );
  });

  test("gives each row the first replacement its own Status line names", () => {
    const wrong = [...listed("Superseded ("), ...listed("Superseded in part (")].flatMap(
      ([number, replacement]) => {
        const file = byNumber.get(number);
        const named = file ? mark(file)?.[1] : undefined;

        return named === replacement
          ? []
          : [`${number} says ${replacement}, its Status says ${named}`];
      },
    );

    expect(wrong).toEqual([]);
  });

  test("counts in each heading, and in the prose, the rows it lists", () => {
    const readme = readFileSync(join(DIR, "README.md"), "utf8");
    const heading = readme.match(/^## Superseded \((\d+)\)/m);
    const partHeading = readme.match(/^## Superseded in part \((\d+)\)/m);
    const claimed = readme.match(
      /^(\d+) decisions: (\d+) are the answer, (\d+) are superseded and (\d+) are superseded in part/m,
    );

    expect(heading?.[1]).toBe(String(listed("Superseded (").length));
    expect(partHeading?.[1]).toBe(String(listed("Superseded in part (").length));
    expect(claimed?.[1]).toBe(String(files.length));
    expect(claimed?.[2]).toBe(
      String(files.length - marked("whole").length - marked("in part").length),
    );
    expect(claimed?.[3]).toBe(String(marked("whole").length));
    expect(claimed?.[4]).toBe(String(marked("in part").length));
  });
});
