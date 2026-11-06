import { cn } from "cn";
import { useEffect, useMemo, useRef } from "react";

import { orbShape, paintOrb, type Rgb } from "../orb-art";
import { tileColors, tileSeed } from "../tile";

type Props = {
  /** Picks the shape and colors, so a project keeps its own. */
  projectId: string;
  /** Its palette among the person's projects (`tilePalettes`), else the one its id hashes to. */
  palette?: number;
  /** While one of the project's threads runs the mark takes its colors and turns. */
  working?: boolean;
  className?: string;
};

const COLOR_MS = 450;

// What a color of the page is as red, green and blue: drawn on one pixel, since a token may be
// written in a color space a canvas does not hand back as text.
function resolveInk(element: Element): Rgb {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.fillStyle = getComputedStyle(element).color;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return [r!, g!, b!];
}

// A project as a small glass ring, drawn on a canvas and in the page's muted ink until a thread of
// the project works, when it fades into the project's colors and its inner rings turn. With reduced
// motion the colors show and nothing turns. It says nothing to a screen reader unless it is working:
// the name beside it does.
export function ProjectTile({ projectId, palette, working = false, className }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const shape = useMemo(() => orbShape(tileSeed(projectId)), [projectId]);
  const colors = tileColors(projectId, palette);
  const [first, second, third] = colors;
  // Where the colors and the rings are now: the next run of frames goes on from there, and a mark
  // that stops fades out turning, then stays as it was, so nothing jumps at either end.
  const color = useRef(0);
  const turned = useRef(0);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const size = Math.round(element.clientWidth * devicePixelRatio) || 32;
    element.width = element.height = size;
    let ink = resolveInk(element);
    const draw = () =>
      paintOrb(context, size, shape, {
        ink,
        colors: [first!, second!, third!],
        color: color.current,
        time: turned.current,
      });

    // A change of theme changes the ink; a mark at rest is drawn again then.
    let animating = false;
    const theme = new MutationObserver(() => {
      ink = resolveInk(element);
      if (!animating) draw();
    });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const target = working ? 1 : 0;
    if (still || (!working && color.current === 0)) {
      color.current = target;
      draw();
      return () => theme.disconnect();
    }

    // Working turns the rings for as long as it lasts; stopping fades the colors out while they
    // slow no further, then the loop ends.
    animating = true;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const step = Math.min((now - last) / 1000, 0.1);
      last = now;
      turned.current += step;
      color.current +=
        Math.sign(target - color.current) *
        Math.min((step * 1000) / COLOR_MS, Math.abs(target - color.current));
      draw();
      if (working || color.current > 0) frame = requestAnimationFrame(tick);
      else animating = false;
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      theme.disconnect();
    };
  }, [shape, first, second, third, working]);

  return (
    <canvas
      ref={canvas}
      role={working ? "img" : undefined}
      aria-label={working ? "Working" : undefined}
      aria-hidden={working ? undefined : true}
      className={cn("size-4 shrink-0 text-muted-foreground", className)}
    />
  );
}
