# A Linux runner can run each thread in a Firecracker microVM

Status: proposed. Not built; the spike below is the only code run.

## Context

A thread's sandbox is a Docker container started as the host user, with `no-new-privileges`, the default seccomp profile and no Docker socket (0095). Inside it nothing can start a Docker daemon: it is not root, has no sudo, and user namespaces are blocked. So a project that needs `docker compose` or `docker build` to work, which is common, cannot be run or checked by the agent. A thread of a real project (a worker that starts a container per session) failed for this reason.

Sysbox, which lets a container run its own Docker daemon, was looked at and left out: its Debian 13 and kernel 6.12 combination (a runner's host) has an open report of `sysbox-fs` wedging the whole host until a reboot (nestybox/sysbox#1018), and its maintenance is thin. Mounting the host's Docker socket or a privileged container would give the agent the host.

Devin's environment is described as a Linux virtual machine booted from a snapshot, and Amp's orbs as a whole machine each. A virtual machine has its own kernel, so the agent can be root in it, run `dockerd` and be no closer to the host than any other guest.

## Decision

- **A runner started with `AVEN_SANDBOX=firecracker` runs each thread in a Firecracker microVM** (Apache-2.0), on a Linux host with KVM, beside the Docker backend, which stays the default. The Mac runner (0211) is the other VM backend.
- **The guest is the existing sandbox image.** The runner turns the sandbox image it already pulls into a root filesystem on first use (`docker export` into an ext4 file), adds a small init that mounts the system filesystems, starts the network and `dockerd`, and runs the same `anvia-sandbox-daemon`, which dials out to the runner's hub as it does from a container. Nothing about the tools changes.
- **The kernel is Firecracker's own CI kernel** (6.1 series), downloaded by the runner and checked against a SHA-256 kept in the code, until Aven builds one from the published configuration. That configuration has what Docker needs built in (cgroups, overlayfs, veth, bridge, netfilter, conntrack, NAT, masquerade).
- **A one-time, privileged host setup** gives the runner's user a network bridge, a NAT rule and the right to make tap devices, and adds the user to the `kvm` group. It is a command a person runs with sudo (`aven runner` prints it); the runner itself never runs as root.
- **The workspace lives on a disk of the VM's own** (a sparse ext4 file per thread) and not in a shared folder, because Firecracker has no shared-folder device. What the runner does to a workspace on the host today (clone, fork, diff, snapshot) is done through the daemon in the guest instead, booting the VM for it when it is off (a boot took about 3 seconds in the spike).
- **A thread's root filesystem is a copy of the prepared one**, which is what makes a start quick; a copy-on-write layer is a later step.

## Consequences

- A thread in a microVM can run Docker and Compose, with its own bridge network and its own images, and an agent that is root in it is not root on the host.
- A runner needs KVM: a bare-metal or nested-virtualization Linux host. It does not run on macOS, and a host with virtualization off (a BIOS setting) cannot.
- The prepared root filesystem is as big as the sandbox image (about 6 GB used here, 11 GB allowed), and every thread's workspace disk is more on top. A host with little disk will not take many threads.
- Memory is reserved per VM. A host of 16 GB takes a handful of VMs at once, not dozens.
- Docker-in-VM is the first backend where the workspace is not a host folder. Whatever reads it (the Files panel, the diff, Ship, snapshots, forks) goes through the guest, and each of them needs checking.
- Network access for the guest is a host change that needs root once; a runner without it cannot start a VM, and says so.
- **Licences.** Firecracker is Apache-2.0. The kernel is GPL-2.0 and is downloaded by each runner from Amazon's bucket, not redistributed by Aven. The root filesystem is built on the runner from the same sandbox image, with the same contents and licences as the container.

## Tried on a real host

On a Linux host (Ubuntu 24.04, kernel 6.8, Intel i5-6400T, 15 GB), with Firecracker 1.18.0 and the 6.1.188 CI kernel, without root:

- A microVM with 2 vCPU and 2 GiB booted from the sandbox image's exported filesystem, with a one-file init. `dockerd` was up about 1 second after init began, and the whole run to power-off took 3.4 seconds.
- A tiny image loaded from a second disk ran with `--network none` and on the default bridge (it got `172.17.0.2`), so overlayfs, cgroups v2, iptables and the bridge work in this kernel.
- With a bridge, a tap device and NAT set up once with sudo (the host's Docker firewall needed two accept rules in `DOCKER-USER` for the bridge), a guest on `10.77.0.2` reached a listener on the host at `10.77.0.1`, fetched `https://example.com` (200), pulled `busybox` from Docker Hub with its own `dockerd`, and ran a container in it that reached the internet too, through the guest's own NAT. The whole run, with the pull, took 20 seconds.
- Both Firecracker and the CI kernel were checked: Firecracker by its published SHA-256; the kernel has none published, so `f5735774e2570d9df451fc5665f3525d3baf723fa6a8a413a03591d5742b39a5` is what the spike downloaded.

## Not verified

- That the guest's DNS comes from the host's resolver (the spike wrote public resolvers into it) and that the guest's clock is right after a restore (the spike set it from the host).
- The daemon dialing the runner's hub from the guest, and everything the daemon does there: commands, files, the terminal, the desktop through Xvnc, the Browser's port tunnel.
- The workspace on its own disk, and the host-side operations moved into the guest.
- Memory and start time under load, with several VMs, and how many a host takes.
- The prepared image and the CI kernel's upgrade path, and that a kernel download from the bucket stays available.
- Debian 13 with kernel 6.12 and an AMD host (KVM works there; Firecracker was not run).
