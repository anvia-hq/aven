export interface TimingsFile {
  version: number;
  files: Record<string, number>;
}

export interface ShardVerification {
  discovered: string[];
  merged: TimingsFile;
  missing: string[];
  duplicates: string[];
  slowFiles: { file: string; ms: number }[];
}
