import type { AnyTool } from "@anvia/core";
import { ToolOutput } from "@anvia/core/tool";
import { errorMessage } from "@aven/agents/values";

import { connectMcpServers } from "./mcp-servers";
import type { McpNote } from "@aven/agents/types";
import type { McpConnectResult, RunMcpServer } from "@aven/protocol/types";
import type { ConnectedMcp, ConnectedMcpServer, MachineCall } from "./types";

type Normalized =
  | { type: "text"; value: string }
  | { type: "json"; value: unknown }
  | { type: "content"; value: Parameters<typeof ToolOutput.content>[0] };

type Offered = {
  results: McpConnectResult[];
  note: McpNote;
  servers: { id: string; name: string; tools: { name: string; definition: unknown }[] }[];
};

const outputOf = (output: Normalized) => {
  if (output.type === "text") return output.value;

  if (output.type === "content") return ToolOutput.content(output.value);

  return output.value;
};

const relayed = (name: string, definition: unknown, call: MachineCall): AnyTool => ({
  name,
  definition: () => definition as Awaited<ReturnType<AnyTool["definition"]>>,
  call: async (input) => outputOf((await call("mcp.call", { tool: name, input })) as Normalized),
});

export async function connectMachineMcp(
  configs: readonly RunMcpServer[],
  call: MachineCall,
): Promise<ConnectedMcp> {
  let offered: Offered;
  try {
    offered = (await call("mcp.connect", { servers: configs })) as Offered;
  } catch (error) {
    const reason = errorMessage(error);
    return {
      tools: [],
      servers: [],
      results: configs.map(({ id }) => ({ id, error: reason })),
      note: { servers: [], failed: configs.map(({ name }) => ({ name, reason })) },
      close: async () => undefined,
    };
  }
  const servers: ConnectedMcpServer[] = offered.servers.map(({ id, name, tools }) => ({
    id,
    name,
    tools: tools.map((tool) => relayed(tool.name, tool.definition, call)),
  }));
  return {
    tools: servers.flatMap((server) => server.tools),
    servers,
    results: offered.results,
    note: offered.note,
    close: () =>
      call("mcp.close").then(
        () => undefined,
        () => undefined,
      ),
  };
}

export function combineMcp(here: ConnectedMcp, machine: ConnectedMcp): ConnectedMcp {
  const taken = new Map<string, string>();
  for (const server of here.servers) {
    for (const tool of server.tools) taken.set(tool.name, server.name);
  }
  const kept: ConnectedMcpServer[] = [];
  const clashed = new Map<string, string>();
  for (const server of machine.servers) {
    const clash = server.tools.map((tool) => tool.name).find((name) => taken.has(name));

    if (clash !== undefined) {
      clashed.set(
        server.id,
        `Its tool ${clash} has the same name as a tool of the server ${taken.get(clash)}; rename one of the two servers`,
      );
      continue;
    }

    for (const tool of server.tools) taken.set(tool.name, server.name);
    kept.push(server);
  }
  const dropped = new Set(
    machine.servers.flatMap((server) => (clashed.has(server.id) ? [server.name] : [])),
  );
  const failed = [
    ...here.note.failed,
    ...machine.note.failed,
    ...machine.servers.flatMap((server) =>
      clashed.has(server.id) ? [{ name: server.name, reason: clashed.get(server.id)! }] : [],
    ),
  ];
  const servers = [...here.servers, ...kept];
  return {
    tools: servers.flatMap((server) => server.tools),
    servers,
    results: [
      ...here.results,
      ...machine.results.map((result) =>
        clashed.has(result.id) ? { id: result.id, error: clashed.get(result.id)! } : result,
      ),
    ],
    note: {
      servers: [
        ...here.note.servers,
        ...machine.note.servers.filter((server) => !dropped.has(server.name)),
      ],
      failed,
    },
    close: async () => {
      await Promise.all([here.close(), machine.close()]);
    },
  };
}

export async function connectMcpForMachine(
  configs: readonly RunMcpServer[],
  call: MachineCall | undefined,
): Promise<ConnectedMcp> {
  const onMachine = call ? configs.filter((config) => config.allowLocal) : [];
  const here = configs.flatMap((config) =>
    onMachine.includes(config) ? [] : [{ ...config, allowLocal: false }],
  );
  const [local, machine] = await Promise.all([
    connectMcpServers(here),
    call && onMachine.length ? connectMachineMcp(onMachine, call) : undefined,
  ]);
  return machine ? combineMcp(local, machine) : local;
}
