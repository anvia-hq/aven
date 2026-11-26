export function recordingContext() {
  const calls: string[] = [];
  const rounded = (value: number) => String(Math.round(value * 1e6) / 1e6 + 0);
  const round = (value: unknown) =>
    typeof value === "number"
      ? rounded(value)
      : String(value).replace(/-?\d+\.\d+(e-?\d+)?/g, (found) => rounded(Number(found)));
  const gradient = {
    addColorStop: (...stops: unknown[]) => calls.push(`stop ${stops.map(round).join(" ")}`),
  };
  const context = new Proxy(
    {},
    {
      get: (_, key) => {
        const name = String(key);

        if (name.startsWith("create")) {
          return (...args: unknown[]) => {
            calls.push(`${name} ${args.map(round).join(" ")}`);
            return gradient;
          };
        }

        return (...args: unknown[]) => calls.push(`${name} ${args.map(round).join(" ")}`);
      },
      set: (_, key, value) => {
        calls.push(`${String(key)}= ${round(value)}`);
        return true;
      },
    },
  ) as CanvasRenderingContext2D;
  return { context, calls };
}
