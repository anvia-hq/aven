import type { ClaudeBinaryEntry } from "./types";

export const CLAUDE_BINARIES: Record<string, ClaudeBinaryEntry> = {
  "darwin-arm64": {
    package: "@anthropic-ai/claude-agent-sdk-darwin-arm64",
    version: "0.3.322",
    integrity:
      "sha512-LoKkldW2zkLfaOLQD44mL1Ot4Aup8dBIo356LEeO3v2vF7JVNhMllQIXhhGpbYRz57QaYsGvOe0Kb4SbssHwcg==",
  },
  "darwin-x64": {
    package: "@anthropic-ai/claude-agent-sdk-darwin-x64",
    version: "0.3.322",
    integrity:
      "sha512-rTvLS9G1OzjMIaSXrJglQtmRtVcaRmMbJQC+ND02+atCA463ac7Ty/Wc6tyzBGk8zFFGKWnfAhKtLZTNg91eMg==",
  },
  "linux-arm64": {
    package: "@anthropic-ai/claude-agent-sdk-linux-arm64",
    version: "0.3.322",
    integrity:
      "sha512-H1v33+MxB5JMPlnJLZffiOQ+6muxyA7tgHPyYQ+So4TH7uRhaPcjv2X03CUo5U9gXleO6u+X8ngNNDRFtfUaSg==",
  },
  "linux-arm64-musl": {
    package: "@anthropic-ai/claude-agent-sdk-linux-arm64-musl",
    version: "0.3.322",
    integrity:
      "sha512-zvgvVA/Mxpu1QttICZ1DGDlmgGo62HdVgKg6WbDGDQ3dgxtRC/kpCIepjtGEL8O1iO5NRxQ4mv8okLwCFcyrLQ==",
  },
  "linux-x64": {
    package: "@anthropic-ai/claude-agent-sdk-linux-x64",
    version: "0.3.322",
    integrity:
      "sha512-M/i7uV5wQf1kvjiPJr2KF5PeA9BpftUpMTtwE+DpQ0Tj+scthQXSMsEhDvau/Rh/MfFOc+UHED4tltignmA5+Q==",
  },
  "linux-x64-musl": {
    package: "@anthropic-ai/claude-agent-sdk-linux-x64-musl",
    version: "0.3.322",
    integrity:
      "sha512-jprUZMcQ3XcpoxwKRQ0fi3qAM1zYcytmNGhlD0gWDknbbSu8di5jLU7231ihJrCr4gbbtDu3FiFUd6w9EBEjfw==",
  },
};
