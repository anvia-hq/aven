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

export interface PlaywrightJsonSuite {
  file?: string;
  suites?: PlaywrightJsonSuite[];
  specs?: {
    file?: string;
    tests?: {
      results?: { duration?: number }[];
    }[];
  }[];
}

export interface PlaywrightJsonReport {
  suites?: PlaywrightJsonSuite[];
}
