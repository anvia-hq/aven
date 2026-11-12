import type { HeatmapCell, HeatmapWeek, Point, ProfileDay } from "./types";

const DAY = 86_400_000;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const HEATMAP_WEEKS = 53;
export const WINDOW_DAYS = HEATMAP_WEEKS * 7;

export const dayOf = (time: number) => new Date(time).toISOString().slice(0, 10);

export const startOf = (day: string) => Date.parse(`${day}T00:00:00Z`);

export function handleOf(name: string, email: string) {
  const fromName = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
  return fromName || email.split("@")[0] || "you";
}

export function spanLabel(ms: number) {
  if (ms <= 0) return "—";

  const minutes = Math.round(ms / 60_000);

  if (minutes < 60) return `${Math.max(1, minutes)}m`;

  const hours = ms / 3_600_000;

  if (hours < 24) return `${hours.toFixed(1)}h`;

  const days = Math.floor(hours / 24);
  const rest = Math.round(hours - days * 24);
  return rest > 0 ? `${days}d ${rest}h` : `${days}d`;
}

export function seriesOf(days: readonly ProfileDay[], today: string, windowDays: number) {
  const byDate = new Map(days.map((day) => [day.date, day.tokens]));
  const end = startOf(today);
  const oldest = days.length > 0 ? startOf(days[0]!.date) : end;
  const start = Math.max(oldest, end - (windowDays - 1) * DAY);
  const dates: string[] = [];
  const values: number[] = [];
  for (let time = start; time <= end; time += DAY) {
    const date = dayOf(time);
    dates.push(date);
    values.push(byDate.get(date) ?? 0);
  }
  return { dates, values };
}

export function heatmapWeeks(
  days: readonly ProfileDay[],
  today: string,
  weeks = HEATMAP_WEEKS,
): HeatmapWeek[] {
  const byDate = new Map(days.map((day) => [day.date, day.tokens]));
  const end = startOf(today);
  const firstSunday = end - new Date(end).getUTCDay() * DAY - (weeks - 1) * 7 * DAY;
  const result: HeatmapWeek[] = [];
  let month = -1;
  for (let week = 0; week < weeks; week += 1) {
    const start = firstSunday + week * 7 * DAY;
    const monthOf = new Date(start).getUTCMonth();
    const cells: (HeatmapCell | null)[] = [];
    for (let row = 0; row < 7; row += 1) {
      const time = start + row * DAY;

      if (time > end) {
        cells.push(null);
        continue;
      }

      const date = dayOf(time);
      cells.push({ date, tokens: byDate.get(date) ?? 0 });
    }
    result.push({ label: monthOf === month ? null : MONTHS[monthOf]!, cells });
    month = monthOf;
  }
  return result;
}

export function levelOf(tokens: number, most: number) {
  if (tokens <= 0) return 0;

  const share = tokens / Math.max(1, most);

  if (share > 0.75) return 4;

  if (share > 0.5) return 3;

  if (share > 0.25) return 2;

  return 1;
}

export function pointsOf(values: readonly number[], width: number, height: number): Point[] {
  const most = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((value, index) => ({
    x: values.length > 1 ? index * step : width / 2,
    y: height - (value / most) * height,
  }));
}

export const linePath = (points: readonly Point[]) =>
  points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");

export const areaPath = (points: readonly Point[], height: number) =>
  points.length === 0
    ? ""
    : `${linePath(points)} L${points.at(-1)!.x} ${height} L${points[0]!.x} ${height} Z`;

export const chartDate = (date: string) => {
  const [, month, day] = date.split("-");
  return `${MONTHS[Number(month) - 1]} ${Number(day)}`;
};
