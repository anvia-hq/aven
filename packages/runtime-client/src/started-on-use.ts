export function startedOnUse<T extends object>(target: T, start: () => Promise<void>): T {
  return new Proxy(target, {
    get(object, property) {
      const value = Reflect.get(object, property, object);

      if (typeof value !== "function") return value;

      if (property === "execStream") {
        return async function* (...args: unknown[]) {
          await start();
          yield* value.apply(object, args);
        };
      }

      return async (...args: unknown[]) => {
        await start();
        return value.apply(object, args);
      };
    },
  });
}
