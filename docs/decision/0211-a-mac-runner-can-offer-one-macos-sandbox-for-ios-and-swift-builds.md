# A Mac runner can offer one macOS sandbox, for iOS and Swift builds

Status: proposed. Adds to 0009 (sandboxed runtimes) and 0010 (per-thread sandboxes); the Linux sandbox is unchanged. Nothing here is built, and most of the mechanics below were read about, not run.

## Context

Every thread's sandbox is a Linux container (0010, 0014). The agent can build and test web and server work there, but not an iOS or Swift app: Xcode runs only on macOS, and `clients/ios` and `clients/macos` need it (`AGENTS.md`). A person who wants the agent to work on such an app today has to do the build themselves.

macOS can run in a VM on a Mac. What is known, from documentation and forum posts rather than from trying it:

- Apple's Virtualization.framework runs macOS guests on Apple Silicon only. Docker on a Mac runs Linux containers in a Linux VM, never macOS.
- Apple's licence lets a Mac run up to two extra macOS instances in VMs, for purposes that include software development and testing, and the framework refuses a third. We have not read the current licence text.
- Tart (Cirrus Labs) drives these VMs from a CLI: `clone`, `run`, `set --disk-size`, `run --dir` to share a host folder, prebuilt macOS 12 to 26 images. It is Fair Source: free on personal computers, paid for an organisation above 100 CPU cores. Lume (Cua) is a CLI and local HTTP API over the same framework; we have not checked its licence.
- `@anvia/sandbox` already runs its daemon inside the sandbox, which dials out to the runner's hub with a token (`ANVIA_CONTROL_URL`, `ANVIA_SANDBOX_TOKEN` in `dockerRunArgs`). Its command, file and process tools use `bash` and process groups. Its desktop tools use `xdotool` and an X display and `list_ports` reads `/proc/net/tcp`, so those are Linux only.

## Decision

- **A runner started with `AVEN_SANDBOX=macos` runs every thread it takes in a macOS VM**, on a person's own Apple Silicon Mac. The person installs Tart and pulls a macOS image (`AVEN_MAC_IMAGE`, default Cirrus Labs' `macos-tahoe-base`) themselves; Aven bundles neither and never distributes macOS. A project uses it by being moved to that runner (0093), so there is no new project setting, no database change and no wire change: older control planes and runners behave as before.
- **One VM means one thread at a time.** A second thread that needs the VM while another holds it is refused with a message that says so, not queued silently. A thread lets go when it sleeps (the runner's idle release) or is put away.
- **Commands run in the VM through Tart's guest agent** (`tart exec`), not through a daemon of ours. The Cirrus images already run the agent, so nothing has to be installed in the guest, and the host-to-guest network is not needed. The runner sends the command, its environment and its working directory as a script on standard input, so a project variable is never an argument of a process on the host.
- **The workspace stays on the host and is shared into the VM** (`tart run --dir`, virtiofs). The runner clones, forks and reads it exactly as it does for a container, so git, diffs, shipping and the file tools work as they do today. The agent still sees `/workspace`, `/uploads` and `/skills`: the first start of an image makes a copy of it with links at the guest's root (`/etc/synthetic.conf`) to the shared folders, and every thread's VM is cloned from that copy. Xcode's derived data stays on the VM's own disk.
- **A thread's VM keeps its disk while it sleeps** (stopped, not deleted), so what Xcode and the agent installed there is not lost; it is deleted when the thread is put away. Tart clones are copy-on-write, so an idle clone costs little disk.
- **The agent's tools are the ones a container has, without the desktop**: `exec_command`, `read_file`, `write_file`, `list_files`, processes, `edit`, `view_image` and `show_artifact`. There is no Desktop, no Browser tab, no terminal, no saved environment, and no snapshots or forks of the VM in the first version.
- **Secrets are handled as everywhere else (`AGENTS.md`).** Project variables and tokens are passed to a command when it runs and are not written to the VM's disk, a journal or a file.

## Consequences

- iOS and Swift work gets a real build, and Linux threads are untouched.
- It works only on a Mac runner, and a Mac runner gets one macOS thread at a time. That is Apple's limit and this decision's, and 2 is the most Apple allows.
- A macOS image is tens of GB. The first start of a runner prepares the image, and each thread's first start clones it and boots the VM, which takes a while.
- A Mac runner that runs macOS threads cannot also run Linux ones; a person who wants both runs two runners.
- Not decided here: desktop streaming of the VM, snapshots and forks of it, more than one VM, and a project setting that picks the sandbox per project.

## Licences

Aven (MIT) bundles none of this: the person installs Tart and pulls the image on their own Mac, so what follows is between them and the owners. None of it was read in full or checked with a lawyer; it is what the pages said when this was written.

- **Apple (macOS).** The macOS licence allows up to two extra copies of macOS in VMs on each Apple-branded Mac the person owns or controls, for purposes that include software development and testing, and Virtualization.framework refuses a third. It covers macOS guests on Apple hardware only: never a Linux or cloud host, and not renting macOS VMs to others. This feature runs one VM on the person's own Mac to build and test their own app, which is the case the licence describes. Anything beyond that, such as running it for a team on shared Macs, needs the licence text read for that case (the wording for macOS 27 is being discussed on Apple's forums).
- **Tart (Cirrus Labs, Fair Source).** Free on personal computers and workstations. An organisation needs a paid licence only above 100 CPU cores across the Macs it runs Tart on (every performance and efficiency core counts): Gold, $12,000 a year, up to 500 cores; Platinum, $36,000, up to 3,000; Diamond, $12 a core. The page does not say whether embedding Tart in a product is allowed, which is one more reason Aven drives an installed `tart` and does not ship it. Lume (Cua) or Virtualization.framework directly would avoid this licence, and the VM driver is the only code that would change.
- **The images.** `ghcr.io/cirruslabs/macos-*` are public and free to pull. Their own terms were not read, and the Xcode images contain Apple's Xcode, under Apple's terms.

Cost to the person: nothing for one Mac below 100 cores. The disk is the real cost: about 31 GB for the base image (a full macOS install, 12 GB used inside a 50 GB virtual disk; a thread's VM is a copy-on-write clone and grows only with what it changes), and several times that for an Xcode image.

## How to run one

On the Mac, with Apple Silicon and Tart (https://tart.run) installed:

```sh
tart pull ghcr.io/cirruslabs/macos-tahoe-base:latest
AVEN_SANDBOX=macos aven runner ...
```

Set `AVEN_MAC_IMAGE` to another image to change what the VM has (`macos-tahoe-xcode` for full Xcode), and `AVEN_MAC_TART_HOME` to keep the VMs on another volume. The first start prepares the image once (about a minute); each thread's first command boots its VM (about 30 to 40 seconds). Then move a project to that runner.

## Tried on a real VM

On an M-series Mac (macOS 27 host, 16 GB), with Tart 2.41.1 and `macos-tahoe-base` (macOS 26.6, Command Line Tools, no Xcode), through `MacSandboxes` and the agent's own tools (`mac-sandboxes.vm.test.ts`, run with `AVEN_MAC_TEST_IMAGE`):

- Works: the VM boots in about 40 seconds and `tart exec` returns exit codes and stderr; the shared workspace is read and written from both sides, and git commits made in the guest show on the host; `/workspace`, `/uploads` and `/skills` resolve once the prepared image has been booted; passwordless `sudo` is there to write the links; `swiftc` and `swift build` build and run a program; a project variable reaches a command through standard input.
- Found and handled: Tart's `get` does not know images pulled from a registry, so the runner checks `tart list`; the prepared image has to `sync` before it is stopped or its file is empty; stopping `tart exec` does not stop the guest process, so the runner records each command's process group in the guest and kills it on a timeout, a stop and a cancel.
- Found and not handled: the first `swift build` right after `swift package init` on the shared folder failed once with "input file Package.swift was modified during the build" and the next build passed. A scratch path on the VM's own disk (`--scratch-path`) also built.

## Not verified

- Anything that needs full Xcode, which is the point of the feature: `xcodebuild`, the iOS simulator, a signed build. The base image has only the Command Line Tools (`xcodebuild` says so). The Xcode images of Cirrus Labs are far larger and were not pulled.
- A thread that clones a real repository through the runner, a fork of a thread, the idle release, and a whole run through the control plane. Each uses the same `ThreadWorkspaces` calls as a container, and none was run on a VM.
- How `tart exec` behaves when a command prints a lot, or the connection is long-lived.
- Whether the VM can reach services on the host or the local network. It uses Tart's default shared (NAT) networking, so it can reach both; `--net-softnet` would limit that and was not tried.
- The licence texts themselves (see Licences), including Cirrus Labs' terms for its images.
