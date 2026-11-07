const NICKNAMES: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};
const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
const WEEKDAYS = "sun mon tue wed thu fri sat".split(" ");
const MAX_DAYS_AHEAD = 366 * 8;
const MINUTE_MS = 60_000;

type Field = { values: number[]; any: boolean };
type Cron = {
  minute: Field;
  hour: Field;
  day: Field;
  month: Field;
  weekday: Field;
};

export class CronError extends Error {}

function upperBound(range: {
  range: string;
  to: string | undefined;
  step: string | undefined;
  low: number;
  max: number;
  number: (part: string) => number;
}) {
  if (range.range === "*") return range.max;
  if (range.to !== undefined) return range.number(range.to);
  if (range.step !== undefined) return range.max;
  return range.low;
}

function parseField(
  text: string,
  name: string,
  min: number,
  max: number,
  names: string[] = [],
  offset = 0,
): Field {
  const bad = () => new CronError(`Invalid ${name} field "${text}".`);
  const number = (part: string) => {
    const index = names.indexOf(part.toLowerCase());
    let value = Number.NaN;
    if (index >= 0) value = index + offset;
    else if (/^\d+$/.test(part)) value = Number(part);
    if (!Number.isInteger(value) || value < min || value > max) throw bad();
    return value;
  };
  const values = new Set<number>();
  for (const item of text.split(",")) {
    const [range = "", step, extra] = item.split("/");
    if (extra !== undefined || item === "") throw bad();
    const stride = step === undefined ? 1 : Number(step);
    if (!Number.isInteger(stride) || stride < 1 || !/^\d*$/.test(step ?? "")) throw bad();
    const [from, to, more] = range.split("-");
    if (more !== undefined) throw bad();
    const low = range === "*" ? min : number(from ?? "");
    const high = upperBound({ range, to, step, low, max, number });
    if (low > high) throw bad();
    for (let value = low; value <= high; value += stride) values.add(value);
  }
  return { values: [...values].sort((a, b) => a - b), any: text === "*" };
}

export function parseCron(expression: string): Cron {
  const text = NICKNAMES[expression.trim().toLowerCase()] ?? expression;
  const parts = text.trim().split(/\s+/);
  if (parts.length !== 5)
    throw new CronError(
      "A schedule needs 5 fields: minute hour day-of-month month day-of-week, for example `0 7 * * *`.",
    );
  const [minute, hour, day, month, weekday] = parts as [string, string, string, string, string];
  const days = parseField(weekday, "day-of-week", 0, 7, WEEKDAYS);
  return {
    minute: parseField(minute, "minute", 0, 59),
    hour: parseField(hour, "hour", 0, 23),
    day: parseField(day, "day-of-month", 1, 31),
    month: parseField(month, "month", 1, 12, MONTHS, 1),
    weekday: {
      ...days,
      values: [...new Set(days.values.map((value) => value % 7))],
    },
  };
}

export function minimumGapMinutes(expression: string) {
  const { hour, minute } = parseCron(expression);
  const times = hour.values
    .flatMap((h) => minute.values.map((m) => h * 60 + m))
    .sort((a, b) => a - b);
  let least = 24 * 60 + times[0]! - times.at(-1)!;
  for (let index = 1; index < times.length; index++) {
    least = Math.min(least, times[index]! - times[index - 1]!);
  }
  return least;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

export function checkTimezone(timezone: string) {
  try {
    zoneFormatter(timezone);
  } catch {
    throw new CronError(`Unknown timezone "${timezone}". Use an IANA name such as Asia/Jakarta.`);
  }
}

function zoneFormatter(timezone: string) {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timezone, formatter);
  }
  return formatter;
}

function offsetAt(timeMs: number, timezone: string) {
  const parts = Object.fromEntries(
    zoneFormatter(timezone)
      .formatToParts(new Date(timeMs))
      .map((part) => [part.type, Number(part.value)]),
  );
  const wall = Date.UTC(
    parts.year!,
    parts.month! - 1,
    parts.day!,
    parts.hour!,
    parts.minute!,
    parts.second!,
  );
  return wall - Math.floor(timeMs / 1000) * 1000;
}

function instantOf(wallMs: number, timezone: string) {
  const first = wallMs - offsetAt(wallMs, timezone);
  const exact = wallMs - offsetAt(first, timezone);
  return exact + offsetAt(exact, timezone) === wallMs ? exact : first;
}

function matches(field: Field, value: number) {
  return field.values.includes(value);
}

function dayMatches(cron: Cron, date: Date) {
  const day = matches(cron.day, date.getUTCDate());
  const weekday = matches(cron.weekday, date.getUTCDay());
  if (!matches(cron.month, date.getUTCMonth() + 1)) return false;
  return !cron.day.any && !cron.weekday.any ? day || weekday : day && weekday;
}

export function nextRun(expression: string, timezone: string, after: Date): Date | null {
  const cron = parseCron(expression);
  checkTimezone(timezone);
  const afterMs = Math.floor(after.getTime() / MINUTE_MS) * MINUTE_MS;
  const localStart = new Date(afterMs + offsetAt(afterMs, timezone));
  const firstDay = Date.UTC(
    localStart.getUTCFullYear(),
    localStart.getUTCMonth(),
    localStart.getUTCDate(),
  );
  for (let ahead = 0; ahead <= MAX_DAYS_AHEAD; ahead++) {
    const dayMs = firstDay + ahead * 86_400_000;
    if (!dayMatches(cron, new Date(dayMs))) continue;
    for (const hour of cron.hour.values)
      for (const minute of cron.minute.values) {
        const instant = instantOf(dayMs + hour * 3_600_000 + minute * MINUTE_MS, timezone);
        if (instant > afterMs) return new Date(instant);
      }
  }
  return null;
}

export function systemTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function describeTime(time: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).format(time);
}
