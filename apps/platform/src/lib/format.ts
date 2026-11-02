import { formatDistanceToNowStrict } from "date-fns";

// "3 hours" or, with `suffix`, "3 hours ago".
export const timeAgo = (iso: string, suffix = false) =>
  formatDistanceToNowStrict(new Date(iso), { addSuffix: suffix });

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

// 512 -> "512 B", 1536 -> "1.5 KB", 2621440 -> "2.5 MB".
export const fileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

// For a disk or memory: 5_400_000_000 -> "5.0 GB", 2_199_023_255_552 -> "2.0 TB", smaller ones as fileSize.
export const storageSize = (bytes: number) => {
  const GB = 1024 ** 3;
  if (bytes < GB) return fileSize(bytes);
  if (bytes < 1024 * GB) return `${(bytes / GB).toFixed(1)} GB`;
  return `${(bytes / 1024 / GB).toFixed(1)} TB`;
};

// How much of a disk or memory is used, in the total's unit: 6.4 GB of 15.6 GB -> "6.4 of 15.6 GB".
export const storageUsage = (used: number, total: number) => {
  const unit = storageSize(total).split(" ")[1]!;
  const scale = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }[unit]!;
  const own = (bytes: number) => (unit === "B" ? `${bytes}` : (bytes / scale).toFixed(1));
  return `${own(used)} of ${own(total)} ${unit}`;
};

// 331300 -> "331.3k", 1000000 -> "1M".
export const compactNumber = (value: number) =>
  new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);

// 12000 -> "12s", 272000 -> "4m 32s", 3900000 -> "1h 5m". Whole seconds, never negative.
export const elapsed = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};
