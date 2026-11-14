import { compactNumber, initials } from "@/lib/format";

import {
  areaPath,
  chartDate,
  handleOf,
  heatmapWeeks,
  levelOf,
  linePath,
  pointsOf,
  seriesOf,
  spanLabel,
  WINDOW_DAYS,
} from "../activity";
import type { ProfileStats } from "../types";

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;
const MARGIN = 72;
const AVATAR_SIZE = 144;
const HEATMAP_CELL = 12;
const HEATMAP_GAP = 5;
const CHART_TOP_PADDING = 16;

type CaptureColors = {
  background: string;
  foreground: string;
  mutedForeground: string;
  border: string;
  card: string;
  chart: string;
  muted: string;
  brand: string;
};

type DrawTextOptions = {
  size: number;
  weight?: number;
  color: string;
  align?: CanvasTextAlign;
  maxWidth?: number;
};

const readColors = (): CaptureColors => {
  const styles = getComputedStyle(document.documentElement);

  const read = (name: string, fallback: string) => {
    const value = styles.getPropertyValue(name).trim();

    return value.length > 0 ? value : fallback;
  };

  return {
    background: read("--background", "#fafafa"),
    foreground: read("--foreground", "#222222"),
    mutedForeground: read("--muted-foreground", "#757575"),
    border: read("--border", "#e2e2e2"),
    card: read("--card", "#ffffff"),
    chart: read("--chart", "#22a06b"),
    muted: read("--muted", "#eeeeee"),
    brand: read("--brand", "#222222"),
  };
};

const loadAvatar = (src: string | null | undefined): Promise<HTMLImageElement | null> => {
  if (!src) return Promise.resolve(null);

  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";

    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);

    image.src = src;
  });
};

const roundRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
};

const drawText = (
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  { size, weight = 400, color, align = "left", maxWidth }: DrawTextOptions,
) => {
  context.font = `${weight} ${size}px ${getComputedStyle(document.body).fontFamily}`;
  context.fillStyle = color;
  context.textAlign = align;
  context.textBaseline = "alphabetic";

  if (maxWidth === undefined) {
    context.fillText(text, x, y);
    return;
  }

  context.fillText(text, x, y, maxWidth);
};

const drawAvatar = (
  context: CanvasRenderingContext2D,
  avatar: HTMLImageElement | null,
  colors: CaptureColors,
  name: string,
  x: number,
  y: number,
) => {
  context.save();
  context.beginPath();
  context.arc(x + AVATAR_SIZE / 2, y + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
  context.clip();

  if (avatar) {
    const side = Math.min(avatar.width, avatar.height);
    context.drawImage(
      avatar,
      (avatar.width - side) / 2,
      (avatar.height - side) / 2,
      side,
      side,
      x,
      y,
      AVATAR_SIZE,
      AVATAR_SIZE,
    );
  } else {
    context.fillStyle = colors.muted;
    context.fillRect(x, y, AVATAR_SIZE, AVATAR_SIZE);
    drawText(context, initials(name), x + AVATAR_SIZE / 2, y + AVATAR_SIZE / 2 + 24, {
      size: 56,
      weight: 600,
      color: colors.mutedForeground,
      align: "center",
    });
  }

  context.restore();
};

const drawHeader = (
  context: CanvasRenderingContext2D,
  colors: CaptureColors,
  name: string,
  email: string,
  avatar: HTMLImageElement | null,
) => {
  drawAvatar(context, avatar, colors, name, MARGIN, MARGIN);
  const textX = MARGIN + AVATAR_SIZE + 32;

  drawText(context, name, textX, MARGIN + 62, {
    size: 56,
    weight: 650,
    color: colors.foreground,
    maxWidth: CARD_WIDTH - textX - MARGIN,
  });
  drawText(context, `@${handleOf(name, email)}`, textX, MARGIN + 110, {
    size: 30,
    color: colors.mutedForeground,
    maxWidth: CARD_WIDTH - textX - MARGIN,
  });

  drawText(context, "Aven", CARD_WIDTH - MARGIN, MARGIN + 52, {
    size: 28,
    weight: 600,
    color: colors.brand,
    align: "right",
  });

  return MARGIN + AVATAR_SIZE + 48;
};

const drawStats = (
  context: CanvasRenderingContext2D,
  colors: CaptureColors,
  stats: ProfileStats,
  top: number,
) => {
  const items = [
    { label: "Threads", value: compactNumber(stats.threads) },
    { label: "Longest thread", value: spanLabel(stats.longestThreadMs) },
    { label: "Longest streak", value: `${stats.longestStreakDays}d` },
    { label: "Current streak", value: `${stats.currentStreakDays}d` },
  ];
  const column = (CARD_WIDTH - MARGIN * 2) / items.length;

  items.forEach((item, index) => {
    const x = MARGIN + column * index;
    drawText(context, item.label.toUpperCase(), x, top, {
      size: 20,
      color: colors.mutedForeground,
    });
    drawText(context, item.value, x, top + 52, {
      size: 46,
      weight: 600,
      color: colors.foreground,
    });
  });

  return top + 92;
};

const drawHeatmap = (
  context: CanvasRenderingContext2D,
  colors: CaptureColors,
  stats: ProfileStats,
  top: number,
) => {
  drawText(context, "Activity", MARGIN, top, { size: 28, weight: 600, color: colors.foreground });
  const summary =
    stats.days.length === 0
      ? "No activity yet"
      : `${compactNumber(stats.days.length)} days of work`;
  drawText(context, summary, CARD_WIDTH - MARGIN, top, {
    size: 22,
    color: colors.mutedForeground,
    align: "right",
  });

  const weeks = heatmapWeeks(stats.days, stats.today);
  const gridTop = top + 32;
  const gridHeight = 7 * HEATMAP_CELL + 6 * HEATMAP_GAP;
  const gridWidth = weeks.length * HEATMAP_CELL + (weeks.length - 1) * HEATMAP_GAP;
  const startX = MARGIN + Math.max(0, (CARD_WIDTH - MARGIN * 2 - gridWidth) / 2);
  const most = Math.max(1, ...stats.days.map((day) => day.tokens));

  weeks.flatMap((week, weekIndex) =>
    week.cells.map((cell, row) => {
      if (cell === null) return;

      const level = levelOf(cell.tokens, most);
      context.fillStyle = level === 0 ? colors.muted : colors.chart;
      context.globalAlpha = level === 0 ? 1 : 0.15 + (level / 4) * 0.85;

      const x = startX + weekIndex * (HEATMAP_CELL + HEATMAP_GAP);
      const y = gridTop + row * (HEATMAP_CELL + HEATMAP_GAP);
      roundRect(context, x, y, HEATMAP_CELL, HEATMAP_CELL, 4);
      context.fill();
      context.globalAlpha = 1;
    }),
  );

  drawText(context, "Less", MARGIN, gridTop + gridHeight + 34, {
    size: 18,
    color: colors.mutedForeground,
  });
  drawText(context, "More", MARGIN + 76, gridTop + gridHeight + 34, {
    size: 18,
    color: colors.mutedForeground,
  });

  return gridTop + gridHeight + 66;
};

const drawTokens = (
  context: CanvasRenderingContext2D,
  colors: CaptureColors,
  stats: ProfileStats,
  top: number,
  bottom: number,
) => {
  drawText(context, "Tokens", MARGIN, top, { size: 28, weight: 600, color: colors.foreground });
  drawText(context, `${compactNumber(stats.tokens)} tokens`, MARGIN, top + 56, {
    size: 44,
    weight: 600,
    color: colors.foreground,
  });

  const chartTop = top + 96;
  const chartHeight = Math.max(120, bottom - chartTop - 56);
  const chartWidth = CARD_WIDTH - MARGIN * 2;

  if (stats.tokens === 0) {
    context.strokeStyle = colors.border;
    context.setLineDash([10, 8]);
    roundRect(context, MARGIN, chartTop, chartWidth, chartHeight, 16);
    context.stroke();
    context.setLineDash([]);
    drawText(
      context,
      "Your first thread starts this chart.",
      CARD_WIDTH / 2,
      chartTop + chartHeight / 2,
      {
        size: 24,
        color: colors.mutedForeground,
        align: "center",
      },
    );

    return chartTop + chartHeight;
  }

  const { dates, values } = seriesOf(stats.days, stats.today, WINDOW_DAYS);
  const plotHeight = chartHeight - CHART_TOP_PADDING;
  const points = pointsOf(values, chartWidth, plotHeight);
  const line = new Path2D(linePath(points));
  const area = new Path2D(areaPath(points, plotHeight));

  context.save();
  roundRect(context, MARGIN, chartTop, chartWidth, chartHeight, 16);
  context.clip();
  context.fillStyle = colors.card;
  context.fillRect(MARGIN, chartTop, chartWidth, chartHeight);
  context.translate(MARGIN, chartTop + CHART_TOP_PADDING);
  context.globalAlpha = 0.16;
  context.fillStyle = colors.chart;
  context.fill(area);
  context.globalAlpha = 1;
  context.strokeStyle = colors.chart;
  context.lineWidth = 3;
  context.lineJoin = "round";
  context.stroke(line);
  context.restore();

  const first = dates[0];
  const oldest = first ? chartDate(first) : "Today";
  drawText(context, oldest, MARGIN, chartTop + chartHeight + 36, {
    size: 20,
    color: colors.mutedForeground,
  });
  drawText(context, "Today", CARD_WIDTH - MARGIN, chartTop + chartHeight + 36, {
    size: 20,
    color: colors.mutedForeground,
    align: "right",
  });

  return chartTop + chartHeight + 36;
};

export async function renderProfileCapture(
  name: string,
  email: string,
  image: string | null | undefined,
  stats: ProfileStats,
): Promise<Blob> {
  const colors = readColors();
  const avatar = await loadAvatar(image);
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const context = canvas.getContext("2d");

  if (!context) throw new Error("This browser cannot export images");

  context.fillStyle = colors.background;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  let cursor = drawHeader(context, colors, name, email, avatar);
  context.strokeStyle = colors.border;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(MARGIN, cursor);
  context.lineTo(CARD_WIDTH - MARGIN, cursor);
  context.stroke();

  cursor = drawStats(context, colors, stats, cursor + 56);
  context.beginPath();
  context.moveTo(MARGIN, cursor + 24);
  context.lineTo(CARD_WIDTH - MARGIN, cursor + 24);
  context.stroke();

  cursor = drawHeatmap(context, colors, stats, cursor + 80);
  context.beginPath();
  context.moveTo(MARGIN, cursor);
  context.lineTo(CARD_WIDTH - MARGIN, cursor);
  context.stroke();

  drawTokens(context, colors, stats, cursor + 56, CARD_HEIGHT - MARGIN);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));

  if (!blob) throw new Error("This browser cannot save the image");

  return blob;
}

export const PROFILE_CAPTURE_SIZE = { width: CARD_WIDTH, height: CARD_HEIGHT };
