import type { Rgb } from "../orb-art";

const known = new Map<string, Rgb>();
const scratch = document.createElement("canvas");
scratch.width = scratch.height = 1;

export function resolveInk(element: Element): Rgb {
  const css = getComputedStyle(element).color;
  const cached = known.get(css);
  if (cached) return cached;
  const context = scratch.getContext("2d", { willReadFrequently: true })!;
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = css;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  const ink: Rgb = [r!, g!, b!];
  known.set(css, ink);
  return ink;
}

const listeners = new Set<() => void>();
const theme = new MutationObserver(() => listeners.forEach((listener) => listener()));

export function onThemeChange(listener: () => void) {
  if (listeners.size === 0) {
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) theme.disconnect();
  };
}
