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
