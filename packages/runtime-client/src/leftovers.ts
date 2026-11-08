import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { SNAPSHOT_MAX_AGE_MS } from "./snapshots";
import type {
  DockerLeftoverContainer,
  DockerLeftoverImage,
  DockerLeftovers,
  DockerRemoveParams,
  DockerRemoveResult,
} from "@aven/protocol/types";
import type { LeftoversOptions } from "./types";

const FIELD = "|";
const NONE = "<none>";
const ENV_PREFIX = "aven-env-";

const rowsOf = (stdout: string, fields: number) =>
  stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(FIELD))
    .filter((parts) => parts.length === fields);

const read = (path: string) => readFile(path, "utf8").catch(() => "");

const splitImage = (image: string) => {
  const slash = image.lastIndexOf("/");
  const colon = image.lastIndexOf(":");
  return colon > slash
    ? { repository: image.slice(0, colon), tag: image.slice(colon + 1) }
    : { repository: image, tag: "latest" };
};

type SeenContainer = DockerLeftoverContainer & { dangling: boolean };

export class Leftovers {
  constructor(private options: LeftoversOptions) {}

  #now() {
    return (this.options.now ?? Date.now)();
  }

  async #seenContainers(): Promise<SeenContainer[]> {
    const format = [
      "{{.ID}}",
      "{{.Names}}",
      "{{.State}}",
      "{{.CreatedAt}}",
      "{{.Image}}",
      '{{.Label "aven.runner"}}',
      '{{.Label "aven.thread"}}',
    ].join(FIELD);
    const seen = new Map<string, SeenContainer>();
    for (const label of ["aven.sandbox", "aven.setup"]) {
      const { stdout } = await this.options.docker([
        "ps",
        "-a",
        "--filter",
        `label=${label}`,
        "--format",
        format,
      ]);
      for (const [ref, name, state, createdAt, image, runner, thread] of rowsOf(stdout, 7)) {
        if (!ref || !name || !state || !createdAt || !image) continue;
        if (runner && runner !== this.options.runner) continue;
        let reason: string | null = null;
        if (state !== "running") reason = `Not running (${state})`;
        else if (thread && !this.options.inUse(thread)) reason = "Running, but no thread uses it";
        seen.set(ref, {
          ref,
          name,
          state,
          image,
          thread: thread || null,
          createdAt,
          reason: reason ?? "",
          dangling: reason !== null,
        });
      }
    }
    return [...seen.values()];
  }

  async #pinned() {
    const dir = join(this.options.home, "environments");
    const files = await readdir(dir).catch(() => [] as string[]);
    const images = await Promise.all(
      files.filter((file) => file.endsWith(".image")).map((file) => read(join(dir, file))),
    );
    return new Set(images.map((image) => image.trim()).filter(Boolean));
  }

  async #liveSnapshots() {
    const dir = join(this.options.home, "snapshots");
    const keys = await readdir(dir).catch(() => [] as string[]);
    const live = new Set<string>();
    for (const key of keys) {
      if (key.includes(".")) continue;
      const meta = (await read(join(dir, key, "meta.json")).then(
        (text) => JSON.parse(text || "null") as { image?: unknown; createdAt?: unknown } | null,
        () => null,
      )) ?? { image: undefined, createdAt: undefined };
      const created = typeof meta.createdAt === "string" ? Date.parse(meta.createdAt) : NaN;
      const age = this.#now() - created;
      if (typeof meta.image === "string" && age >= 0 && age <= SNAPSHOT_MAX_AGE_MS) {
        live.add(meta.image);
      }
    }
    return live;
  }

  async list(): Promise<DockerLeftovers> {
    const seen = await this.#seenContainers();
    const kept = seen.filter((container) => !container.dangling);
    const containers = seen
      .filter((container) => container.dangling)
      .map(({ dangling: _dangling, ...container }) => container);

    const { stdout } = await this.options.docker([
      "images",
      "--format",
      ["{{.ID}}", "{{.Repository}}", "{{.Tag}}", "{{.Size}}", "{{.CreatedAt}}"].join(FIELD),
    ]);
    const [pinned, live] = await Promise.all([this.#pinned(), this.#liveSnapshots()]);
    const current = splitImage(this.options.image);
    const used = (id: string, reference: string) =>
      kept.some(
        (container) =>
          container.image === reference ||
          container.image === id ||
          id.startsWith(container.image) ||
          container.image.startsWith(id),
      );

    const images: DockerLeftoverImage[] = [];
    for (const [id, repository, tag, size, createdAt] of rowsOf(stdout, 5)) {
      if (!id || !repository || !tag || !size || !createdAt) continue;
      const reference = repository === NONE ? id : `${repository}:${tag}`;
      if (used(id, reference)) continue;
      let reason: string | null = null;
      if (repository === NONE) reason = "Untagged, nothing refers to it";
      else if (repository.startsWith(ENV_PREFIX)) {
        const named = [repository, reference];
        if (!named.some((name) => pinned.has(name) || live.has(name))) {
          reason = "An environment snapshot that expired or no thread uses";
        }
      } else if (repository === current.repository && tag !== current.tag) {
        reason = "A sandbox image of an older release";
      }
      if (reason) images.push({ ref: reference, id, size, createdAt, reason });
    }
    return { containers, images };
  }

  async remove(request: DockerRemoveParams): Promise<DockerRemoveResult> {
    const current = await this.list();
    const containers = new Set(current.containers.map((container) => container.ref));
    const images = new Set(current.images.map((image) => image.ref));
    const result: DockerRemoveResult = { removedContainers: 0, removedImages: 0, failed: [] };

    for (const ref of request.containers) {
      if (!containers.has(ref)) {
        result.failed.push({ ref, reason: "It is not a leftover any more" });
        continue;
      }
      const removed = await this.options.docker(["rm", "-f", ref]);
      if (removed.code === 0) result.removedContainers += 1;
      else result.failed.push({ ref, reason: removed.stderr.trim() || "Docker refused" });
    }
    for (const ref of request.images) {
      if (!images.has(ref)) {
        result.failed.push({ ref, reason: "It is not a leftover any more" });
        continue;
      }
      const removed = await this.options.docker(["rmi", ref]);
      if (removed.code === 0) result.removedImages += 1;
      else result.failed.push({ ref, reason: removed.stderr.trim() || "Docker refused" });
    }
    return result;
  }
}
