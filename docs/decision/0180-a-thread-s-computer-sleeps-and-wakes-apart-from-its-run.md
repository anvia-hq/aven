# A thread's computer sleeps and wakes apart from its run

Status: accepted, in phases. Builds on 0010 (a sandbox per thread), 0012 (the agent's tools act in the sandbox), 0015 (the desktop), 0039 (waking a sandbox without a run), 0095 (the container runs as the host user), 0118 (a sandbox is freed when idle or archived) and 0177 (a thread lives on one runner). Touches 0179 (a teammate who drives a thread uses its creator's computer).

## Context

A run acquires its thread's sandbox when it starts and waits for it, whether or not the agent ever uses a computer. The agent cannot see whether its computer is asleep or wake it. Sleeping is `docker rm -f` after 30 minutes with no run and no process, so everything outside the mounted workspace is lost, including the browser's logins (`$HOME/.chrome-profile`), and the GitHub, git and identity sign-in, which a run writes into the container when it starts. The desktop starts with the container and cannot be woken apart from it.

## Decision

The aim is that nobody has to think about the computer: a run never waits for one it does not use, waking is invisible when it can be, and what a person did once is not lost to a sleep.

1. **Layers.** A computer is `asleep`, `waking` or `awake`, and its desktop (the display session) is a layer that is on or off. The runner owns the state and reports it to the control plane, so the platform, the native clients and the agent read one source.
2. **The agent.** A run starts with no container wait. Its instructions say whether the computer is asleep or awake. It has `computer_status` and `computer_wake`, and the shell and file tools wake the computer themselves when it is asleep, so a forgotten wake never fails a run. After a wake that followed a sleep it is told once that its background processes were stopped.
3. **Sleep.** The desktop sleeps after 10 minutes with no viewer and no `desktop_*` call. The computer sleeps after 30 minutes with no run, tool call, terminal or background process, and never while the desktop is watched. A computer can be kept awake, and both times are runner settings. A runner short of memory sleeps the least recently used computer first.
4. **Pre-warm.** Opening a thread whose computer is asleep and focusing its composer wakes it, so it is usually awake when the message is sent. Opening a thread alone wakes nothing.
5. **Sign-in on wake.** A wake the control plane makes for a person (the button, pre-warm) carries the same GitHub and identity material a run carries, so the computer is not signed out. A wake with nobody behind it comes up signed out until the next run. Nothing is stored in a container or on the runner's disk, as for a run (0044).
6. **Browser logins survive sleep: one profile for a person and a project.** The browser's profile is a directory on the runner, `<AVEN_RUNTIME_HOME>/browser-profiles/p-<hash of the creator and the project>`, mounted into the container at `/browser-profile` with `ANVIA_BROWSER_PROFILE` pointing at it (the launcher already reads it). A login made in one thread of a project is there in every other thread of that person's in that project, and after every sleep.
   - The person is the thread's creator. A teammate who drives the thread (0179) therefore uses the creator's browser, which the creator accepts by turning multiplayer on.
   - Chrome cannot share a profile between two running containers: it sees another host's lock. A profile is leased to one thread's container at a time; a thread that starts while another holds it gets a private profile (`t-<thread id>`), logged out, removed with the thread. A stale lock left by a container that was removed is deleted when the lease is taken.
   - A profile unused for `AVEN_BROWSER_PROFILE_KEEP_DAYS` (90, 0 keeps them) is removed by the hourly sweep, a private one with its thread's archive cleanup (0160). A fork starts as its own thread, so it gets the leased or a private profile like any other.
   - Cookies sit on the runner's disk with the workspace's files, in a directory only the host user reads (`0700`). Clearing a person's browser data from the platform is later work.
   - A runner that is not updated, or a control plane that does not send the person and project (`ownerId`, `projectId` of `RunThreadInfo`, no wire version because both are optional), keeps the browser's own profile in the container, as before.
7. **Login handoff.** When the agent meets a login it cannot do, it asks the person to take over the desktop, like `request_secret` asks for a value, and goes on when they are done. The login stays in the profile (later).
8. **Seeing it.** A Computer card in a thread's overview shows asleep, waking or awake, Wake and Sleep, a desktop switch, Keep awake and whether the browser keeps its logins (later).

## Phases

1. This record, and the browser profile (item 6): independent of the rest.
2. The lifecycle: `computer.*` calls on the wire, runs that start without a container, the agent's tools, wake with sign-in (items 1, 2, 5).
3. The desktop as its own layer and the two sleep times (items 1, 3).
4. The Computer card, pre-warm and the login handoff (items 4, 7, 8).

## Consequences

- A first thread of a project starts logged out; every later one starts logged in, which is the point. Two threads of a project running at once do not share a browser: the second is logged out until the first sleeps. Seeding a private profile from the leased one is possible later.
- Anyone who can use a thread's browser can act as the creator on every site they logged in to, for as long as the profile is kept. This is the same trust as lending the creator's GitHub account (0044), and a person who does not want it clears the profile or archives and deletes the project.
- Waking without a run shows sign-in as missing until a run or a person's wake supplies it.
