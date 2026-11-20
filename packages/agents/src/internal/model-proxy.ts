import type { CompletionModel } from "@anvia/core";

type MethodCall = (...args: unknown[]) => unknown;

type MethodOverrides = Partial<
  Record<PropertyKey, (call: MethodCall, ...args: unknown[]) => unknown>
>;

export function proxyCompletionModel<T extends CompletionModel>(
  model: T,
  overrides: MethodOverrides,
): T {
  return new Proxy(model, {
    get(target, key) {
      const value: unknown = target[key as keyof typeof target];

      if (typeof value !== "function") return value;

      const override = overrides[key];

      if (override) {
        const call: MethodCall = (...args) =>
          (value as (...args: unknown[]) => unknown).apply(target, args);
        return (...args: unknown[]) => override(call, ...args);
      }

      return value.bind(target);
    },
  });
}
