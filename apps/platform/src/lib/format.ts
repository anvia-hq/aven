import { formatDistanceToNowStrict } from "date-fns";

export const timeAgo = (iso: string, suffix = false) =>
  formatDistanceToNowStrict(new Date(iso), { addSuffix: suffix });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function shortTimeAgo(iso: string, now = Date.now()) {
  const past = Math.max(0, now - Date.parse(iso));
  if (past < MINUTE) return "now";
  if (past < HOUR) return `${Math.floor(past / MINUTE)}m`;
  if (past < DAY) return `${Math.floor(past / HOUR)}h`;
  if (past < 7 * DAY) return `${Math.floor(past / DAY)}d`;
  if (past < 30 * DAY) return `${Math.floor(past / (7 * DAY))}w`;
  if (past < 365 * DAY) return `${Math.floor(past / (30 * DAY))}mo`;
  return `${Math.floor(past / (365 * DAY))}y`;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

export const fileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const storageUnit = (bytes: number) => {
  const GB = 1024 ** 3;
  if (bytes < GB) return null;
  if ((bytes / GB).toFixed(1) === "1024.0" || bytes >= 1024 * GB)
    return { label: "TB", scale: 1024 * GB };
  return { label: "GB", scale: GB };
};

export const storageSize = (bytes: number) => {
  const unit = storageUnit(bytes);
  return unit ? `${(bytes / unit.scale).toFixed(1)} ${unit.label}` : fileSize(bytes);
};

export const storageUsage = (used: number, total: number) => {
  const unit = storageUnit(total);
  if (!unit) return `${fileSize(used)} of ${fileSize(total)}`;
  return `${(used / unit.scale).toFixed(1)} of ${(total / unit.scale).toFixed(1)} ${unit.label}`;
};

export const compactNumber = (value: number) =>
  new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);

export const elapsed = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};
