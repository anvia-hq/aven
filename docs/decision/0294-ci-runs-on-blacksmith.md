# 0294: CI and Hammer run on Blacksmith runners

Date: 2026-11-15

## Decision

`ci.yml` (check, test, e2e) and `hammer.yml` run on `blacksmith-4vcpu-ubuntu-2404` instead of GitHub-hosted runners.

`release.yml` stays on GitHub-hosted runners. Its build matrix picks a runner per architecture and the release path is not changed until a Blacksmith run of it has been checked.

## Why

Faster and cheaper runs for the jobs that run on every pull request.
