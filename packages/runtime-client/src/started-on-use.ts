// Wraps a sandbox's runtime or desktop so that each call first has the container started, when it
// is not running. A bot's computer is made this way (decision 0059): most of what a bot does is
// talk, and a desktop is not worth starting for that. `start` must be safe to call at any time and
// to await in several places at once.
export function startedOnUse<T extends object>(target: T, start: () => Promise<void>): T {
  return new Proxy(target, {
    get(object, property) {
      const value = Reflect.get(object, property, object);
      if (typeof value !== "function") return value;
      // A stream is an async iterator, not a promise: it starts the container, then streams.
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
