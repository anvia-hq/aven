# 0295: CI and Hammer are back on GitHub-hosted runners

Date: 2026-11-15

Supersedes 0294.

## Decision

`ci.yml` (check, test, e2e) runs on `ubuntu-24.04` and `hammer.yml` on `ubuntu-latest` again.

## Why

Blacksmith cost more than the speed was worth for a pull request's checks.
