# A Linux runner can run each thread in a Cloud Hypervisor VM

Status: proposed. Not built; the spikes below are the only code run.

## Context

A thread's sandbox is a Docker container started as the host user, with `no-new-privileges`, the default seccomp profile and no Docker socket (0095). Inside it nothing can start a Docker daemon: it is not root, has no sudo, and user namespaces are blocked. So a project that needs `docker compose` or `docker build` to work, which is common, cannot be run or checked by the agent. A thread of a real project (a worker that starts a container per session) failed for this reason.

Sysbox, which lets a container run its own Docker daemon, was looked at and left out: a runner's Debian 13 and kernel 6.12 host has an open report of `sysbox-fs` wedging the whole host until a reboot (nestybox/sysbox#1018), and its maintenance is thin. Mounting the host's Docker socket or a privileged container would give the agent the host.

Devin's environment is described as a Linux virtual machine booted from a snapshot, and Amp's orbs as a whole machine each. A virtual machine has its own kernel, so the agent can be root in it, run `dockerd` and be no closer to the host than any other guest.

Firecracker was tried first and set aside: it has no shared-folder device (its request for one, firecracker-microvm/firecracker#1180, was closed), and the runner reads and writes each thread's workspace as a host folder in about eight places (the files tree, diffs, forks, skills, Ship, snapshots). Moving all of them into the guest was the larger change.

## Decision

- **A runner started with `AVEN_SANDBOX=vm` runs each thread in a Cloud Hypervisor VM** (Apache-2.0, on KVM), on a Linux host, beside the Docker backend, which stays the default. The Mac runner (0211) is the other VM backend.
- **The workspace stays a host folder**, shared into the guest with virtio-fs through `virtiofsd` (Debian and Ubuntu package it) run by the runner as the same user, without root. The uploads, skills and browser-profile folders are shared the same way, so what the runner does to a workspace today (clone, fork, diff, snapshot) does not change.
- **The guest is the existing sandbox image.** The runner turns the sandbox image it already pulls into a read-only root filesystem on first use, shared by every VM, with a small writable disk per thread for the overlay and for Docker's data. A small init mounts the system filesystems, the shares and the network, and runs the same `anvia-sandbox-daemon`, which dials out to the runner's hub as it does from a container. Nothing about the tools changes.
- **The kernel is Aven's own build** of a long-term kernel from kernel.org, with Firecracker's published guest configuration plus `CONFIG_VIRTIO_FS`, built by a script in the repository and attached to each release with its checksum. Cloud Hypervisor's own prebuilt kernels have virtio-fs but no netfilter or bridge, which Docker needs; Firecracker's have the reverse.
- **A one-time, privileged host setup** gives the runner's user a network bridge, a NAT rule and a few tap devices, and adds the user to the `kvm` group. It is a command a person runs with sudo; the runner itself never runs as root.

## Consequences

- A thread in a VM can run Docker and Compose, with its own bridge network and its own images, and an agent that is root in it is not root on the host. A file the guest writes in the workspace belongs to the runner's user on the host, whoever wrote it in the guest.
- A runner needs KVM: a bare-metal or nested-virtualization Linux host. It does not run on macOS, and a host with virtualization off (a BIOS setting) cannot.
- The root filesystem is as big as the sandbox image (about 6 GB), once. Each thread adds its own writable disk, which grows as Docker pulls images.
- Memory is reserved per VM. A host of 16 GB takes a handful of VMs at once, not dozens.
- Git in the guest refuses a repository owned by another user, so the daemon has to run as the host user's uid, as the container does.
- The network setup is a host change that needs root once; a runner without it cannot start a VM, and says so. It is not kept across a reboot until the runner's installer does it.
- **Licences.** Cloud Hypervisor is Apache-2.0 (with parts under BSD-3-Clause); `virtiofsd` is Apache-2.0 and BSD-3-Clause; the kernel is GPL-2.0, built from kernel.org's source, with the corresponding source and configuration published by the script. The root filesystem is built on the runner from the same sandbox image, with the same contents and licences as the container.

## Tried on a real host

On a Linux host (Ubuntu 24.04, kernel 6.8, Intel i5-6400T, 15 GB), as an ordinary user except for the packages and the network setup:

- **Firecracker 1.18.0 with its 6.1 CI kernel** booted the sandbox image's filesystem with 2 vCPU and 2 GiB, started `dockerd` about a second after init, and ran containers on Docker's bridge, in 3.4 seconds start to power-off. With a bridge, a tap device and NAT, the guest reached a listener on the host, fetched `https://example.com`, pulled `busybox` from Docker Hub and ran a container that reached the internet. The host's Docker firewall needed two accept rules in `DOCKER-USER` for the bridge.
- **Cloud Hypervisor 54.1 with a 6.1.192 kernel built from kernel.org's tarball** (Firecracker's configuration plus `CONFIG_VIRTIO_FS=y`, about ten minutes with three CPUs) booted the same filesystem with `virtiofsd` 1.10 (`--sandbox none`) sharing a folder. The guest read a file the host had made and wrote files the host then saw, owned by the runner's user; 3,000 small files took 0.9 seconds to write and 0.55 to read; 500 MB with `fsync` took 8 seconds. `dockerd` came up in a second and ran a container with the overlayfs driver. The whole run, with a pull, took 39 seconds.
- Git in the guest, as root, refused the shared folder as owned by another user.

## Not verified

- The real `anvia-sandbox-daemon` dialing the runner's hub from the guest, and everything it does there: commands, files, the terminal, the desktop through Xvnc, the Browser's port tunnel.
- The read-only base with a per-thread overlay, and the init that sets it up; the spike copied a whole 6 GB root filesystem per run.
- Running as the host user's uid in the guest, and the home directory.
- The guest's DNS and clock (the spike wrote public resolvers and set the time from the host).
- Memory and start time under load with several VMs, and how many a host takes.
- Reading a thread's workspace while its VM is stopped, snapshots and forks, archived-thread cleanup, and the terminal (it uses `docker exec` today).
- Debian 13 with kernel 6.12 and an AMD host (KVM works there; neither VMM was run).
