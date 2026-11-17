# 0328: The cloud computer is named after its sandbox provider

Status: accepted. Supersedes the naming in 0299 and 0324.

## Context

0299 and 0324 named the built-in cloud computer "Aven Cloud". An installation has one sandbox
platform (0324), so the name told a person nothing about where a thread runs.

## Decision

- The template runtime is named after the platform in use: "boat.dev" or "Spaces"
  (`cloudTemplateName` in `sandbox/src/cloud-config.ts`). A thread's own computer takes the same name.
- The server sets the name on read, so template rows seeded earlier as "Aven Cloud" are shown with
  the right name without a migration.
- The composer's computer, project and model chips share one rounded, outlined style.

## Consequences

- Changing the platform in Settings > Sandbox changes the name people see.
- The settings and dialog copy still says "Aven Cloud" as the product's name for these computers.
