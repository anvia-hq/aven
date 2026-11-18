import { oneLine } from "@aven/agents/bot-instruction";
import { LIST_THREADS_TOOL_NAME } from "@aven/agents/tools/threads";
import { ACTIVITY_DIGEST_NOTE } from "@aven/protocol/memory";

import type { ActivityDigestInput, ActivityDigestStore } from "./types";
import type { BotThreadView, CockpitTask } from "@aven/protocol/types";

export const ACTIVITY_DIGEST_MAX_CHARS = 3000;
export const ACTIVITY_DIGEST_STALE_MS = 6 * 60 * 60_000;
export const ACTIVITY_DIGEST_DAYS = 7;
const TITLE_MAX = 80;
const FOOTER_RESERVE = 40;

const title = (text: string) => oneLine(text).slice(0, TITLE_MAX);

const touched = (thread: BotThreadView) =>
  Math.max(Date.parse(thread.updatedAt), Date.parse(thread.lastActivityAt ?? thread.updatedAt));

function threadStatus(thread: BotThreadView) {
  if (thread.running) return "running";

  if (thread.awaitingAnswer) return "waiting for the person's answer";

  return thread.state === "archived" ? "archived" : "idle";
}

function threadLine(thread: BotThreadView, now: number) {
  const days = Math.floor((now - touched(thread)) / 86_400_000);
  const facts = [
    oneLine(thread.repository),
    threadStatus(thread),
    ...thread.pullRequests.map((pull) => `PR #${pull.number} ${pull.state}`),
    days < 1 ? "active today" : `last active ${days}d ago`,
  ];
  return `- "${title(thread.title)}": ${facts.join(", ")}`;
}

const taskLine = (task: CockpitTask) => `- T-${task.number} [${task.status}] ${title(task.title)}`;

const byRecent = (a: CockpitTask, b: CockpitTask) =>
  Date.parse(b.updatedAt) - Date.parse(a.updatedAt);

function listedWithin(lines: string[], room: number) {
  let used = 0;
  let count = 0;

  for (const line of lines) {
    used += line.length + 1;

    if (used > room) break;

    count += 1;
  }

  return count;
}

export function activityDigest({ now, threads, tasks }: ActivityDigestInput) {
  const since = now.getTime() - ACTIVITY_DIGEST_DAYS * 86_400_000;
  const recent = threads
    .filter((thread) => thread.mine && touched(thread) >= since)
    .toSorted((a, b) => touched(b) - touched(a));
  const merged = recent.flatMap((thread) =>
    thread.pullRequests.flatMap((pull) =>
      pull.state === "merged"
        ? [`- #${pull.number} ${title(pull.title)} (${oneLine(thread.repository)})`]
        : [],
    ),
  );
  const moved = tasks.filter((task) => Date.parse(task.updatedAt) >= since).toSorted(byRecent);
  const date = now.toISOString();
  const head = [
    "---",
    "name: activity-digest",
    `description: What the person worked on in the last ${ACTIVITY_DIGEST_DAYS} days, written by the app as of ${date.slice(0, 10)}`,
    "type: project",
    "---",
    `Written by the app from the person's threads and tasks as of ${date}. It is a summary, not a transcript, and it can be out of date: look with ${LIST_THREADS_TOOL_NAME} for now.`,
  ];
  const sections: { heading: string; lines: string[] }[] = [
    { heading: "## Pull requests merged", lines: merged },
    { heading: "## Tasks changed", lines: moved.map(taskLine) },
    {
      heading: "## Threads worked on, newest first",
      lines: recent.map((t) => threadLine(t, now.getTime())),
    },
  ];
  const out = [...head];
  let length = out.join("\n").length;
  let left = 0;

  const budget = ACTIVITY_DIGEST_MAX_CHARS - FOOTER_RESERVE;

  for (const { heading, lines } of sections) {
    if (lines.length === 0) continue;

    const fits = listedWithin(lines, budget - length - heading.length - 2);

    if (fits > 0) {
      out.push("", heading, ...lines.slice(0, fits));
      length +=
        heading.length + 2 + lines.slice(0, fits).reduce((sum, line) => sum + line.length + 1, 0);
    }

    left += lines.length - fits;
  }

  if (merged.length + moved.length + recent.length === 0) {
    out.push("", `Nothing in the last ${ACTIVITY_DIGEST_DAYS} days.`);
  }

  if (left > 0) out.push("", `… and ${left} more not listed.`);

  return out.join("\n");
}

export const isStale = (writtenAt: Date | undefined, now: Date) =>
  writtenAt === undefined || now.getTime() - writtenAt.getTime() >= ACTIVITY_DIGEST_STALE_MS;

export class ActivityDigests {
  constructor(
    private store: ActivityDigestStore,
    private source: {
      threads(userId: string): Promise<BotThreadView[]>;
      tasks(userId: string): Promise<CockpitTask[]>;
    },
    private now: () => Date = () => new Date(),
  ) {}

  async keep(userId: string, botId: string) {
    const place = { userId, scope: "bot" as const, botId };
    const now = this.now();

    if (!isStale(await this.store.writtenAt(place, ACTIVITY_DIGEST_NOTE), now)) return;

    const [threads, tasks] = await Promise.all([
      this.source.threads(userId),
      this.source.tasks(userId),
    ]);
    await this.store.refresh(
      place,
      ACTIVITY_DIGEST_NOTE,
      activityDigest({ now, threads, tasks }),
      new Date(now.getTime() - ACTIVITY_DIGEST_STALE_MS),
    );
  }
}
