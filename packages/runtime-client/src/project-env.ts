import type { SandboxRuntime } from "@anvia/sandbox";
import type { RunEnvVar } from "@aven/protocol/runtime-wire";

type Env = Readonly<Record<string, string>>;

export const envOf = (variables: readonly RunEnvVar[] | undefined): Env =>
  Object.fromEntries((variables ?? []).map(({ name, value }) => [name, value]));

export function withProjectEnv(sandbox: SandboxRuntime, current: () => Env | undefined) {
  const merged = <T extends { env?: Env }>(options: T): T => {
    const project = current();
    return project && Object.keys(project).length > 0
      ? { ...options, env: { ...project, ...options.env } }
      : options;
  };
  return new Proxy(sandbox, {
    get(target, property) {
      if (property === "exec" || property === "execStream" || property === "startProcess") {
        return (options: Parameters<SandboxRuntime[typeof property]>[0]) =>
          target[property](merged(options));
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
