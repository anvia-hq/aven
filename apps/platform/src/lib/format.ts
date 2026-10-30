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
