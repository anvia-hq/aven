import { expect, test } from "bun:test";

import { commitChips, periodLabel } from "./commit-filters";

const day = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const now = new Date(2026, 10, 10, 12).getTime();

test("a period is named when it is one of the presets, else by its days", () => {
  expect(periodLabel({}, now)).toBeUndefined();
  expect(periodLabel({ since: day(new Date(2026, 10, 10)) }, now)).toBe("Today");
  expect(periodLabel({ since: day(new Date(2026, 10, 3)) }, now)).toBe("Last 7 days");
  expect(periodLabel({ since: day(new Date(2026, 9, 11)) }, now)).toBe("Last 30 days");
  expect(periodLabel({ since: "2026-11-01", until: "2026-11-05" }, now)).toBe(
    "2026-11-01 → 2026-11-05",
  );
  expect(periodLabel({ since: "2026-11-01" }, now)).toBe("2026-11-01 → now");
});

test("every filter that is on is a chip that takes only it off", () => {
  const changes: object[] = [];
  const chips = commitChips(
    { grep: "login", commitAuthor: "ada", since: "2020-01-01", path: "src/a.ts", branch: "dev" },
    (next) => changes.push(next),
  );
  expect(chips.map((chip) => chip.label)).toEqual([
    "“login”",
    "By ada",
    "2020-01-01 → now",
    "File: src/a.ts",
    "Branch: dev",
  ]);
  chips[1]!.remove();
  chips[2]!.remove();
  expect(changes).toEqual([{ commitAuthor: undefined }, { since: undefined, until: undefined }]);
  expect(commitChips({}, () => undefined)).toEqual([]);
});
