import { Elysia, type AnyElysia } from "elysia";

import { db } from "@aven/db/client";
import { WIRE_VERSION } from "@aven/protocol/runtime-wire";
import type { ControlPlaneToRuntime } from "@aven/protocol/types";
import { errorsRouter } from "@aven/server-kit/errors";

import { createMemoryStore } from "../memory-store";
import { connectRouter } from "../modules/runtimes/connect";
import { RuntimeHub } from "../modules/runtimes/hub";
import { runtimesService } from "../modules/runtimes/service";
import { threadsService } from "../modules/threads/service";
import { seedProject } from "./seed-project";
import { signUp } from "./sign-up";

export function answerCalls(
  accepts: (method: string) => boolean,
  answer: (method: string, params: unknown) => { ok: boolean; result?: unknown; error?: string },
) {
  return (event: MessageEvent, runner: WebSocket) => {
    const message = JSON.parse(String(event.data)) as ControlPlaneToRuntime;

    if (message.type !== "call" || !accepts(message.method)) return;

    runner.send(
      JSON.stringify({ type: "reply", id: message.id, ...answer(message.method, message.params) }),
    );
  };
}

export async function runnerRig(router: (hub: RuntimeHub) => AnyElysia) {
  const hub = new RuntimeHub(createMemoryStore(db));
  const server = new Elysia()
    .use(errorsRouter)
    .use(connectRouter(hub))
    .use(router(hub))
    .listen({ port: 0 });
  const base = `localhost:${server.server?.port}`;
  const sockets: WebSocket[] = [];
  const owner = await signUp("owner");
  const outsider = await signUp("outsider");

  const until = async (check: () => boolean, ms = 3000) => {
    const deadline = Date.now() + ms;
    while (!check()) {
      if (Date.now() > deadline) throw new Error("timed out");

      await Bun.sleep(20);
    }
  };

  return {
    base,
    owner,
    outsider,
    until,
    track(socket: WebSocket) {
      sockets.push(socket);
    },
    async threadOnRunner(onMessage: (event: MessageEvent, runner: WebSocket) => void) {
      const { runtime, token } = await runtimesService.create(owner.organizationId, owner.userId, {
        name: "r",
      });
      const { project } = await seedProject(
        owner.organizationId,
        owner.userId,
        runtime.id,
        `proj-${crypto.randomUUID().slice(0, 8)}`,
      );
      const thread = await threadsService.create(owner.organizationId, owner.userId, {
        projectId: project.id,
      });
      const init = { headers: { authorization: `Bearer ${token}` } };
      const runner = new WebSocket(`ws://${base}/connect`, init as unknown as string[]);
      runner.binaryType = "arraybuffer";
      sockets.push(runner);
      runner.onmessage = (event) => onMessage(event, runner);
      await new Promise<void>((resolve, reject) => {
        runner.onopen = () => {
          runner.send(JSON.stringify({ type: "hello", version: WIRE_VERSION }));
          resolve();
        };
        runner.onerror = () => reject(new Error("runtime could not connect"));
      });
      await until(() => hub.isOnline(runtime.id));
      return { thread };
    },
    async stop() {
      for (const socket of sockets) socket.close();
      await server.stop(true);
      await owner.remove();
      await outsider.remove();
    },
  };
}
