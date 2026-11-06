import { cn } from "cn";
import { useEffect, useMemo, useRef } from "react";

import { orbShape, paintOrb } from "../orb-art";
import { tileColors, tileSeed } from "../tile";
import { onThemeChange, resolveInk } from "./project-ink";

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
    let size = 0;
    let ink = resolveInk(element);
    const draw = () =>
      paintOrb(context, size, shape, {
        ink,
        colors: [first, second, third],
        color: color.current,
        time: turned.current,
      });
    // The canvas is as sharp as the pixels it is shown in, so it follows its size (and the screen's
    // density), and is drawn again then, as it is with a change of theme: a mark at rest only
    // changes for those, a working one every frame.
    let animating = false;
    const redraw = () => {
      if (!animating) draw();
    };
    const measure = () => {
      size = Math.max(Math.round(element.clientWidth * devicePixelRatio), 1);
      element.width = element.height = size;
      redraw();
    };
    const sized = new ResizeObserver(measure);
    sized.observe(element);
    const unthemed = onThemeChange(() => {
      ink = resolveInk(element);
      redraw();
    });
    const stop = () => {
      sized.disconnect();
      unthemed();
    };
    measure();

    const target = working ? 1 : 0;
    if (still || (!working && color.current === 0)) {
      color.current = target;
      draw();
      return stop;
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
      stop();
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
