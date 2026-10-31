import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { identitySignInCommand, reachableFromContainer } from "./identity-signin";
import { runCommand } from "./run-command";

const homes: string[] = [];
afterEach(async () => {
  await Promise.all(homes.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
const home = async () => {
  const dir = await mkdtemp(join(tmpdir(), "aven-identity-"));
  homes.push(dir);
  return dir;
};

const CLI = join(import.meta.dir, "../../../apps/runtime/sandbox-image/aven");
const file = (dir: string) => join(dir, ".config", "aven", "identity");

// Runs the command as the container would: a shell in a home of its own.
async function signIn(dir: string, ...args: Parameters<typeof identitySignInCommand>) {
  const { script, env } = identitySignInCommand(...args);
  const result = await runCommand(["sh", "-c", script], {
    env: { PATH: process.env.PATH, HOME: dir, ...env },
  });
  expect(result.stderr).toBe("");
  expect(result.code).toBe(0);
}

const aven = (dir: string, ...args: string[]) =>
  runCommand([CLI, ...args], { env: { PATH: process.env.PATH, HOME: dir } });

describe("reaching the control plane from a container", () => {
  test("a loopback address becomes the host's name, any other stays", () => {
    const host = "host.docker.internal";

    expect(reachableFromContainer("http://localhost:8000", host)).toBe(
      "http://host.docker.internal:8000",
    );
    expect(reachableFromContainer("http://127.0.0.1:8000/", host)).toBe(
      "http://host.docker.internal:8000",
    );
    expect(reachableFromContainer("https://aven.example", host)).toBe("https://aven.example");
  });
});

describe("signing a container in to mint identity tokens", () => {
  test("keeps the credential in a file only the container's user reads, and replaces it each run", async () => {
    const dir = await home();

    await signIn(dir, { credential: "avid_first" }, "https://aven.example", "host");
    expect(await readFile(file(dir), "utf8")).toBe(
      "AVEN_IDENTITY_URL='https://aven.example'\nAVEN_IDENTITY_CREDENTIAL='avid_first'\n",
    );
    expect((await stat(file(dir))).mode & 0o077).toBe(0);

    await signIn(dir, { credential: "avid_second" }, "https://aven.example", "host");
    expect(await readFile(file(dir), "utf8")).toContain("avid_second");
    expect(await readFile(file(dir), "utf8")).not.toContain("avid_first");
  });

  test("a run with no identity leaves none", async () => {
    const dir = await home();
    await signIn(dir, { credential: "avid_first" }, "https://aven.example", "host");

    await signIn(dir, undefined, "https://aven.example", "host");

    expect(await Bun.file(file(dir)).exists()).toBe(false);
  });
});

describe.skipIf(!Bun.which("jq") || !Bun.which("curl"))("aven id-token", () => {
  const asked: { authorization: string | null; body: unknown }[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const authorization = request.headers.get("authorization");
      asked.push({ authorization, body: await request.json() });
      if (authorization !== "Bearer avid_good") return new Response("no", { status: 401 });
      return Response.json({ token: "header.payload.signature" });
    },
  });
  afterEach(() => void (asked.length = 0));

  const signedIn = async (credential: string) => {
    const dir = await home();
    await signIn(dir, { credential }, `http://localhost:${server.port}`, "localhost");
    return dir;
  };

  test("prints the token alone, asking with the credential and the defaults", async () => {
    const result = await aven(await signedIn("avid_good"), "id-token", "--audience", "https://svc");

    expect(result.stdout).toBe("header.payload.signature\n");
    expect(asked).toEqual([
      {
        authorization: "Bearer avid_good",
        body: { audience: "https://svc", subjectScope: "thread", lifetime: 600 },
      },
    ]);
  });

  test("passes the scope and lifetime on", async () => {
    await aven(
      await signedIn("avid_good"),
      "id-token",
      "--audience",
      "a",
      "--subject-scope",
      "organization",
      "--lifetime",
      "3600",
    );

    expect(asked[0]!.body).toEqual({ audience: "a", subjectScope: "organization", lifetime: 3600 });
  });

  test("fails, printing nothing on stdout, when the control plane refuses", async () => {
    const result = await aven(await signedIn("avid_stale"), "id-token", "--audience", "a");

    expect(result.code).not.toBe(0);
    expect(result.stdout).toBe("");
  });

  test("says so when the run has no identity", async () => {
    const result = await aven(await home(), "id-token", "--audience", "a");

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("no identity");
    expect(asked).toHaveLength(0);
  });

  test("needs an audience and a numeric lifetime", async () => {
    const dir = await signedIn("avid_good");

    expect((await aven(dir, "id-token")).code).toBe(2);
    expect((await aven(dir, "id-token", "--audience", "a", "--lifetime", "soon")).code).toBe(2);
    expect(asked).toHaveLength(0);
  });
});
