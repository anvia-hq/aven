# The sandbox ships the common toolchains and runs with 4 CPUs and 8 GB

Status: superseded by 0219 (the container sandbox, Desktop, Browser and snapshots are retired). Was: accepted. Extends 0014 (Chrome on amd64, Chromium on arm64, the daemon and the image tag); the desktop it chose is replaced by 0038.

## Context

The image had Node 22, git and a bare `python3`. An agent doing ordinary work (reading a spreadsheet, converting audio, building a Go or Rust tool) had to install its toolchain first, and the 2 CPUs and 2 GB a container got were too little for a browser plus a build.

## Decision

- **Toolchains in the image:** Node 24, pnpm, Bun, Go, Rust (`rustup`, minimal profile) and Python 3.13 (Debian 13's own) with `uv`. Bun, Go and Rust sit under `/usr/local`; Rust's home belongs to `node`.
- **Python libraries in one virtualenv, `/opt/venv`, first on `PATH`:** pandas, numpy, openpyxl, xlsxwriter, python-docx, python-pptx, markitdown, mammoth, beautifulsoup4, lxml, requests, Pillow, onnxruntime and redis. Debian 13 refuses system-wide `pip install` (PEP 668), and the venv belongs to `node`, so the agent can add to it.
- **Command-line tools:** `gh`, ffmpeg, `pdftotext` (poppler-utils), `jq`, ripgrep, `psql`, curl, wget, unzip.
- **No LibreOffice.** It costs 0.5 to 1.5 GB and the agent can read and write Word, Excel and PowerPoint files with the Python libraries. It cannot render them to PDF.
- **Limits per container default to 4 CPUs, 8 GB of memory and 1024 processes** (`AVEN_SANDBOX_CPUS`, `AVEN_SANDBOX_MEMORY_MB`, new `AVEN_SANDBOX_PIDS_LIMIT`). They are caps, not reservations.
- **Disk is not limited.** Docker's `--storage-opt size=` needs overlay2 on XFS with project quotas, which Docker Desktop and many hosts lack, and the workspace is a bind mount. A Linux runner can put a quota on its `AVEN_RUNTIME_HOME` itself.

## Consequences

- The image grows past the 7.3 GB of 0014. Building takes longer and a runner needs the disk for it.
- A runner hosting several threads at once can overcommit its memory: 8 GB each is a cap, so size the machine for the concurrency you expect.
- Existing runners must rebuild the image (`docker build -t aven-sandbox-desktop:dev apps/runtime/sandbox-image`).
